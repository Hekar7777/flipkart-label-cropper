# Google Search Console — one-time setup & weekly routine

Domain: `flipkartlabelcropper.in`.

Every page declares that exact URL as canonical, and `sitemap.xml` / `robots.txt` are built
from it, so verify this domain — not whichever alias happens to redirect to it.

---

## Part 1 — Verify the domain (DNS TXT method, ~10 minutes + waiting)

1. Open <https://search.google.com/search-console> and sign in with the Google account you want to own the site.
2. Choose **Domain property** (not URL prefix). Enter: `flipkartlabelcropper.in`.
   - Why Domain: it covers http/https, all subdomains, and both domains' records in one property. The URL-prefix
     method can't do that.
3. Google shows a **TXT record**: something like `google-site-verification=AbC123...`.
   Keep that page open.
4. In your DNS provider (wherever flipkartlabelcropper.in's nameservers point — Cloudflare/GoDaddy/Namecheap/etc.):

   | Field  | Value                                          |
   |--------|------------------------------------------------|
   | Type   | `TXT`                                          |
   | Name   | `@` (the apex/root — some panels pre-fill it)  |
   | Value  | `google-site-verification=AbC123...` (copy exactly) |
   | TTL    | default (or 3600)                              |

   Save the record.
5. Back in Search Console, press **Verify**.
   - If it fails: DNS propagation can take from a few minutes up to 48 h. Wait an hour, retry. Don't delete the
     record afterwards — Google re-checks it periodically; removing it un-verifies the property.
6. If you also own an alias domain (for example `flipkartlabelcrop.com`) that redirects here, add a **separate Domain
   property** for it too (separate TXT record — Google gives a different token). You will never look at it day to day,
   but if it ever un-verifies or its redirect breaks you will see it in GSC instead of finding out from lost traffic.

**Already prepared in the code:** the page also supports the HTML `<meta>` verification tag. Build with:

```
npm run build -- --url https://flipkartlabelcropper.in --email hi@flipkartlabelcropper.in --gsc <token-from-google>
```

The `--gsc` flag injects the verification `<meta>` into every page of `dist/`. Do **one** method or **both** — both
is actually recommended (DNS for the domain property, meta tag as a fallback Google can also see).

## Part 2 — Submit the sitemap

1. In Search Console, left sidebar → **Sitemaps**.
2. Enter: `sitemap.xml` → **Submit**.
3. Status should show "Success" within a day or two; "Discovered URLs" should reach 4 (index, guide, privacy, terms —
   more once the new content pages go live; `sitemap.xml` already ships with the repo and gets rebuilt with correct
   dates by the build).

Notes:
- `robots.txt` already exists at the domain root and points crawlers at the sitemap — nothing to change.
- If you later add pages (e.g. the supporting articles proposed separately), add one `<url>` block per page and bump
  its `<lastmod>`; the SEO checker (`npm run check`) validates the sitemap stays in step with real files.

## Part 3 — Weekly check (10 minutes, manual, no scripts)

**Every Monday (or any fixed day):**

1. **Overview page** — open <https://search.google.com/search-console>, select the domain property.
   Look at the top-left graph and the "Pages / Indexing" card. You're looking for *sudden* drops or a red spike in
   "Page indexing issues".
2. **Pages report** (Indexing → Pages):
   - "Why pages aren't indexed" table — new entries with real counts are worth a click. ` Crawled - currently not
     indexed` or `Duplicate without canonical` on 1–2 pages is normal for a 4-page site; a growing count is not.
   - Check the sitemap count matches (Submitted / Indexed).
3. **Core Web Vitals** (Experience → Core Web Vitals): needs ~28 days of CrUX data, so it only shows once traffic
   exists. When it appears, act on anything "Needs improvement".
4. **Manual actions / Security issues** (sidebar): confirm both say "No issues". Takes 5 seconds; catches disasters.
5. **Performance** (Results): filter by Query, last 28 days vs previous period.
   - Queries where you get impressions but low position = content opportunities (feed these into new FAQ/article
     sections).
   - Queries with position < 10 and decent impressions = on-page tweaks (title/H1/first paragraph) pay off fastest.
6. **URL Inspection** (top search bar): paste `https://flipkartlabelcropper.in/` → **Test live URL** whenever you
   deploy a significant change, then press **Request indexing** for the home page. That's the only "push" you should
   ever need; Google re-crawls the rest on its own.

That's the whole routine: Overview → Pages → CWV → Manual actions → Performance → occasional URL Inspection.
No scraping, no scripts, nothing to maintain.

---

## Analytics — GA4 (chosen)

The site ships with consent-gated GA4 built in (the tag only loads after the cookie banner is accepted, matching the
ad setup). To turn it on:

1. Create a GA4 property at <https://analytics.google.com> → Admin → **Create property**. Data streams → Web →
   enter `https://flipkartlabelcropper.in`. Copy the Measurement ID (`G-XXXXXXXXXX`).
2. Build the site with your real ID:

   ```
   npm run build -- --url https://flipkartlabelcropper.in --email hi@flipkartlabelcropper.in \
     --adsense ca-pub-XXXXXXXXXXXXXXXX \
     --slot-sidebar-left XXXXXXXXXX --slot-sidebar XXXXXXXXXX \
     --slot-inarticle XXXXXXXXXX --slot-footer XXXXXXXXXX \
     --ga4 G-XXXXXXXXXX
   ```

   There are four ad placements: a skyscraper in each rail (`--slot-sidebar-left` and `--slot-sidebar`) and the
   in-article and footer bands. Any slot you leave out stays hidden. With no publisher ID at all, the rails carry a
   quiet placeholder and the work column centres at 1080px; configuring an ID brings the rails back at ±160px, which is
   a 85px change in column width, not a reflow of the tool.

3. Custom events already wired in the page (visible in GA4 → Reports → Engagement → Events within ~24 h):
   | Event         | Params                 | Fires when                                   |
   |---------------|------------------------|----------------------------------------------|
   | `crop`        | `files`, `pages`, `output` | a batch finishes processing              |
   | `download`    | `mode`, `crops`, `four_up` | the batch PDF downloads (or per-file mode) |
   | `output_mode` | `mode`                 | the visitor changes the Output selector      |

   `four_up` reports `on`/`off`, so you can see how many sellers print labels on A4 rather than a thermal roll. The
   4-up switch itself is the `cfgFourUp` checkbox, in the crop controls above the file list.

   GA4 records custom events automatically — no "create event" step needed to *see* the numbers. To use them as
   conversions later: Admin → Events → mark as key event.

## Lighthouse / PageSpeed

Run it yourself against the live site: <https://pagespeed.web.dev/> → enter the URL. The dev copy can't be meaningfully
scored (localhost + placeholder tokens), and scores drift, so treat the live run as the source of truth. The page is
already in good shape for it: deferred libraries, preconnects, no render-blocking CSS beyond one inline sheet,
system fonts fallback, and zero layout shift by design. If the live run flags something, fix it before the next deploy.
