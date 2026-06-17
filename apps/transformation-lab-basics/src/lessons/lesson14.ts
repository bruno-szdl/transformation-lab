import type { Lesson } from '../engine/types'
import { buildSucceeded, modelRan, allTestsPass, testFailed } from '../engine/validators'
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

const lesson14: Lesson = {
  id: 14,
  title: 'Putting it all together: dbt build',
  concept: `Take a look around. This is the project you've been building lesson by lesson:

- A well-defined \`raw\` source declared in YAML
- Two staging models (\`stg_customers\`, \`stg_orders\`) reading from it
- An intermediate model with a filter (\`int_paid_orders\`) and three marts (\`dim_customers\`, \`dim_countries\`, \`fct_revenue_by_customer\`)
- A \`countries\` seed feeding \`dim_countries\`
- Generic tests (\`not_null\`, \`unique\`, \`relationships\`, \`accepted_values\`), descriptions, and one singular test
- All organized in the standard \`staging/intermediate/marts\` structure

\`dbt build\` is the one command you'll run most in real projects. A single command handles everything in one pass:

1. **Seeds** - loads CSV files from \`seeds/\` into the warehouse
2. **Models** - materializes each model in dependency order
3. **Tests** - runs tests immediately after each model, and skips downstream models if one fails
4. **Snapshots** - captures slowly-changing-dimension history (a later lab in this series covers this; see the dbt docs link below)

That last point is the safety net: no broken upstream data quietly poisons a dashboard.

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
      id: 'build',
      prompt: 'Run `dbt build`. It will load seeds, materialize every model, and run every test - all in one command.',
      hint: 'A single command does the whole thing: `dbt build`.',
      validate: (s) =>
        buildSucceeded(s) &&
        s.lastRun !== null &&
        s.lastRun.command === 'build' &&
        !s.lastRun.usedSelect,
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
    {
      id: 'skip',
      prompt:
        "See the safety net in action. Edit `models/staging/_schema.yml` so the `accepted_values` test on `stg_orders.status` no longer allows the value present in order 106. Then `dbt build` again and watch what happens to the models downstream of `stg_orders`.",
      hint: "Order 106 has status `pending`. Drop `'pending'` from the `accepted_values` list so the list becomes `values: ['paid', 'refunded']`, save, then run `dbt build`. `int_paid_orders` and `fct_revenue_by_customer` should be **skipped** rather than built on bad data.",
      validate: (s) => testFailed(s, 'stg_orders'),
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
    { label: 'Snapshots (coming in a later lab)', url: 'https://docs.getdbt.com/docs/build/snapshots' },
  ],
}

export default lesson14
