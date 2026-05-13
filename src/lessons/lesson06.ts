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

const lesson06: Lesson = {
  id: 6,
  title: 'Seeds',
  concept: `**Seeds** are small CSV files checked into the repo (under \`seeds/\`) that dbt loads into the warehouse as tables. They're perfect for lookup data: country codes, currency rates, status mappings — anything that's small, slow-changing, and lives more naturally in version control than in a database.

Two things make seeds different from regular models:

1. They're loaded with \`dbt seed\`, **not** \`dbt run\`. The data lives in a CSV, not a SELECT.
2. From a model's point of view, a seed *is* a model — you reference it with \`{{ ref('seed_name') }}\` just like any other.

In this lesson the team has dropped a \`seeds/countries.csv\` lookup into the project. The \`countries\` table isn't in the warehouse yet — only the CSV is on disk. You'll seed it, then build a small \`dim_countries\` model on top.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'seeds/countries.csv': COUNTRIES_CSV,
    'models/dim_countries.sql': `-- This model reads from the countries seed.
-- Seeds are referenced with ref(), just like models.

select
    code,
    name,
    region
from {{ ref('countries') }}`,
  },
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
  },
  tasks: [
    {
      id: 'inspect',
      prompt: 'Open `seeds/countries.csv` (in the file tree) and skim its contents. Notice it lives under `seeds/`, not `models/`.',
      hint: 'Click the file in the file tree on the left. CSVs render as plain text — you should see one header row and five data rows.',
      validate: (s) => s.openedFiles.has('seeds/countries.csv') || s.loadedSeeds.has('countries'),
    },
    {
      id: 'seed',
      prompt: 'Run `dbt seed` in the terminal to load `countries.csv` into the warehouse.',
      hint: 'Type `dbt seed` at the prompt and press Enter. Only `dbt seed` loads CSVs — `dbt run` will not.',
      validate: (s) => seedLoaded(s, 'countries'),
    },
    {
      id: 'ref',
      prompt: 'Confirm that `dim_countries` references the seed via `{{ ref(\'countries\') }}`.',
      hint: 'Open `models/dim_countries.sql` — it should already use `ref()`. Seeds and models are referenced the same way.',
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
      hint: 'You should see five rows — one per country in the CSV.',
      validate: (s) => s.shownModels.has('dim_countries'),
    },
  ],
  quiz: {
    question: 'Which kind of data is a seed best suited for?',
    options: [
      'Millions of rows of event data',
      'Small, slow-changing reference data like country codes',
      'Production transactions',
      'Real-time streaming data',
    ],
    correctIndex: 1,
    explanation: 'Seeds are CSVs in your repo — they go through code review and are tiny. Anything large or fast-changing belongs in your warehouse, not in a CSV.',
  },
  furtherReading: [
    { label: 'Seeds', url: 'https://docs.getdbt.com/docs/build/seeds' },
  ],
}

export default lesson06
