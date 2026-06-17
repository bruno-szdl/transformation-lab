import type { Lesson } from '../engine/types'
import {
  lastRunSelected,
  usedDownstreamOperator,
  usedUpstreamOperator,
  modelSqlMatches,
  buildSucceeded,
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
  SCHEMA_YML_L9,
} from './_canonical'

const lesson12: Lesson = {
  id: 12,
  title: 'Selecting subsets: unions & graph operators',
  panels: ['lineage', 'files', 'warehouse'],
  concept: `In lesson 5 you selected a single model. Now that the project is organized into staging, intermediate, and marts, you'll often want to select a *subset* -and dbt's selector syntax makes that precise.

**Unions.** List several models, separated by spaces, to run all of them:

\`\`\`bash
dbt run --select stg_customers stg_orders
\`\`\`

**Graph operators.** A \`+\` pulls in everything connected through the DAG:

- \`+model\` -the model **and everything upstream** of it (its ancestors)
- \`model+\` -the model **and everything downstream** of it (its descendants)

So \`+fct_revenue_by_customer\` rebuilds that mart *and* every model it depends on, in dependency order.

**Why \`model+\` matters.** Suppose you fix a bug in \`stg_customers\`. Rebuilding *only* \`stg_customers\` isn't enough -the marts built on top of it still hold the old, wrong data. The right move is:

\`\`\`bash
dbt build --select stg_customers+
\`\`\`

\`dbt build\` runs **and tests** each model. Combined with \`stg_customers+\`, it rebuilds the fixed model plus everything downstream *and* re-runs their tests -so bad data can't quietly flow through to a dashboard.

Watch the lineage graph as you type each selector below: it lights up exactly the models the command will touch.`,
  initialFiles: {
    'models/staging/_sources.yml': SOURCES_YML,
    'models/staging/_schema.yml': SCHEMA_YML_L9,
    'models/staging/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/staging/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/intermediate/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/marts/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/marts/dim_countries.sql': DIM_COUNTRIES,
    'models/marts/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'seeds/countries.csv': COUNTRIES_CSV,
  },
  openFiles: ['models/staging/stg_customers.sql'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
    countries: COUNTRIES_CSV,
  },
  preRanModels: [
    'stg_customers',
    'stg_orders',
    'int_paid_orders',
    'dim_customers',
    'dim_countries',
    'fct_revenue_by_customer',
  ],
  tasks: [
    {
      id: 'union',
      prompt: 'Re-run both staging models in a single command using a union selector.',
      hint: '`dbt run --select stg_customers stg_orders` - separating model names with a space selects the union of both.',
      validate: (s) => lastRunSelected(s, ['stg_customers', 'stg_orders']),
    },
    {
      id: 'fix-and-downstream',
      prompt: "Pretend you found a data issue. Add `where email is not null` to `models/staging/stg_customers.sql`, then run `dbt build --select stg_customers+` to rebuild and re-test that model plus everything downstream.",
      hint: "Add `where email is not null` as the last line of `stg_customers.sql`. Then run `dbt build --select stg_customers+` -the trailing `+` pulls in every downstream model.",
      validate: (s) =>
        modelSqlMatches(s, 'stg_customers', /where\s+email\s+is\s+not\s+null/i) &&
        usedDownstreamOperator(s, 'stg_customers'),
    },
    {
      id: 'upstream',
      prompt: 'Now re-run `fct_revenue_by_customer` together with every model it depends on, in dependency order.',
      hint: 'A leading `+` selects the model and all of its ancestors: `dbt run --select +fct_revenue_by_customer`.',
      validate: (s) => usedUpstreamOperator(s, 'fct_revenue_by_customer'),
    },
    {
      id: 'build-all',
      prompt: 'Finally, run a plain `dbt build` to build and test the entire project in one go.',
      hint: 'No selector this time -`dbt build` walks the whole DAG.',
      validate: (s) =>
        buildSucceeded(s) &&
        s.lastRun !== null &&
        s.lastRun.command === 'build' &&
        !s.lastRun.usedSelect,
    },
  ],
  quiz: {
    question: 'You just fixed a bug in `stg_customers`. Which command rebuilds it *and* re-tests everything that depends on it?',
    options: [
      'dbt run --select stg_customers',
      'dbt build --select +stg_customers',
      'dbt build --select stg_customers+',
      'dbt test --select stg_customers',
    ],
    correctIndex: 2,
    explanation: '`stg_customers+` selects the model and everything downstream; `dbt build` runs and tests each one -so the fix propagates and bad data is caught.',
  },
  furtherReading: [
    { label: 'Graph operators', url: 'https://docs.getdbt.com/reference/node-selection/graph-operators' },
  ],
}

export default lesson12
