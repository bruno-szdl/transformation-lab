import type { Lesson } from '../engine/types'
import { seedLoaded, modelRan, modelRefs, hasModel } from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV,
  COUNTRIES_CSV,
  STG_CUSTOMERS_SOURCED,
  STG_ORDERS_SOURCED,
  DIM_CUSTOMERS_TABLE,
  INT_PAID_ORDERS,
  FCT_REVENUE_BY_CUSTOMER,
  SOURCES_YML,
} from './_canonical'

const lesson07: Lesson = {
  id: 7,
  title: 'Seeds',
  concept: `**Seeds** are small CSV files checked into the repo (under \`seeds/\`) that dbt loads into the warehouse as tables. They're perfect for lookup data: country codes, currency rates, status mappings. Anything small, slow-changing, and more at home in version control than in a Database.

Two things make seeds different from regular models:

1. They're loaded with \`dbt seed\`, **not** \`dbt run\`. The data lives in a CSV, not a SELECT.
2. From a ref()'s point of view, a seed *is* a model: you reference it with \`{{ ref('seed_name') }}\` just like any other.

In this lesson the team has dropped a \`seeds/countries.csv\` lookup into the project. The \`countries\` table isn't in the warehouse yet; only the CSV is on disk. You'll seed it, then build a small \`dim_countries\` model on top.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'seeds/countries.csv': COUNTRIES_CSV,
    'models/dim_countries.sql': `-- Write a SELECT that reads from the countries seed using ref().
`,
  },
  openFiles: ['seeds/countries.csv', 'models/dim_countries.sql'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
  },
  tasks: [
    {
      id: 'inspect',
      prompt: 'Skim `seeds/countries.csv` -it lives under `seeds/`, not `models/`. Notice the header row and five data rows.',
      hint: 'Click the file in the file tree on the left. CSVs render as plain text -you should see one header row and five data rows.',
      validate: (s) => s.openedFiles.has('seeds/countries.csv') || s.loadedSeeds.has('countries'),
    },
    {
      id: 'seed',
      prompt: 'The CSV is sitting on disk but the warehouse has no `countries` table yet. Load it.',
      hint: '`dbt seed` is the command that turns CSVs in `seeds/` into warehouse tables. `dbt run` does not.',
      validate: (s) => seedLoaded(s, 'countries'),
    },
    {
      id: 'ref',
      prompt: 'In `models/dim_countries.sql`, write a SELECT that reads all columns from the `countries` seed using `{{ ref(\'countries\') }}`.',
      hint: "Try: `select * from {{ ref('countries') }}`",
      validate: (s) => hasModel(s, 'dim_countries') && modelRefs(s, 'dim_countries', 'countries'),
    },
    {
      id: 'run',
      prompt: 'Now run `dbt run` to build `dim_countries` on top of the seed.',
      validate: (s) => modelRan(s, 'dim_countries'),
    },
    {
      id: 'show',
      prompt: 'Preview the result with `dbt show --select dim_countries`.',
      hint: 'You should see five rows -one per country in the CSV.',
      validate: (s) => s.shownModels.has('dim_countries'),
    },
  ],
  quiz: {
    question: 'Your team has a 50M-row events table refreshed every hour from Kafka. A teammate suggests loading it via `dbt seed` so it lives in the repo. What\'s wrong with that?',
    options: [
      'Nothing - that\'s exactly what seeds are for',
      'Seeds can\'t be referenced with `ref()`',
      'Seeds are for small, slow-changing CSVs - a 50M-row hourly stream belongs as a source, not in version control',
      '`dbt seed` would work but only on the dev target, not in prod',
    ],
    correctIndex: 2,
    explanation: 'Seeds are checked-in CSVs reviewed in PRs - perfect for country codes, status mappings, currency rates. Putting a 50M-row stream in git would bloat the repo and lose hourly updates the moment the file is committed. That data belongs in the warehouse, accessed via a `source`.',
  },
  furtherReading: [
    { label: 'Seeds', url: 'https://docs.getdbt.com/docs/build/seeds' },
  ],
}

export default lesson07
