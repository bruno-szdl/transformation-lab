import type { Lesson } from '../engine/types'
import {
  testDefinitionsInclude,
  allTestsPass,
  fileMatches,
  modelSqlMatches,
  modelShown,
  onlyModelsRan,
} from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV_DIRTY,
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

const lesson08: Lesson = {
  id: 8,
  title: 'Data tests: not_null & unique',
  concept: `dbt has two built-in **data tests** for almost every column you'll write: **not_null** and **unique**. They're declared in a YAML file alongside your model and run with \`dbt test\`.

Catching a null or duplicate early (before it breaks a downstream join or doubles up a metric) is the cheapest data-quality win you'll ever get.

Data tests live in a \`schema.yml\` file next to your models. The structure looks like this:

\`\`\`yaml
version: 2

models:
  - name: stg_customers
    columns:
      - name: id
        data_tests:
          - not_null
          - unique
      - name: email
        data_tests:
          - not_null
\`\`\`

A few things to notice:

- Each test name goes on its own line, prefixed with \`- \` (dash + space).
- Indentation matters in YAML: \`data_tests:\` must align under its column, and the test entries must indent further.
- You can put as many data tests as you want on a column, and as many columns as you want under a model.

We've added a \`schema.yml\` to the project, with \`stg_customers.id\` set up but its \`data_tests:\` list empty. Your job: add \`not_null\` and \`unique\` to \`id\` and run \`dbt test\`, then add a \`not_null\` test on \`email\`. This time the raw data isn't clean. You'll watch the test catch a real problem, then fix it.`,
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
        # Add a data_tests: block here listing two tests - not_null and unique
        # (each on its own line, prefixed with "- ").
`,
  },
  openFiles: ['models/schema.yml', 'models/stg_customers.sql'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV_DIRTY,
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
      hint: "Replace the comment under `- name: id` with a `data_tests:` block:\n```\n        data_tests:\n          - not_null\n```\n(`data_tests:` aligned under `- name: id`, the test indented two more spaces.)",
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
      id: 'email-test',
      prompt: 'Add a new column block for `email` under the `stg_customers` model with a `not_null` test, then run `dbt test` again. This time it FAILS -that\'s expected. The raw data has a customer with no email.',
      hint: "Add this under the existing `id` block (same indentation as `- name: id`):\n```\n      - name: email\n        data_tests:\n          - not_null\n```\nThen run `dbt test`. You should see a red `FAIL` line -read it.",
      validate: (s) =>
        fileMatches(s, 'models/schema.yml', /- name:\s*email[\s\S]*?data_tests:\s*[\s\S]*?-\s*not_null/) &&
        s.testResults['stg_customers'] === 'fail',
    },
    {
      id: 'inspect',
      prompt: 'Run `dbt show --select stg_customers` to inspect the data. Find the row that\'s causing the failure.',
      hint: 'Look for a row where the `email` column is NULL -that\'s the record failing the `not_null` test.',
      validate: (s) => modelShown(s, 'stg_customers'),
    },
    {
      id: 'fix-sql',
      prompt: "Fix it the way you would in a real project: you can't edit raw data, so filter the offending row out in the staging model. Then re-run only that model to apply the fix.",
      hint: "In `models/stg_customers.sql`, add `where email is not null` as the last line. Then `dbt run --select stg_customers` re-materializes only that model with the filter applied.",
      validate: (s) =>
        modelSqlMatches(s, 'stg_customers', /where\s+email\s+is\s+not\s+null/i) &&
        onlyModelsRan(s, ['stg_customers']),
    },
    {
      id: 'fix-test',
      prompt: 'Now run `dbt test` again. The `not_null` on `email` should pass this time.',
      hint: 'The filter removed the row with no email, so there are no nulls left. `dbt test` should be all green.',
      validate: (s) => allTestsPass(s, 'stg_customers'),
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

export default lesson08
