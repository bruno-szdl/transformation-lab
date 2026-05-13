import type { Lesson } from '../engine/types'
import {
  testDefinitionsInclude,
  allTestsPass,
  fileMatches,
} from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV,
  COUNTRIES_CSV,
  STG_CUSTOMERS_SOURCED,
  STG_ORDERS_SOURCED,
  DIM_CUSTOMERS_TABLE,
  INT_PAID_ORDERS,
  FCT_REVENUE_BY_CUSTOMER,
  DIM_COUNTRIES,
  SOURCES_YML,
} from './_canonical'

const lesson07: Lesson = {
  id: 7,
  title: 'Generic tests: not_null & unique',
  concept: `dbt has two built-in tests for almost every column you'll write: **not_null** and **unique**. They're declared in a YAML file alongside your model and run with \`dbt test\`.

Catching a null or duplicate early (before it breaks a downstream join or doubles up a metric) is the cheapest data-quality win you'll ever get.

Tests live in a \`schema.yml\` file next to your models. The structure looks like this:

\`\`\`yaml
version: 2

models:
  - name: stg_customers
    columns:
      - name: id
        tests:
          - not_null
          - unique
      - name: email
        tests:
          - not_null
\`\`\`

A few things to notice:

- Each test name goes on its own line, prefixed with \`- \` (dash + space).
- Indentation matters in YAML — \`tests:\` must align under its column, and the test entries must indent further.
- You can put as many tests as you want on a column, and as many columns as you want under a model.

We've added an empty \`schema.yml\` to the project, with \`stg_customers.id\` set up but its \`tests:\` list empty. Your job: add \`not_null\` and \`unique\` to it, then add a separate \`email\` column with \`not_null\`, then run \`dbt test\`.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'models/dim_countries.sql': DIM_COUNTRIES,
    'seeds/countries.csv': COUNTRIES_CSV,
    'models/schema.yml': `version: 2

models:
  - name: stg_customers
    columns:
      - name: id
        tests:
          # add the two tests below this line (one per line, prefixed with "- ")
`,
  },
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
    countries: COUNTRIES_CSV,
  },
  preRanModels: [
    'stg_customers',
    'stg_orders',
    'dim_customers',
    'int_paid_orders',
    'fct_revenue_by_customer',
    'dim_countries',
  ],
  tasks: [
    {
      id: 'not-null',
      prompt: 'In `schema.yml`, add a `not_null` test under the `id` column of `stg_customers`.',
      hint: "On a new line under `tests:`, write `          - not_null` (10 leading spaces, dash, space, then `not_null`).",
      validate: (s) => testDefinitionsInclude(s, 'stg_customers', ['not_null']),
    },
    {
      id: 'unique',
      prompt: 'Now add a `unique` test on the same `id` column.',
      hint: "Another line right below the `not_null` you just added: `          - unique`.",
      validate: (s) => testDefinitionsInclude(s, 'stg_customers', ['not_null', 'unique']),
    },
    {
      id: 'run-tests',
      prompt: 'Run `dbt test` and make sure both tests pass on `stg_customers`.',
      hint: 'Type `dbt test` at the prompt. You should see two PASS lines.',
      validate: (s) => allTestsPass(s, 'stg_customers'),
    },
    {
      id: 'email-not-null',
      prompt: 'Add a new column block for `email` under the `stg_customers` model and give it a `not_null` test. Then run `dbt test` again.',
      hint: "Add this under the existing `id` block (same indentation as `- name: id`):\n```\n      - name: email\n        tests:\n          - not_null\n```",
      validate: (s) =>
        fileMatches(s, 'models/schema.yml', /- name:\s*email[\s\S]*?tests:\s*[\s\S]*?-\s*not_null/) &&
        allTestsPass(s, 'stg_customers'),
    },
  ],
  quiz: {
    question: 'When does `dbt test` run your tests?',
    options: [
      'Continuously in the background',
      'Only when you call `dbt test` (or `dbt build`)',
      'Automatically after every `dbt run`',
      'Only in production',
    ],
    correctIndex: 1,
    explanation: 'Tests run only when you invoke them. `dbt build` is a shortcut that runs models and their tests together.',
  },
  furtherReading: [
    { label: 'Data tests', url: 'https://docs.getdbt.com/docs/build/data-tests' },
  ],
}

export default lesson07
