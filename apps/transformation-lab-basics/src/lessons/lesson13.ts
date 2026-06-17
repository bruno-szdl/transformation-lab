import type { Lesson } from '../engine/types'
import { buildSucceeded, fileMatches, modelShown, modelSqlMatches, onlyModelsRan } from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV_WITH_FUTURE,
  COUNTRIES_CSV,
  STG_CUSTOMERS_SOURCED,
  STG_ORDERS_SOURCED,
  DIM_CUSTOMERS_TABLE,
  INT_PAID_ORDERS,
  FCT_REVENUE_BY_CUSTOMER,
  DIM_COUNTRIES,
  SOURCES_YML,
  SCHEMA_YML_L9,
  SINGULAR_TEST_NO_FUTURE,
} from './_canonical'

const lesson13: Lesson = {
  id: 13,
  title: 'Custom (singular) tests',
  concept: `When the built-in tests aren't enough, you can write your own. A **singular test** is just a SQL query saved under \`tests/\`. If it returns any rows, the test fails.

The pattern is "find me the bad rows":

\`\`\`sql
-- tests/no_pre_launch_signups.sql
select *
from {{ ref('stg_users') }}
where signup_at < '2024-01-01'  -- our company didn't exist yet
\`\`\`

The project now has tests/ alongside the staging/intermediate/marts folders. We've added one singular test, \`no_future_signups.sql\`, that flags orders dated in the future. This time the raw data has a bad row - you'll see the test catch it, then fix it the same way as before.`,
  initialFiles: {
    'models/staging/_sources.yml': SOURCES_YML,
    'models/staging/_schema.yml': SCHEMA_YML_L9,
    'models/staging/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/staging/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/intermediate/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/marts/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/marts/dim_countries.sql': DIM_COUNTRIES,
    'models/marts/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'tests/no_future_signups.sql': SINGULAR_TEST_NO_FUTURE,
    'seeds/countries.csv': COUNTRIES_CSV,
  },
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV_WITH_FUTURE,
    countries: COUNTRIES_CSV,
  },
  tasks: [
    {
      id: 'inspect',
      prompt: 'Open `tests/no_future_signups.sql` and read it. The test passes when this query returns zero rows.',
      hint: "Click the file in the file tree. The pattern: write a SELECT that returns offending rows; empty result = pass.",
      validate: (s) => s.openedFiles.has('tests/no_future_signups.sql'),
    },
    {
      id: 'see-fail',
      prompt: "Run `dbt build`. One of the singular tests will fail - the raw data has an order dated in the future.",
      hint: "Type `dbt build`. Look for a red line showing which test failed. The test is telling you something about the data.",
      validate: (s) =>
        !s.buildSucceeded &&
        s.lastRun !== null &&
        s.lastRun.command === 'build' &&
        !s.lastRun.usedSelect,
    },
    {
      id: 'show',
      prompt: "Run `dbt show --select stg_orders` to inspect the data. Find the row dated in the future.",
      hint: "Look for a row where `created_at` is far in the future - that's the one the test caught.",
      validate: (s) => modelShown(s, 'stg_orders'),
    },
    {
      id: 'fix-sql',
      prompt: "Fix it the same way as before: filter the offending row out in the staging model. Then re-run only `stg_orders`.",
      hint: "In `models/staging/stg_orders.sql`, add `where created_at <= current_date` as the last line. Then `dbt run --select stg_orders`.",
      validate: (s) =>
        modelSqlMatches(s, 'stg_orders', /where\s+created_at\s*<=\s*current_date/i) &&
        onlyModelsRan(s, ['stg_orders']),
    },
    {
      id: 'add-test',
      prompt: "Good. Now add a second singular test at `tests/no_negative_revenue.sql` that finds rows in `fct_revenue_by_customer` where revenue is negative.",
      hint: "Create the file with:\n```\nselect *\nfrom {{ ref('fct_revenue_by_customer') }}\nwhere revenue < 0\n```",
      validate: (s) =>
        fileMatches(s, 'tests/no_negative_revenue.sql', /from\s+\{\{\s*ref\(\s*['"]fct_revenue_by_customer['"]/i) &&
        fileMatches(s, 'tests/no_negative_revenue.sql', /where\s+revenue\s*<\s*0/i),
    },
    {
      id: 'build',
      prompt: 'Run `dbt build`. All models build and every test - generic and singular - should pass now.',
      hint: '`dbt build` = `dbt run` + `dbt test`, in DAG order. This time everything should be green.',
      validate: (s) =>
        buildSucceeded(s) &&
        s.lastRun !== null &&
        s.lastRun.command === 'build' &&
        !s.lastRun.usedSelect,
    },
  ],
  quiz: {
    question: 'A singular test in `tests/foo.sql` passes when…',
    options: [
      'The query returns at least one row',
      'The query returns zero rows',
      'The query has no syntax errors',
      'The file exists',
    ],
    correctIndex: 1,
    explanation: "Singular tests are 'find me the bad rows' queries. Zero bad rows = pass.",
  },
  furtherReading: [
    { label: 'Singular data tests', url: 'https://docs.getdbt.com/docs/build/data-tests#singular-data-tests' },
  ],
}

export default lesson13
