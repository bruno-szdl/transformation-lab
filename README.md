# Analytics Engineering Quest

An interactive browser-based game that teaches [dbt](https://www.getdbt.com/) through progressive levels — inspired by [Learn Git Branching](https://learngitbranching.js.org/).

Each level presents a target DAG that you need to reach by editing dbt files and running commands in a simulated terminal. No backend, no login — everything runs in the browser.

## Features

- Visual DAG viewer powered by React Flow
- Monaco-based code editor with dbt SQL/YAML support
- Real SQL execution in the browser via DuckDB-WASM
- Fake-but-realistic dbt terminal
- 15 lessons covering core dbt concepts
- Progress saved in localStorage

## What you'll learn

Analytics Engineering Quest is a focused on-ramp, not a complete reference. Here's what's in scope vs. what's intentionally left to the real dbt:

| Concept | AE Quest | Real dbt |
|---|---|---|
| `ref()`, `source()`, lineage | ✅ Hands-on | ✅ |
| Materializations: view, table | ✅ | ✅ |
| Materializations: incremental, ephemeral | — | ✅ |
| Materializations: materialized_view | — | ✅ |
| Generic tests: `not_null`, `unique`, `accepted_values`, `relationships` | ✅ | ✅ |
| Custom Generic tests | - | ✅ |
| Singular tests | ✅ | ✅ |
| Source freshness checks | — | ✅ |
| Snapshots (timestamp + check strategies) | — | ✅ |
| Seeds | ✅ | ✅ |
| Project structure (staging / intermediate / marts) | ✅ | ✅ |
| Selectors: graph operators, tags, paths, set ops | ✅ | ✅ |
| Documentation: model & column descriptions | ✅ | ✅ |
| dbt docs | - | ✅ |
| Jinja templating | Mocked | ✅ executed |
| Macros, packages, `dbt deps`, dbt-utils | — | ✅ |
| dbt Mesh: contracts, access, versions, groups | — | ✅ |
| Semantic layer / metrics / exposures | — | ✅ |
| Hooks (`on-run-start`, `pre-hook`, `post-hook`) | — | ✅ |
| Profile / `dbt_project.yml` configuration | - | ✅ |

After finishing Analytics Engineering Quest you'll be ready to set up a real dbt project against DuckDB / Postgres / BigQuery / Snowflake and explore the larger ecosystem.

## Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 4
- Monaco Editor (`@monaco-editor/react`)
- React Flow (`reactflow`) + Dagre layout
- DuckDB-WASM (`@duckdb/duckdb-wasm`) for in-browser SQL
- Zustand (state management)

## Play Online

Analytics Engineering Quest is live at [analyticsengineering.quest](https://analyticsengineering.quest). Start with Lesson 0 and progress through 15 lessons.

## Deployment

### Vercel Deployment

The site is configured to deploy to Vercel via `vercel.json`:

```bash
vercel deploy      # Deploy to preview
vercel deploy --prod  # Deploy to production
```

The build is optimized with proper headers for static assets (robots.txt, sitemap.xml, og-image.svg) and cache control settings.

### Environment Variables

For production builds, set `VITE_CF_ANALYTICS_TOKEN` to enable Cloudflare Web Analytics:

```bash
# In Vercel dashboard or .env.local:
VITE_CF_ANALYTICS_TOKEN=your_token_here
```

Dev and preview builds don't send analytics (token is unset).

### SEO & Metadata

The site includes comprehensive SEO setup:

- **Meta tags**: Title, description, keywords in `index.html`
- **Open Graph**: `og:title`, `og:description`, `og:image` for social sharing
- **Twitter Card**: Custom Twitter preview with `twitter:card`, `twitter:image`
- **Robots.txt**: `/robots.txt` for search engine crawling
- **Sitemap.xml**: `/sitemap.xml` with all lesson URLs and priorities
- **Structured data**: JSON-LD `EducationalWebApplication` schema
- **OG Image**: `/og-image.svg` (convert to PNG for production: `svgexport og-image.svg og-image.png 1200 630`)

**Note on og-image.png**: The og-image is currently served as SVG. For better compatibility with older social platforms, convert it to PNG:

```bash
# Using svgexport (npm install -g svgexport):
cd public
svgexport og-image.svg og-image.png 1200 630
```

Then update `index.html` to reference `/og-image.png` instead of `/og-image.svg`.
