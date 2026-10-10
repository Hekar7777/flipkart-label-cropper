# Flipkart Label Cropper

Splits a Flipkart combined shipping document — the shipping label and the tax invoice that
come stapled together on one PDF page — into separate, tightly cropped PDFs you can print on
a thermal roll or pack into A4 sheets.

Everything runs in the browser. The PDFs are never uploaded anywhere: pdf.js reads the pages
and pdf-lib writes the output, both loaded from a CDN. There is no backend, no account, and
no dependency to install.

- **Live site:** <https://flipkartlabelcropper.in>
- Not affiliated with, endorsed by, or connected to Flipkart. See `privacy.html` and `terms.html`.

## Repository layout

| Path | What it is |
|------|------------|
| `index.html` | The whole tool — UI, styles and crop logic in one self-contained file |
| `guide.html`, `privacy.html`, `terms.html`, `404.html` | The supporting pages |
| `assets/site.css` | Shared styles for the supporting pages |
| `assets/og-image.png` | 1200×630 social card used by `og:image` |
| `robots.txt`, `sitemap.xml`, `ads.txt` | Crawler and ad-serving files, served from the root |
| `scripts/dev-server.js` | Zero-dependency static server for local work |
| `scripts/build-site.js` | Publish builder — fills in `%%PLACEHOLDER%%` tokens, writes `dist/` |
| `dev-test/` | Fixture generator, SEO checker and throwaway UI harnesses. Never published |
| `vercel.json` | Deploy config: build command, output directory, redirects, headers |
| `GSC-SETUP.md`, `SEO-PLAN.md` | Ops notes — Search Console routine, keyword plan |

## Local development

```bash
npm run dev          # http://localhost:5174  (--port 4000, --open also work)
npm run fixtures     # regenerate dev-test/*.pdf samples if they are missing
```

The default port is deliberately 5174 rather than 5173, which Vite-based projects tend to
claim. There is no build step for the app itself — `index.html` is the app.

## Checks

```bash
npm run check        # SEO/meta/sitemap checks against the source pages
npm run build -- --url https://flipkartlabelcropper.in --email hi@flipkartlabelcropper.in
npm run check:dist   # the same checks against the built output in dist/
```

`check` and `check:dist` must both report 0 errors and 0 warnings before a deploy.

## Building

`npm run build` copies the publishable files into `dist/` and substitutes the tokens that
must not ship as literal placeholders:

```bash
npm run build -- \
  --url https://flipkartlabelcropper.in \
  --email hi@flipkartlabelcropper.in
```

Optional flags, each inert until supplied: `--adsense ca-pub-…`, `--slot-sidebar`,
`--slot-sidebar-left`, `--slot-inarticle`, `--slot-footer`, `--ga4 G-…`, `--gsc <token>`.

`dist/` is generated, git-ignored, and rebuilt on every deploy — never edit it or commit it.
On Vercel the exact command above is the `buildCommand` in `vercel.json`, so a push rebuilds
the site with the real domain baked into the canonical tags, OG tags and sitemap.

## Deploying

The project deploys to Vercel from Git. `vercel.json` holds the build command, the output
directory (`dist`), the redirects and the response headers, so Vercel needs no manual build
settings — importing the repository is enough.

Two things worth knowing:

- **Vercel does not read `_redirects` or `_headers`.** Those files are for Netlify and
  Cloudflare Pages and are still shipped in `dist/` for portability, but the rules Vercel
  actually applies are the ones in `vercel.json`. Change both if you change one.
- **`404.html` is used automatically** for unknown paths, and `_redirects`' rules are
  mirrored in `vercel.json` so `/index.html`, `/index` and `/about.html` each 301 once.

To serve the custom domain: add it in the Vercel project under **Settings → Domains**, then
point the `A`/`CNAME` records at Vercel from the DNS provider. `https://flipkartlabelcropper.in`
is the URL the pages declare as canonical, so the domain must match exactly or the canonical
tags will point somewhere else.
