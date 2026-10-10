#!/usr/bin/env node
/**
 * Technical SEO checker for Flipkart Label Cropper. Zero dependencies.
 *
 * Not a substitute for a crawl of the live site, but it catches the mechanical
 * mistakes that are easy to introduce and painful to find in production:
 * duplicate titles, missing or over-long descriptions, missing canonicals,
 * heading-level skips, unparseable JSON-LD, missing social metadata, and
 * internal links that point at files which do not exist.
 *
 * Run:  node dev-test/check-seo.js            (checks the source files)
 *       node dev-test/check-seo.js dist       (checks a built folder)
 *
 * Exit code is 1 if any ERROR was found, 0 otherwise.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGET = path.resolve(ROOT, process.argv[2] || '.');

const PAGES = ['index.html', 'guide.html', 'privacy.html', 'terms.html', '404.html'];
const NOINDEX_OK = new Set(['404.html']); // these are allowed to be noindex

const problems = [];
const notes = [];

function err(file, msg) { problems.push({ level: 'ERROR', file, msg }); }
function warn(file, msg) { problems.push({ level: 'warn', file, msg }); }

// --- tiny HTML helpers -----------------------------------------------------

function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'));
  return m ? m[1] : null;
}

function metaContent(html, predicate) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const name = attr(tag, 'name') || attr(tag, 'property');
    if (name && predicate(name.toLowerCase())) return attr(tag, 'content') || '';
  }
  return null;
}

function linkHref(html, rel) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if ((attr(tag, 'rel') || '').toLowerCase() === rel) return attr(tag, 'href') || '';
  }
  return null;
}

// --- per-page checks -------------------------------------------------------

const seen = { titles: new Map(), descriptions: new Map(), canonicals: new Map() };

for (const page of PAGES) {
  const file = path.join(TARGET, page);
  if (!fs.existsSync(file)) { err(page, 'missing from the build'); continue; }
  const html = fs.readFileSync(file, 'utf8');

  // Title
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) err(page, 'no <title>');
  else {
    const title = titleMatch[1].replace(/\s+/g, ' ').trim();
    if (title.length < 15) err(page, `title is very short (${title.length} chars)`);
    if (title.length > 65) warn(page, `title is ${title.length} chars - may be truncated in results`);
    if (seen.titles.has(title)) err(page, `duplicate title, also used by ${seen.titles.get(title)}`);
    seen.titles.set(title, page);
  }

  // Description
  const desc = metaContent(html, (n) => n === 'description');
  if (!desc) err(page, 'no meta description');
  else {
    if (desc.length < 50) warn(page, `description is short (${desc.length} chars)`);
    if (desc.length > 160) warn(page, `description is ${desc.length} chars - will be truncated`);
    if (seen.descriptions.has(desc)) err(page, `duplicate description, also used by ${seen.descriptions.get(desc)}`);
    seen.descriptions.set(desc, page);
  }

  // Indexability - checked before canonical, because a noindex page (like the
  // 404) correctly has no canonical: there is no "preferred" version of a URL
  // that should never be indexed in the first place.
  const robots = metaContent(html, (n) => n === 'robots') || '';
  const isNoindex = /noindex/.test(robots);

  // Canonical
  const canonical = linkHref(html, 'canonical');
  if (!canonical) {
    if (!isNoindex && !NOINDEX_OK.has(page)) err(page, 'no canonical URL');
  } else {
    if (seen.canonicals.has(canonical)) err(page, `duplicate canonical, also used by ${seen.canonicals.get(canonical)}`);
    seen.canonicals.set(canonical, page);
  }

  if (NOINDEX_OK.has(page)) {
    if (!/noindex/.test(robots)) warn(page, 'expected noindex on this page');
  } else if (/noindex/.test(robots)) {
    err(page, 'marked noindex but is a page we want indexed');
  }
  // Thumbnail and og:url hints only matter for pages that can actually be
  // indexed and shared, so a noindex page is exempt from both.
  if (!isNoindex && !/max-image-preview:large/.test(robots)) {
    warn(page, 'no max-image-preview:large in robots meta (needed for large thumbnails)');
  }

  // Social metadata
  const ogRequired = ['og:title', 'og:description', 'og:image', 'og:type'];
  if (!isNoindex) ogRequired.push('og:url');
  for (const prop of ogRequired) {
    if (!metaContent(html, (n) => n === prop)) err(page, `missing ${prop}`);
  }
  const twitterCard = metaContent(html, (n) => n === 'twitter:card');
  if (!twitterCard) warn(page, 'missing twitter:card');
  else if (twitterCard === 'summary') notes.push(`${page}: twitter:card is 'summary'; summary_large_image suits a 1200x630 image`);

  // Language + viewport
  if (!/<html[^>]+lang=/i.test(html)) err(page, '<html> has no lang attribute');
  if (!/name="viewport"/i.test(html)) err(page, 'no viewport meta (mobile rendering)');

  // Headings. Note: an <h3> inside <summary> is legitimate heading content.
  const headings = (html.match(/<h([1-6])\b[^>]*>/gi) || []).map((t) => Number(t.match(/<h([1-6])/i)[1]));
  const h1Count = headings.filter((n) => n === 1).length;
  if (h1Count !== 1) err(page, `expected exactly one <h1>, found ${h1Count}`);
  if (!headings.includes(2) && page !== '404.html') warn(page, 'no <h2> on the page');
  let prev = 0;
  headings.forEach((level, i) => {
    if (prev && level > prev + 1) err(page, `heading level skipped: h${prev} -> h${level} (heading #${i + 1})`);
    prev = level;
  });

  // JSON-LD must parse
  const blocks = html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  blocks.forEach((block, i) => {
    const json = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      const parsed = JSON.parse(json);
      const types = parsed['@graph'] ? parsed['@graph'].map((n) => n['@type']) : [parsed['@type']];
      notes.push(`${page}: JSON-LD block ${i + 1} ok (${types.join(', ')})`);
    } catch (e) {
      err(page, `JSON-LD block ${i + 1} does not parse: ${e.message}`);
    }
  });

  // Internal links resolve to real files
  const hrefs = (html.match(/href="([^"]*)"/gi) || []).map((h) => h.slice(6, -1));
  for (const href of new Set(hrefs)) {
    if (!href || href.startsWith('#') || href.startsWith('data:') || href.startsWith('mailto:')) continue;
    if (/^https?:\/\//i.test(href)) {
      if (href.includes('example') || href.includes('your-domain')) warn(page, `placeholder URL in a link: ${href}`);
      continue;
    }
    if (href.includes('%%')) continue; // unsubstituted deploy token, checked separately
    const bare = href.split('#')[0].split('?')[0];
    if (!bare) continue;
    let target;
    if (bare === '/' ) target = path.join(TARGET, 'index.html');
    else if (bare.startsWith('/')) target = path.join(TARGET, bare.slice(1));
    else target = path.join(path.dirname(file), bare);
    if (!fs.existsSync(target)) {
      // allow extension-less clean URLs that a host may map (e.g. /guide -> guide.html)
      if (fs.existsSync(target + '.html')) target = target + '.html';
      else { err(page, `internal link points at a missing file: ${href}`); continue; }
    }

    // A fragment that does not exist silently drops the visitor at the top of
    // the page instead of the section - easy to cause by renaming a heading.
    const frag = href.split('#')[1];
    if (frag) {
      const targetHtml = fs.readFileSync(target, 'utf8');
      const ids = new Set([...targetHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
      const names = new Set([...targetHtml.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
      if (!ids.has(frag) && !names.has(frag)) {
        err(page, `link fragment #${frag} does not exist in ${path.basename(target)}`);
      }
    }
  }

  // Unsubstituted deploy tokens are normal in the source tree but must never
  // reach the built output. Note the character class includes digits: a regex
  // of [A-Z_] silently misses token names like %%GA4_ID%%, which is exactly how an
  // unsubstituted placeholder once shipped.
  const tokens = html.match(/%%[A-Z0-9_]+%%/g);
  if (tokens) {
    const list = [...new Set(tokens)].join(' ');
    if (TARGET === ROOT) notes.push(`${page}: ${[...new Set(tokens)].length} placeholder token(s) - expected in source`);
    else err(page, `unsubstituted placeholder token(s) in the build: ${list}`);
  }
}

// --- cross-file checks -----------------------------------------------------

const sitemapPath = path.join(TARGET, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) err('sitemap.xml', 'no <loc> entries');
  for (const loc of locs) {
    const slug = loc.replace(/\/$/, '').split('/').pop() || 'index.html';
    const asFile = slug.includes('.') ? slug : 'index.html';
    if (!fs.existsSync(path.join(TARGET, asFile)) && !fs.existsSync(path.join(TARGET, 'index.html'))) {
      err('sitemap.xml', `entry does not match a file: ${loc}`);
    }
  }
  for (const page of PAGES) {
    if (NOINDEX_OK.has(page)) {
      if (locs.some((l) => l.endsWith(page))) err('sitemap.xml', `${page} is noindex and must not be in the sitemap`);
      continue;
    }
    if (!locs.some((l) => l.endsWith(page) || (page === 'index.html' && l.endsWith('/')))) {
      err('sitemap.xml', `${page} is indexable but missing from the sitemap`);
    }
  }
  // Unsubstituted tokens are expected in the source tree; they are only a
  // problem in the built output, which is what actually gets deployed.
  if (locs.some((l) => l.includes('%%'))) {
    const msg = 'domain token not substituted';
    if (TARGET === ROOT) notes.push(`sitemap.xml: ${msg} (expected in source; use dist/ for the real check)`);
    else err('sitemap.xml', msg);
  }
} else {
  err('sitemap.xml', 'missing');
}

const robotsPath = path.join(TARGET, 'robots.txt');
if (fs.existsSync(robotsPath)) {
  const txt = fs.readFileSync(robotsPath, 'utf8');
  if (!/Sitemap:/i.test(txt)) err('robots.txt', 'no Sitemap: line');
  if (/Disallow:\s*\/assets\//i.test(txt)) err('robots.txt', 'blocking /assets/ - Google cannot render the page without CSS');
  if (/User-agent:\s*\*\s*\nDisallow:\s*\/\s*$/im.test(txt)) warn('robots.txt', 'site-wide Disallow present');
} else {
  err('robots.txt', 'missing');
}

for (const asset of ['assets/og-image.png', 'assets/site.css']) {
  if (!fs.existsSync(path.join(TARGET, asset))) err(asset, 'referenced by meta tags / pages but missing');
}

// --- report ----------------------------------------------------------------

const errs = problems.filter((p) => p.level === 'ERROR');
const warns = problems.filter((p) => p.level === 'warn');

console.log('');
console.log('  SEO check — ' + TARGET);
console.log('  ' + '='.repeat(52));

if (!errs.length && !warns.length) console.log('\n  No issues found.\n');

for (const p of errs) console.log(`  ERROR  ${p.file}: ${p.msg}`);
for (const p of warns) console.log(`  warn   ${p.file}: ${p.msg}`);

if (process.env.SEO_VERBOSE) {
  console.log('\n  Notes');
  for (const n of notes) console.log('    - ' + n);
}

console.log(`\n  ${errs.length} error(s), ${warns.length} warning(s)\n`);
process.exit(errs.length ? 1 : 0);
