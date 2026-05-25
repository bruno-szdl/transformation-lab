#!/usr/bin/env node
// Post-build prerender step. After `vite build`, this script:
//
//   1. Reads dist/index.html as a template.
//   2. For each route in seo-pages.mjs, generates a per-page HTML file with:
//        - keyword-targeted <title>, meta description, OG/Twitter tags
//        - canonical + hreflang alternates for every supported language
//        - per-page JSON-LD (Course, LearningResource, FAQPage)
//        - static visible content inside <div id="root"> so non-JS crawlers
//          (Bing, DuckDuckGo, GPTBot, ClaudeBot) see real text — the React SPA
//          replaces it on mount via createRoot().render().
//   3. Writes:
//        - /              → dist/index.html  (overwritten)
//        - /lesson/N      → dist/lesson/N.html  (served via cleanUrls)
//        - /privacy       → dist/privacy.html
//   4. Regenerates dist/sitemap.xml from the same metadata.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pages, courseSchema, faqSchema, SITE_URL, SUPPORTED_LANGS } from './seo-pages.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')
const TEMPLATE_PATH = join(DIST, 'index.html')

const TODAY = new Date().toISOString().slice(0, 10)

/** Minimal HTML escaping for text content. */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render JSON-LD as a script tag. */
function jsonLd(obj) {
  // JSON.stringify already escapes — but we still need to neutralize </script>
  // tags that could appear inside string values.
  const json = JSON.stringify(obj).replace(/</g, '\\u003c')
  return `<script type="application/ld+json">${json}</script>`
}

/** Build hreflang alternates. We use ?lang=xx so all locales serve the same
 * HTML — the SPA picks up the param on mount and switches i18n. Google still
 * treats them as separate URLs for indexing purposes when annotated with hreflang. */
function hreflangTags(path) {
  const base = `${SITE_URL}${path}`
  return [
    `<link rel="alternate" hreflang="x-default" href="${base}" />`,
    `<link rel="alternate" hreflang="en" href="${base}" />`,
    ...SUPPORTED_LANGS.filter((l) => l !== 'en').map(
      (lang) => `<link rel="alternate" hreflang="${lang}" href="${base}?lang=${lang}" />`,
    ),
  ].join('\n    ')
}

/** Static body content shown to crawlers (and during SPA mount). React's
 * createRoot().render() clears these children when it mounts, so users only
 * see a brief paint of this content if at all. */
function bodyHtml(page) {
  const paragraphs = page.summary.map((p) => `<p>${esc(p)}</p>`).join('\n          ')
  const isLesson = page.lessonId !== null && page.lessonId !== undefined
  const lessonNav = isLesson
    ? `
        <nav aria-label="Lesson navigation" style="margin-top:32px;">
          <a href="/" style="color:#ff7849;text-decoration:underline;">All lessons</a>
        </nav>`
    : ''
  return `
      <main style="max-width:760px;margin:0 auto;padding:48px 24px;font-family:system-ui,-apple-system,sans-serif;color:#c9d1d9;background:#0d1117;min-height:100vh;line-height:1.6;">
        <h1 style="font-size:2rem;color:#ff7849;margin:0 0 16px;">${esc(page.h1)}</h1>
        <div style="font-size:1.0625rem;">
          ${paragraphs}
        </div>${lessonNav}
        <p style="margin-top:32px;color:#8b949e;font-size:0.875rem;">
          Loading the interactive tutorial… If this message stays, please enable JavaScript.
        </p>
      </main>`
}

/** Per-page LearningResource JSON-LD (each lesson is its own resource). */
function learningResourceLd(page) {
  if (page.path === '/privacy') return null
  return {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: page.title,
    description: page.description,
    url: `${SITE_URL}${page.path}`,
    inLanguage: SUPPORTED_LANGS,
    isAccessibleForFree: true,
    learningResourceType: page.path === '/' ? 'Course' : 'Tutorial',
    educationalLevel: 'Beginner to Intermediate',
    teaches: page.h1,
    isPartOf: {
      '@type': 'Course',
      name: 'Data Transformation Lab',
      url: SITE_URL,
    },
  }
}

