import type { Lesson } from '../engine/types'
import {
  modelSqlMatches,
  onlyModelsRan,
  lastRunSelected,
  buildSucceeded,
} from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV,
  STG_CUSTOMERS_HARDCODED,
  STG_ORDERS_HARDCODED,
  DIM_CUSTOMERS_TABLE,
  INT_PAID_ORDERS,
  FCT_REVENUE_BY_CUSTOMER,
} from './_canonical'

const lesson05: Lesson = {
  id: 5,
  title: 'Selecting models',
  panels: ['lineage', 'files', 'warehouse'],
  concept: `So far every command you've run has touched the **whole project**. \`dbt run\` rebuilds every model, every time. On a real project with hundreds of models that's slow -and usually unnecessary. While you're iterating on a single model, you only want to rebuild *that* model.

That's what the \`--select\` flag is for:

\`\`\`bash
dbt run --select stg_customers
\`\`\`

This materializes only \`stg_customers\` and nothing else. There's a shorthand too -\`-s\` means exactly the same thing:

\`\`\`bash
dbt run -s stg_customers
\`\`\`

Watch the lineage graph as you type a selector: the models that *aren't* selected fade out, so you can see at a glance what a command will touch before you run it.

In this lesson the project is already built. You'll make a small change to one model, rebuild just that model, and then do a full \`dbt run\` to put everything back in sync.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/stg_orders.sql': STG_ORDERS_HARDCODED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
  },
  openFiles: ['models/stg_customers.sql'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
  },
  preRanModels: [
    'stg_customers',
    'stg_orders',
    'dim_customers',
    'int_paid_orders',
    'fct_revenue_by_customer',
  ],
  tasks: [
    {
      id: 'edit-stg',
      prompt: "In `models/stg_customers.sql`, remove the `country` column from the SELECT list -nothing downstream uses it.",
      hint: "Delete the `country,` line (and the trailing comma on the line above it if needed) so the model selects only `id`, `name`, and `email`.",
      validate: (s) => !modelSqlMatches(s, 'stg_customers', /\bcountry\b/),
    },
    {
      id: 'select-one',
      prompt: 'You just edited `stg_customers`. Re-run only that model so the change lands in the warehouse - without re-running the rest of the project. Watch the graph dim everything else as you type.',
      hint: '`dbt run --select stg_customers` narrows the run to a single model.',
      validate: (s) => onlyModelsRan(s, ['stg_customers']),
    },
    {
      id: 'select-short-flag',
      prompt: 'Try the shorthand for `--select` to re-run just `dim_customers`.',
      hint: '`-s` is an alias for `--select`. So: `dbt run -s dim_customers`.',
      validate: (s) => lastRunSelected(s, ['dim_customers']),
    },
    {
      id: 'run-all',
      prompt: 'Now put the whole project back in sync.',
      hint: 'Drop the selector entirely: `dbt run`.',
      validate: (s) =>
        buildSucceeded(s) &&
        s.lastRun !== null &&
        s.lastRun.command === 'run' &&
        !s.lastRun.usedSelect,
    },
  ],
  quiz: {
    question: 'What does `dbt run --select stg_customers` do?',
    options: [
      'Runs every model except stg_customers',
      'Builds only the stg_customers model',
      'Runs stg_customers and all of its downstream models',
      'Previews the rows in stg_customers',
    ],
    correctIndex: 1,
    explanation: '`--select stg_customers` narrows the run to exactly that one model. `-s` is the shorthand for the same flag.',
  },
  furtherReading: [
    { label: 'Node selection syntax', url: 'https://docs.getdbt.com/reference/node-selection/syntax' },
  ],
}

export default lesson05
