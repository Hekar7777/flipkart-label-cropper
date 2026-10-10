#!/usr/bin/env node
/**
 * Publish builder for Flipkart Label Cropper. Zero dependencies, no bundling.
 *
 * Two jobs:
 *   1. Fill in the %%PLACEHOLDER%% tokens (domain, contact email, publisher ID)
 *      so you never publish a page with a literal placeholder in it.
 *   2. Emit a clean dist/ containing ONLY the files a visitor should be able to
 *      reach - no dev-test fixtures, no dev server, no node_modules.
 *
 * Usage:
 *   npm run build -- --url https://flipkartlabelcropper.in --email hi@flipkartlabelcropper.in
 *   npm run build -- --url https://flipkartlabelcropper.in --adsense ca-pub-1234567890123456
 *     optional slots: --slot-sidebar-left, --slot-sidebar, --slot-inarticle,
 *                     --slot-footer (any slot left out stays hidden)
 *   npm run build                      # still writes dist/, warns about tokens
 *
 * The live site is built on Vercel from Git (see vercel.json), which runs exactly
 * the build command above on every push. dist/ can also be uploaded by hand to
 * Netlify / Cloudflare Pages, or served from a GitHub Pages branch.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// Files that get copied to dist/, in the order they are reported.
const FILES = [
  'index.html',
  'guide.html',
  'privacy.html',
  'terms.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'ads.txt',
  // Host configuration. GitHub Pages ignores the first two and .nojekyll is what
  // tells it to serve files verbatim rather than running Jekyll over them.
  '_redirects',
  '_headers',
  '.nojekyll',
];
const DIRS = ['assets'];

const TOKENS = {
  SITE_URL: '--url',
  CONTACT_EMAIL: '--email',
  ADSENSE_CLIENT: '--adsense',
  AD_SLOT_SIDEBAR: '--slot-sidebar',
  AD_SLOT_SIDEBAR_LEFT: '--slot-sidebar-left',
  AD_SLOT_INARTICLE: '--slot-inarticle',
  AD_SLOT_FOOTER: '--slot-footer',
  GA4_ID: '--ga4',
};

// Placeholders that must resolve to something, or the built page is wrong.
const REQUIRED = ['SITE_URL', 'CONTACT_EMAIL'];

const argv = process.argv.slice(2);
function arg(name) {
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const p = argv.find((a) => a.startsWith(name + '='));
  return p ? p.slice(name.length + 1) : null;
}

let outDir = arg('--out') || 'dist';
if (!path.isAbsolute(outDir)) outDir = path.join(ROOT, outDir);

// ---------------------------------------------------------------------------

function log(s) { process.stdout.write(s + '\n'); }

function normaliseUrl(input) {
  let u = String(input).trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

const values = {};
for (const [token, flag] of Object.entries(TOKENS)) {
  const raw = arg(flag);
  if (raw != null && raw !== '') values[token] = token === 'SITE_URL' ? normaliseUrl(raw) : String(raw).trim();
}

// Ad tokens default to an empty string: an unconfigured ad slot is then simply
// not rendered, which is the correct behaviour before AdSense approval.
for (const t of Object.keys(TOKENS)) {
  if (!(t in values) && !REQUIRED.includes(t)) values[t] = '';
}

/*
 * ads.txt needs a slightly different form of the publisher ID (pub-XXXX,
 * without the ca- prefix), and it must never contain a *wrong* live line:
 * authorising the wrong seller can reduce revenue or trigger a warning in
 * AdSense. So with no publisher ID configured we emit a commented-out line
 * instead of an invalid one.
 */
/*
 * Analytics: a GA4 measurement ID is optional and inert without it. The provider
 * is switched on only when a plausible G- id is supplied, so the page never
 * ships a half-configured tracker.
 */
values.GA4_PROVIDER = /^G-[A-Z0-9]{6,}$/.test(String(values.GA4_ID || '')) ? 'ga4' : 'none';
if (!values.GA4_PROVIDER || values.GA4_PROVIDER === 'none') values.GA4_ID = '';

/*
 * Search Console verification. An empty <meta name="google-site-verification">
 * is noise, and a made-up token would be worse, so without a real value the
 * placeholder collapses to an explanatory HTML comment.
 */
const gscToken = String(arg('--gsc') || '').trim();
values.GSC_META = gscToken
  ? `<meta name="google-site-verification" content="${gscToken.replace(/"/g, '')}" />`
  : '<!-- google-site-verification not configured; add one with: npm run build -- --gsc <token> -->';

const publisherId = String(values.ADSENSE_CLIENT || '').replace(/^ca-/, '');
const adsTxtLive = /^pub-\d{10,20}$/.test(publisherId);
values.ADS_TXT_LINE = adsTxtLive
  ? `google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`
  : '# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0   <-- fill in after AdSense approval';

// Token names may contain digits (%%GA4_ID%%, %%ADSENSE_CLIENT%%), so the character
// class must include 0-9. Omitting it silently leaves tokens in the output.
const TOKEN_RE = /%%([A-Z0-9_]+)%%/g;

