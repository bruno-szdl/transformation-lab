# SEO & Metadata Setup for Analytics Engineering Quest

This document explains the SEO infrastructure and how to maintain it.

## What's Included

### 1. HTML Metadata (`index.html`)

The main HTML file includes:

- **Title**: "Learn dbt Free — Interactive Tutorial & Hands-On Lessons"
- **Description**: Concise summary of what Analytics Engineering Quest is
- **Keywords**: `dbt, data, SQL, analytics, tutorial, learning, interactive, game, data engineering`
- **Canonical URL**: `https://analyticsengineering.quest/`
- **Author**: Bruno Szdl

### 2. Open Graph Tags (Social Sharing)

When you share the site on Twitter, LinkedIn, Facebook, Slack, etc., these tags control how it appears:

- **og:title**: "Learn dbt Free: 15 Interactive Lessons"
- **og:description**: Brief description for social preview
- **og:image**: `/og-image.svg` (or `/og-image.png` after conversion)
- **og:type**: `website`
- **og:url**: `https://analyticsengineering.quest`

**How to test**: Use [Open Graph Debugger](https://www.opengraph.xyz/) or Twitter's [Card Validator](https://cards-dev.twitter.com/validator).

### 3. Twitter Card

Specialized tags for Twitter sharing:

- **twitter:card**: `summary_large_image`
- **twitter:title** & **twitter:description**: Optimized for 280 char limit
- **twitter:image**: Same as og:image
- **twitter:creator**: `@brunoszdl`

### 4. Search Engine Optimization

#### robots.txt (`public/robots.txt`)

Controls how search engines crawl the site:

- Allows all crawlers (`User-agent: *`)
- Disallows unnecessary bots (Facebook, Twitter external crawlers)
- Points to sitemap.xml
- Sets crawl-delay to 1ms

Update the `Disallow` list if you add restricted pages.

#### sitemap.xml (`public/sitemap.xml`)

Provides search engines with a map of all pages:

- Main landing page (priority 1.0)
- Lesson 0 (intro, priority 0.9)
- Lessons 1–14 (priority 0.8–0.9)
- Privacy page (priority 0.5)
- Includes `lastmod` (last modification date) and `changefreq`

**When to update**: After shipping changes to lessons or adding new pages, update the relevant `<lastmod>` dates.

### 5. Structured Data (JSON-LD)

In `<head>`, there's a JSON-LD block defining the site as an `EducationalWebApplication`:

```json
{
  "@context": "https://schema.org",
  "@type": "EducationalWebApplication",
  "name": "Analytics Engineering Quest",
  "description": "...",
  "url": "https://analyticsengineering.quest",
  "inLanguage": ["en", "pt", "es"],
  "creator": { "@type": "Person", "name": "Bruno Szdl" }
}
```

This helps search engines and rich snippets understand the site's purpose.

**How to test**: Use [Google's Rich Results Test](https://search.google.com/test/rich-results).

### 6. Deployment Configuration (`vercel.json`)

Ensures proper headers and caching:

- `robots.txt`: Cache for 1 day (86400 seconds)
- `sitemap.xml`: Cache for 7 days (604800 seconds)
- Static assets (favicon, og-image): Cache for 30 days (2592000 seconds)
- Rewrites: SPA routing (all non-asset requests → index.html)

### 7. Security (`public/.well-known/security.txt`)

RFC 9116 security contact information for vulnerability disclosure:

```
Contact: info@datagym.io
Expires: 2027-05-15
```

**How to use**: Update the contact emails and expiration date annually.

## OG Image Setup

The og-image is currently an SVG (`public/og-image.svg`). For maximum compatibility:

### Option A: Keep SVG (Recommended for v1)

Pros:
- Smaller file size
- Scales to any resolution
- Works on modern platforms

Cons:
- Some older platforms (old Facebook, Pinterest) may not render

Current `index.html` references `/og-image.svg`. Deploy as-is.

### Option B: Convert to PNG (Recommended for broad compatibility)

Pros:
- Guaranteed compatibility with all platforms
- Better fallback on unsupported platforms

Cons:
- Larger file size (~20–50 KB)
- Static resolution

#### How to convert:

1. **Install svgexport**:
   ```bash
   npm install -g svgexport
   ```

2. **Convert the image**:
   ```bash
   cd public
   svgexport og-image.svg og-image.png 1200 630
   ```

3. **Update `index.html`**:
   ```html
   <meta property="og:image" content="https://analyticsengineering.quest/og-image.png" />
   ```

4. **Test the result**:
   - Use [Open Graph Debugger](https://www.opengraph.xyz/?url=https://analyticsengineering.quest)
   - Share the link on Twitter / LinkedIn
   - Verify the preview shows the correct image

## Monitoring & Maintenance

### Search Engine Coverage

Monitor indexing in Google Search Console:

1. Verify ownership at [Google Search Console](https://search.google.com/search-console)
2. Submit `sitemap.xml` manually (optional; Google finds it via robots.txt)
3. Monitor "Coverage" to see which pages are indexed
4. Check "Performance" for click-through rate, average position, etc.

### Search Rankings

Expected keywords for Analytics Engineering Quest:
- "learn dbt"
- "dbt tutorial"
- "dbt learning"
- "interactive dbt"
- "dbt course"
- "dbt game"

Track performance via Search Console's "Performance" tab.

### Social Preview Testing

After changes, test how the site appears on social media:

- **Twitter**: [Card Validator](https://cards-dev.twitter.com/validator)
- **Facebook / LinkedIn**: [Open Graph Debugger](https://www.opengraph.xyz/)
- **Slack**: Paste the URL in a Slack message and check the preview

### Analytics

Cloudflare Web Analytics (free, privacy-first) is configured:

- Enable by setting `VITE_CF_ANALYTICS_TOKEN` in Vercel env vars
- View analytics at Cloudflare dashboard
- Tracks: pageviews, unique visitors, bounce rate, top pages, referrers, browsers

## Updating Metadata

### When to update `lastmod` in sitemap.xml

After publishing changes to:
- Any lesson content (concept, tasks, quiz)
- Fix to the platform (UI, engine)
- New features

```xml
<!-- After updating Lesson 5 on 2026-06-01: -->
<url>
  <loc>https://analyticsengineering.quest/#/lesson/5</loc>
  <lastmod>2026-06-01</lastmod>
  <!-- ... -->
</url>
```

### When to update meta description in `index.html`

If you're changing the core value proposition or feature set. Current description:

```
Learn dbt through 15 interactive lessons in your browser. No backend, no setup — just hands-on tutorials powered by DuckDB, Monaco Editor, and React Flow. Completely free.
```

Keep it under 160 characters for search results.

### When to update og:description

If you're changing the pitch for social sharing. Current:

```
Master dbt through 15 progressive lessons. Build a real data transformation pipeline in your browser — no setup required.
```

Keep it under 300 characters.

## Checklist for Launch

- [ ] Convert og-image.svg to PNG (or keep as SVG)
- [ ] Update `index.html` if you changed the og-image filename
- [ ] Set `VITE_CF_ANALYTICS_TOKEN` in Vercel env vars (optional)
- [ ] Test social preview with [OG Debugger](https://www.opengraph.xyz/?url=https://analyticsengineering.quest)
- [ ] Verify robots.txt is accessible: `https://analyticsengineering.quest/robots.txt`
- [ ] Verify sitemap.xml is accessible: `https://analyticsengineering.quest/sitemap.xml`
- [ ] Verify og-image is accessible: `https://analyticsengineering.quest/og-image.png` (or .svg)
- [ ] Submit sitemap to [Google Search Console](https://search.google.com/search-console)
- [ ] Monitor coverage and performance in Search Console

## References

- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Schema.org EducationalWebApplication](https://schema.org/EducationalWebApplication)
- [RFC 9116 (security.txt)](https://datatracker.ietf.org/doc/html/rfc9116)
- [Google Search Central](https://developers.google.com/search)
