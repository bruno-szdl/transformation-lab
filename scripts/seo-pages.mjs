// SEO metadata for every prerendered route. Hand-tuned: titles include the
// concept name + "dbt" + "tutorial/example/explained" to capture the long-tail
// queries learners actually type. Each page also carries a short, scannable
// concept summary that ends up as static HTML inside <div id="root"> so
// non-JS crawlers (Bing, DuckDuckGo, AI bots) see real content, not an empty
// shell. The SPA replaces it on mount.

export const SITE_URL = 'https://transform-lab.datagym.io'
export const SUPPORTED_LANGS = ['en', 'pt', 'es', 'fr', 'de', 'it']

// One entry per indexable route. `path` is the URL path (no trailing slash).
// `summary` becomes <p> tags shown briefly before React mounts.
export const pages = [
  {
    path: '/',
    slug: 'home',
    title: 'Learn dbt Free — Interactive Tutorial with 14 Hands-On Lessons',
    description:
      'Learn dbt in your browser with 14 free, interactive lessons. Master data transformation, SQL modeling, ref(), sources, tests, and the dbt DAG. No setup required.',
    keywords:
      'learn dbt, dbt tutorial, dbt course, learn dbt free, dbt for beginners, analytics engineering tutorial, dbt hands-on, dbt lessons, dbt online course, data transformation',
    h1: 'Learn dbt — Free Interactive Tutorial',
    summary: [
      'Analytics Engineering Quest is a free, interactive tutorial for learning dbt (data build tool) directly in your browser. No installation, no signup — just SQL, a real DuckDB warehouse, and 14 hands-on lessons covering everything from your first model to data tests, sources, and the dbt build command.',
      'dbt is the open-source tool that lets analytics engineers transform raw data into reliable, documented datasets using SQL and software engineering best practices. This course walks you through it lesson by lesson, with a single fictional e-commerce dbt project that grows as you learn.',
      'Topics covered: dbt models, ref() and the DAG, materializations (view vs table), selecting models with --select, sources, seeds, data tests (not_null, unique, relationships, accepted_values), documentation, project structure (staging, intermediate, marts), and dbt build.',
    ],
    lessonId: 0,
  },
  {
    path: '/lesson/0',
    slug: 'intro',
    title: 'Introduction to dbt — Analytics Engineering Quest',
    description:
      'Start the free dbt tutorial. Learn what dbt is, why analytics engineers use it, and how dbt run, ref(), and the DAG work — all in your browser, no setup.',
    keywords: 'what is dbt, introduction to dbt, dbt explained, learn dbt, dbt for beginners, dbt tutorial intro',
    h1: 'Introduction — What is dbt?',
    summary: [
      'dbt (data build tool) is the open-source workflow that turns SQL SELECT statements into production-grade data pipelines. Each .sql file in your project becomes a model — a table or view in your warehouse, ordered automatically by a dependency graph (the DAG).',
      'In this introduction you will learn what dbt does, how dbt run works, and how the DAG keeps your data pipelines correct. You will then move on to building, testing, and documenting models on a real (in-browser) e-commerce dbt project.',
    ],
    lessonId: 0,
  },
  {
    path: '/lesson/1',
    slug: 'first-model',
    title: 'Your First dbt Model — dbt run Tutorial',
    description:
      'Learn how to write your first dbt model. Build a SQL model, run dbt run to materialize it as a view, and preview rows with dbt show. Hands-on lesson, free.',
    keywords: 'dbt model tutorial, dbt run, first dbt model, dbt show, dbt for beginners',
    h1: 'Your First dbt Model',
    summary: [
      'A dbt model is a SELECT statement saved as a .sql file inside the models/ folder. When you run dbt, every model becomes a view (or table) in your warehouse, named after the file.',
      'In this lesson you will use dbt run to materialize a stg_customers model and dbt show --select stg_customers to preview the rows it produced. These are the two commands you will type most often as a dbt developer.',
    ],
    lessonId: 1,
  },
  {
    path: '/lesson/2',
    slug: 'ref-and-dag',
    title: 'dbt ref() and the DAG Explained — Tutorial',
    description:
      'Learn how dbt ref() builds a dependency graph (the DAG) between models. Hands-on lesson with diagrams — see how dbt orders runs automatically. Free in-browser.',
    keywords: 'dbt ref, dbt DAG, dbt dependency graph, dbt ref function, dbt lineage',
    h1: 'ref() and the DAG',
    summary: [
      'Instead of hard-coding table names like "raw.customers", dbt models reference other models with {{ ref(\'model_name\') }}. dbt parses every ref() to build the DAG — a directed graph of model dependencies — and runs models in the correct order automatically.',
      'In this lesson you will replace a hard-coded table name with ref(), then watch the DAG update in the lineage panel and verify dbt now runs your models in topological order.',
    ],
    lessonId: 2,
  },
  {
    path: '/lesson/3',
    slug: 'multi-step-pipelines',
    title: 'Multi-Step dbt Pipelines — Joins & Aggregations Tutorial',
    description:
      'Build a multi-model dbt pipeline: staging, intermediate joins, and an aggregated mart. Learn how dbt orchestrates SQL across files. Free interactive lesson.',
    keywords: 'dbt pipeline tutorial, dbt staging intermediate marts, dbt joins, multi-model dbt project',
    h1: 'Multi-Step Pipelines',
    summary: [
      'Real dbt projects chain many models: raw data feeds staging models, staging feeds intermediate joins, and intermediates feed mart-level fact and dimension tables. dbt walks the DAG and runs each layer in order.',
      'In this lesson you will build an intermediate model that joins stg_customers with stg_orders, then a mart model that aggregates revenue per customer.',
    ],
    lessonId: 3,
  },
  {
    path: '/lesson/4',
    slug: 'materializations',
    title: 'dbt Materializations: View vs Table Tutorial',
    description:
      'Learn dbt materializations — when to use view vs table. Configure config(materialized=...) and see how dbt builds each model differently. Hands-on, free.',
    keywords: 'dbt materializations, dbt view vs table, dbt config materialized, dbt table view',
    h1: 'Materializations: view vs table',
    summary: [
      'By default dbt materializes every model as a view, but you can change that with {{ config(materialized="table") }} at the top of a model. Views are cheap to build but slow to query; tables are the opposite.',
      'In this lesson you will toggle materializations between view and table, then inspect the warehouse to see how dbt rebuilds each model.',
    ],
    lessonId: 4,
  },
  {
    path: '/lesson/5',
    slug: 'selecting-models',
    title: 'dbt --select and --exclude Tutorial',
    description:
      'Master the dbt --select flag: pick subsets of models by name, tag, or path. Learn graph operators like model+ and +model. Free hands-on dbt lesson.',
    keywords: 'dbt select, dbt --select, dbt exclude, dbt model selectors, dbt tag selector',
    h1: 'Selecting Models',
    summary: [
      'dbt run --select model_name builds a single model. Selectors get powerful with operators: model+ runs the model and all its downstream descendants; +model runs everything upstream; tag:foo selects models tagged "foo".',
      'In this lesson you will practise narrow and graph-based selection so you can rebuild only the part of the project you are working on.',
    ],
    lessonId: 5,
  },
  {
    path: '/lesson/6',
    slug: 'sources',
    title: 'dbt Sources Tutorial — schema.yml Explained',
    description:
      'Declare raw tables as dbt sources in schema.yml and use source() in models. Learn freshness checks and the dbt source convention. Free interactive lesson.',
    keywords: 'dbt sources, dbt source tutorial, dbt schema.yml, dbt source function, dbt freshness',
    h1: 'Sources',
    summary: [
      'Sources are how dbt tracks raw, untransformed tables that live in your warehouse but were loaded by something other than dbt. You declare them in schema.yml under a sources: block, then reference them in models with {{ source(\'raw\', \'customers\') }}.',
      'In this lesson you will declare a source, replace direct raw table references with source(), and see the source appear as a green node in the DAG.',
    ],
    lessonId: 6,
  },
  {
    path: '/lesson/7',
    slug: 'seeds',
    title: 'dbt Seeds Tutorial — Loading CSV Data',
    description:
      'Use dbt seed to load CSV files as warehouse tables. Learn when to use seeds vs sources, and how dbt seed integrates with the DAG. Free hands-on lesson.',
    keywords: 'dbt seed, dbt seeds tutorial, dbt seed csv, dbt seed vs source',
    h1: 'Seeds',
    summary: [
      'A seed is a CSV file in the seeds/ folder that dbt loads into your warehouse as a table when you run dbt seed. Use seeds for small, mostly-static reference data — country codes, status mappings, exchange rates — that does not belong in a transactional source.',
      'In this lesson you will add a seed CSV, run dbt seed, and ref() the resulting table from another model.',
    ],
    lessonId: 7,
  },
  {
    path: '/lesson/8',
    slug: 'data-tests-not-null-unique',
    title: 'dbt Tests Tutorial — not_null and unique Explained',
    description:
      'Add dbt data tests to enforce not_null and unique constraints. Run dbt test and see failures pinpoint bad rows. Free interactive lesson on dbt testing.',
    keywords: 'dbt tests, dbt not_null, dbt unique test, dbt test tutorial, dbt data quality',
    h1: 'Data tests: not_null and unique',
    summary: [
      'dbt tests are assertions that run as SQL against your materialized models. The two most common generic tests are not_null (no NULLs allowed in a column) and unique (no duplicate values).',
      'In this lesson you will declare not_null and unique tests in schema.yml under a model\'s columns:, then run dbt test and observe pass/fail output.',
    ],
    lessonId: 8,
  },
  {
    path: '/lesson/9',
    slug: 'tests-relationships-accepted-values',
    title: 'dbt relationships and accepted_values Tests Tutorial',
    description:
      'Enforce foreign keys with the dbt relationships test and validate enums with accepted_values. Free interactive lesson with real test failures.',
    keywords: 'dbt relationships test, dbt accepted_values, dbt foreign key test, dbt enum test',
    h1: 'Relationships and accepted_values',
    summary: [
      'The relationships test checks that every value in a column exists in a referenced model — your foreign-key check. accepted_values checks that a column only contains a fixed list of allowed values — perfect for status enums.',
      'In this lesson you will add both tests to schema.yml and then deliberately break the data to watch a failure surface.',
    ],
    lessonId: 9,
  },
  {
    path: '/lesson/10',
    slug: 'documentation',
    title: 'dbt Documentation Tutorial — schema.yml descriptions',
    description:
      'Document dbt models and columns in schema.yml. Learn dbt docs generate, descriptions, and how documentation feeds the lineage UI. Free hands-on lesson.',
    keywords: 'dbt documentation, dbt docs generate, dbt schema.yml descriptions, dbt model description',
    h1: 'Documentation',
    summary: [
      'dbt treats documentation as a first-class citizen: every model and column in schema.yml can carry a description. Together with the DAG, those descriptions power dbt docs — a generated website that lets analysts explore your warehouse.',
      'In this lesson you will add descriptions to a model and its columns, then see them surface in the docs UI.',
    ],
    lessonId: 10,
  },
  {
    path: '/lesson/11',
    slug: 'project-structure-staging-intermediate-marts',
    title: 'dbt Project Structure: staging, intermediate, marts',
    description:
      'Learn the canonical dbt project structure — staging, intermediate, marts — and the naming conventions stg_, int_, fct_, dim_ that go with it. Free lesson.',
    keywords: 'dbt project structure, dbt staging intermediate marts, dbt naming convention, dbt best practices folder layout',
    h1: 'Project structure: staging, intermediate, marts',
    summary: [
      'dbt projects follow a three-layer convention: staging models (stg_) clean and standardize raw data 1:1 with sources; intermediate models (int_) join and reshape staging models; mart models (fct_, dim_) expose business-facing tables for analytics.',
      'In this lesson you will reorganize a flat project into staging/intermediate/marts folders and see how the structure clarifies dependencies in the DAG.',
    ],
    lessonId: 11,
  },
  {
    path: '/lesson/12',
    slug: 'select-subsets-graph-operators',
    title: 'dbt Graph Operators Tutorial — +model, model+, tag:, path:',
    description:
      'Master dbt graph operators: +model, model+, @model, tag:, path:, and unions. Select complex subsets of your DAG for runs and tests. Free interactive lesson.',
    keywords: 'dbt graph operators, dbt +model, dbt model+, dbt tag selector, dbt path selector, dbt selector syntax',
    h1: 'Selecting subsets: unions and graph operators',
    summary: [
      'Beyond plain --select model_name, dbt accepts: model+ (model and descendants), +model (model and ancestors), @model (model + ancestors + descendants of ancestors), tag:revenue, path:models/marts, and unions of any of these separated by spaces.',
      'In this lesson you will combine selectors to rebuild exactly the slice of the project that changed.',
    ],
    lessonId: 12,
  },
  {
    path: '/lesson/13',
    slug: 'singular-tests',
    title: 'dbt Singular (Custom) Tests Tutorial',
    description:
      'Write custom dbt tests as plain SQL files in tests/. Learn when to reach for a singular test instead of a generic schema.yml test. Free hands-on lesson.',
    keywords: 'dbt singular tests, dbt custom test, dbt sql test, dbt tests folder',
    h1: 'Custom (singular) tests',
    summary: [
      'When a check does not fit a generic test like not_null or unique, you write a singular test: a .sql file in tests/ whose query returns the offending rows. If it returns zero rows, the test passes.',
      'In this lesson you will write a singular test that flags negative order totals and watch dbt test pick it up automatically.',
    ],
    lessonId: 13,
  },
  {
    path: '/lesson/14',
    slug: 'dbt-build',
    title: 'dbt build Tutorial — Run, Test, Seed in One Command',
    description:
      'Learn dbt build — the all-in-one command that runs models, tests, seeds, and snapshots in DAG order with smart failure handling. Free interactive lesson.',
    keywords: 'dbt build, dbt build command, dbt run vs build, dbt build tutorial, dbt all-in-one',
    h1: 'Putting it all together: dbt build',
    summary: [
      'dbt build runs models, tests, seeds, and snapshots in a single DAG-ordered pass, and crucially: if a test on model A fails, downstream models that depend on A are skipped — preventing bad data from propagating.',
      'In this final lesson you will run dbt build on the full project, watch the success path, then deliberately fail a test to see the skip-downstream behaviour.',
    ],
    lessonId: 14,
  },
  {
    path: '/privacy',
    slug: 'privacy',
    title: 'Privacy Policy — Analytics Engineering Quest',
    description: 'Privacy policy for Analytics Engineering Quest, a free interactive dbt tutorial.',
    keywords: 'privacy policy',
    h1: 'Privacy Policy',
    summary: [
      'Analytics Engineering Quest runs entirely in your browser. We do not require an account, do not store your code on a server, and use Cloudflare Web Analytics for aggregate, anonymized traffic data only.',
    ],
    lessonId: null,
    noindex: false,
    excludeFromSitemap: true,
  },
]