function substitute(text) {
  /*
   * The Search Console placeholder lives inside an HTML comment in the source
   * (`<!-- %%GSC_META%% -->`). A bare token in <head> is not inert: the parser
   * treats it as flow content, closes <head>, opens <body> and renders the token
   * as visible text at the top of the page. So the comment itself is swapped for
   * the real <meta> tag (or an explanatory comment) before the generic pass.
   */
  const withGsc = text.split('<!-- %%GSC_META%% -->').join(values.GSC_META);
  return withGsc.replace(TOKEN_RE, (whole, name) => (name in values ? values[name] : whole));
}

function copyInto(relFile) {
  const src = path.join(ROOT, relFile);
  const dst = path.join(outDir, relFile);
  const text = fs.readFileSync(src, 'utf8');
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, substitute(text));
  return text;
}

function copyDirInto(relDir) {
  const src = path.join(ROOT, relDir);
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      const buf = fs.readFileSync(full);
      const dst = path.join(outDir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, buf);
      out.push(rel);
    }
  })(src);
  return out;
}

// --- validation ------------------------------------------------------------

const problems = [];
if (!values.SITE_URL) problems.push('no --url given, so %%SITE_URL%% is still in the output');
else if (!/^https:\/\/[^/]+$/.test(values.SITE_URL)) problems.push(`site url looks unusual: ${values.SITE_URL}`);
if (!values.CONTACT_EMAIL) problems.push('no --email given, so %%CONTACT_EMAIL%% is still in the output');
else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.CONTACT_EMAIL)) problems.push(`email looks invalid: ${values.CONTACT_EMAIL}`);

if (values.ADSENSE_CLIENT && !/^ca-pub-\d{10,20}$/.test(values.ADSENSE_CLIENT)) {
  problems.push(`AdSense client should look like ca-pub-0000000000000000, got: ${values.ADSENSE_CLIENT}`);
}

// --- build -----------------------------------------------------------------

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

log('');
log('  Flipkart Label Cropper build');
log('  ----------------');

let leftover = 0;
const written = [];

for (const f of FILES) {
  if (!fs.existsSync(path.join(ROOT, f))) { problems.push(`missing file: ${f}`); continue; }
  const original = copyInto(f);
  const remaining = substitute(original).match(TOKEN_RE);
  if (remaining) {
    leftover += remaining.length;
    problems.push(`${f} still contains ${[...new Set(remaining)].join(', ')}`);
  }
  written.push(f);
}

for (const d of DIRS) {
  if (!fs.existsSync(path.join(ROOT, d))) continue;
  written.push(...copyDirInto(d));
}

log(`  Output:   ${outDir}`);
log(`  Files:    ${written.length}`);
for (const f of written) log(`            ${f}`);

if (values.SITE_URL) log(`  Domain:   ${values.SITE_URL}`);
if (values.CONTACT_EMAIL) log(`  Contact:  ${values.CONTACT_EMAIL}`);

if (values.GA4_PROVIDER === 'ga4') {
  log(`  Analytics: GA4 ${values.GA4_ID} (loaded only after consent)`);
} else {
  log('  Analytics: off (no GA4 measurement id given)');
}
log(gscToken
  ? '  Search Console: verification meta tag written'
  : '  Search Console: no token given, placeholder left as a comment');

if (adsTxtLive) {
  log(`  Ads:      AdSense ${values.ADSENSE_CLIENT}`);
  log(`  ads.txt:  live line written for ${publisherId}`);
  const slotTokens = ['AD_SLOT_SIDEBAR_LEFT', 'AD_SLOT_SIDEBAR', 'AD_SLOT_INARTICLE', 'AD_SLOT_FOOTER'];
  const missingSlots = slotTokens.filter((t) => !values[t]);
  log(missingSlots.length
    ? `            slot ids missing for: ${missingSlots.map((t) => t.replace('AD_SLOT_', '').toLowerCase()).join(', ')} (those placements stay hidden)`
    : `            all ${slotTokens.length} placements configured`);
} else {
  log('  Ads:      off (no publisher id) - no third-party script is loaded');
  log('  ads.txt:  line commented out, so the file is inert until you add one');
}  log('');
  log('  Deliberately NOT copied: dev-test/, scripts/, .freebuff/, dist/');
  log('  (fixture PDFs and the dev server have no business on a public site)');

if (problems.length) {
  log('');
  log('  ⚠  Before you publish:');
  for (const p of [...new Set(problems)]) log(`     - ${p}`);
}

log('');
log('  Next steps');
log('  ----------');
if (!values.SITE_URL) log('  1. Re-run with your real domain:  npm run build -- --url https://your-domain.com --email you@your-domain.com');
if (leftover) log(`  ${values.SITE_URL ? '1' : '2'}. Fix the warnings above - "${'%%TOKEN%%'}" in a live page looks broken.`);
log('  ' + (values.SITE_URL ? '1' : '3') + '. Vercel rebuilds dist/ from Git on every push (to publish by hand, upload the');
log('     contents of dist/, not the folder itself).');
log('  ' + (values.SITE_URL ? '2' : '4') + '. Check https://your-domain.com/ads.txt loads, then verify the site in AdSense.');
log('  ' + (values.SITE_URL ? '3' : '5') + '. Submit https://your-domain.com/sitemap.xml in Google Search Console.');
log('');
