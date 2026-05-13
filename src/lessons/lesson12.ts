import type { Lesson } from '../engine/types'
import { buildSucceeded, modelRan, allTestsPass } from '../engine/validators'
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
  SCHEMA_YML_L9,
  SINGULAR_TEST_NO_FUTURE,
} from './_canonical'

const lesson12: Lesson = {
  id: 12,
  title: 'Putting it all together: dbt build',
  concept: `Take a look around. This is the project you've been building lesson by lesson:

- A canonical \`raw\` source declared in YAML
- Two staging models (\`stg_customers\`, \`stg_orders\`) reading from it
- An intermediate filter (\`int_paid_orders\`) and three marts (\`dim_customers\`, \`dim_countries\`, \`fct_revenue_by_customer\`)
- A \`countries\` seed feeding \`dim_countries\`
- Generic tests (\`not_null\`, \`unique\`, \`relationships\`, \`accepted_values\`), descriptions, and one singular test
- All laid out in the canonical \`staging/intermediate/marts\` structure

\`dbt build\` is the one command you'll run most in real projects. It walks the DAG once and, for each node:

1. Builds the model (or loads the seed, or runs the snapshot)
2. Immediately runs every test attached to it

If a test fails, downstream models that depend on the bad data are skipped. That's the safety net: no broken upstream data quietly poisons a dashboard.

Run \`dbt build\` and watch the whole project go.`,
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
    'raw.orders': RAW_ORDERS_CSV,
  },
  tasks: [
    {
      id: 'seed',
      prompt: 'First, run `dbt seed` to load `countries.csv` into the warehouse.',
      hint: 'A `dbt build` includes seeds, but doing it explicitly here keeps the steps separable.',
      validate: (s) => s.loadedSeeds.has('countries'),
    },
    {
      id: 'build',
      prompt: 'Now run `dbt build`. It will materialize every model and run every test in DAG order.',
      hint: 'A single command does the whole thing: `dbt build`.',
      validate: (s) => buildSucceeded(s),
    },
    {
      id: 'fct',
      prompt: 'Verify `fct_revenue_by_customer` built and passed.',
      validate: (s) => modelRan(s, 'fct_revenue_by_customer'),
    },
    {
      id: 'tests',
      prompt: 'Verify every model has passing tests.',
      validate: (s) =>
        allTestsPass(s, 'stg_customers') && allTestsPass(s, 'stg_orders'),
    },
  ],
  quiz: {
    question: 'Why prefer `dbt build` over `dbt run` + `dbt test` separately?',
    options: [
      "It's shorter to type",
      'It runs tests in DAG order and skips downstream models when upstream tests fail',
      "It's the only way to use sources",
      'It generates documentation',
    ],
    correctIndex: 1,
    explanation: '`dbt build` interleaves tests with builds so bad data is caught the moment it appears, before downstream models consume it.',
  },
  furtherReading: [
    { label: 'dbt build command', url: 'https://docs.getdbt.com/reference/commands/build' },
  ],
}

export default lesson12