// Top-level Course schema, referenced from the homepage JSON-LD.
export const courseSchema = {
  '@context': 'https://schema.org',
  '@type': 'Course',
  name: 'Learn dbt — Analytics Engineering Quest',
  description:
    'A free, interactive 15-lesson tutorial that teaches dbt (data build tool) and analytics engineering from scratch. Browser-based, no setup, with a real DuckDB warehouse.',
  url: SITE_URL,
  provider: {
    '@type': 'Organization',
    name: 'Analytics Engineering Quest',
    url: SITE_URL,
  },
  inLanguage: SUPPORTED_LANGS,
  isAccessibleForFree: true,
  educationalLevel: 'Beginner to Intermediate',
  about: ['dbt', 'analytics engineering', 'data transformation', 'SQL modeling', 'data testing'],
  teaches: [
    'dbt models',
    'ref() and the DAG',
    'materializations',
    'sources and seeds',
    'data tests (not_null, unique, relationships, accepted_values)',
    'documentation',
    'project structure (staging, intermediate, marts)',
    'dbt build',
  ],
  hasCourseInstance: {
    '@type': 'CourseInstance',
    courseMode: 'online',
    courseWorkload: 'PT5H',
    inLanguage: SUPPORTED_LANGS,
  },
}

// FAQ schema rendered on the homepage. Each Q must match content actually on
// the page — schema-without-content is treated as a spam signal by Google.
export const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is dbt?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'dbt (data build tool) is the open-source workflow that turns SQL SELECT statements into production-grade data pipelines. Each .sql file in your project becomes a model — a table or view in your warehouse, ordered automatically by a dependency graph (the DAG).',
      },
    },
    {
      '@type': 'Question',
      name: 'How does dbt run work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'dbt run reads every SQL file in models/, parses ref() and source() calls to build a DAG, then executes each model in dependency order — wrapping each SELECT in a CREATE VIEW or CREATE TABLE statement against your warehouse.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is dbt free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — dbt Core is open-source and free. dbt Cloud is a paid hosted product. Analytics Engineering Quest teaches dbt Core concepts that apply to both.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need to install anything?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Analytics Engineering Quest runs entirely in your browser. SQL executes against a real (in-browser) DuckDB warehouse via WebAssembly. No signup, no install, no credit card.',
      },
    },
    {
      '@type': 'Question',
      name: 'How long does the course take?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'About 4–6 hours end-to-end if you work through every task. The 14 lessons are short and self-paced, so most learners spread them across a week.',
      },
    },
  ],
}