/** Build the full <head> block for a route. */
function headBlock(page) {
  const url = `${SITE_URL}${page.path}`
  const ogImage = `${SITE_URL}/og-image.png`
  const ogImageFallback = `${SITE_URL}/og-image.svg`
  const robots = page.noindex ? 'noindex, follow' : 'index, follow'

  const schemas = []
  if (page.path === '/') {
    schemas.push(courseSchema)
    schemas.push(faqSchema)
  }
  const lr = learningResourceLd(page)
  if (lr) schemas.push(lr)

  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <meta name="author" content="Bruno Szdl" />
    <meta name="keywords" content="${esc(page.keywords)}" />
    <meta name="robots" content="${robots}" />
    <meta name="language" content="English" />

    <link rel="canonical" href="${url}" />
    ${hreflangTags(page.path)}

    <meta property="og:title" content="${esc(page.title)}" />
    <meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Data Transformation Lab — learn dbt with interactive lessons" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image" content="${ogImageFallback}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="Data Transformation Lab" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="Data Transformation Lab — learn dbt" />
    <meta name="twitter:creator" content="@brunoszdl" />

    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <meta name="theme-color" content="#0d1117" />

    ${schemas.map(jsonLd).join('\n    ')}`
}

/** Extract Vite-injected asset tags from the template head — the bundled
 * <script type="module" src="/assets/...">, preload links, and the bundled
 * CSS <link rel="stylesheet">. These MUST survive head replacement or the
 * SPA never loads (the prerendered static content gets stuck on screen). */
function extractAssetTags(headHtml) {
  const tags = []
  // Match <script ...src="/assets/..."...></script> (with or without crossorigin/type/etc.)
  const scriptRe = /<script\b[^>]*\bsrc=["']\/assets\/[^"']+["'][^>]*><\/script>/g
  // Match <link ...href="/assets/..."...> (stylesheet, modulepreload, prefetch).
  const linkRe = /<link\b[^>]*\bhref=["']\/assets\/[^"']+["'][^>]*\/?>/g
  let m
  while ((m = scriptRe.exec(headHtml)) !== null) tags.push(m[0])
  while ((m = linkRe.exec(headHtml)) !== null) tags.push(m[0])
  return tags
}

/** Render a single page by splicing head + body into the Vite-generated
 * template. The Vite template carries the bundled <script src="/assets/...">
 * tags; we want to keep those intact while replacing the head metadata and
 * #root contents. */
function renderPage(template, page) {
  // 1. Pull Vite's asset tags out of the existing head so we can re-inject them.
  const headMatch = template.match(/<head>([\s\S]*?)<\/head>/)
  const assetTags = headMatch ? extractAssetTags(headMatch[1]) : []
  if (assetTags.length === 0) {
    throw new Error(
      'prerender: no /assets/ script or link tags found in template head — refusing to write a broken HTML file',
    )
  }
  // 2. Replace head: SEO metadata first, then Vite asset tags last so the
  //    bundle still loads.
  let html = template.replace(
    /<head>[\s\S]*?<\/head>/,
    `<head>\n${headBlock(page)}\n\n    ${assetTags.join('\n    ')}\n  </head>`,
  )
  // 3. Inject static content into <div id="root"></div>.
  html = html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">${bodyHtml(page)}\n    </div>`,
  )
  return html
}

/** Write a single output file, creating parent dirs as needed. */
function writeOutput(relPath, html) {
  const outPath = join(DIST, relPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf8')
  console.log(`  ✓ ${relPath}`)
}

/** Map a route path to a relative dist output file. */
function distPathFor(routePath) {
  if (routePath === '/') return 'index.html'
  // Vercel cleanUrls strips .html, so /lesson/3 maps to dist/lesson/3.html.
  return `${routePath.replace(/^\//, '')}.html`
}

/** Build sitemap.xml with hreflang alternates per URL. */
function buildSitemap() {
  const urls = pages
    .filter((p) => !p.excludeFromSitemap)
    .map((p) => {
      const base = `${SITE_URL}${p.path}`
      const priority = p.path === '/' ? '1.0' : p.lessonId === 0 ? '0.9' : '0.8'
      const alternates = SUPPORTED_LANGS.map((lang) => {
        const href = lang === 'en' ? base : `${base}?lang=${lang}`
        return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${href}" />`
      }).join('\n')
      return `  <url>
    <loc>${base}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${base}" />
  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`
}

function main() {
  console.log('Prerendering SEO HTML…')
  const template = readFileSync(TEMPLATE_PATH, 'utf8')

  for (const page of pages) {
    const html = renderPage(template, page)
    writeOutput(distPathFor(page.path), html)
  }

  console.log('Writing sitemap.xml…')
  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(), 'utf8')
  console.log('  ✓ sitemap.xml')
}

main()
