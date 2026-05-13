import type { Lesson } from '../engine/types'
import {
  hasModel,
  modelRan,
  modelRefs,
  modelSqlMatches,
  lineageHasEdge,
} from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV,
  STG_CUSTOMERS_HARDCODED,
  DIM_CUSTOMERS_VIEW,
  STG_ORDERS_HARDCODED,
} from './_canonical'

const lesson03: Lesson = {
  id: 3,
  title: 'Multi-step pipelines',
  panels: ['warehouse', 'lineage', 'files'],
  concept: `Real pipelines have intermediate steps. A common pattern is:

\`staging → intermediate → mart\`

Staging cleans the raw input. Intermediate joins, filters, or aggregates. Marts are the polished outputs the business consumes. Each step is its own model, connected by \`ref()\`.

So far our project handles customers. Now we'll add orders. \`stg_orders\` is already in place. Your job is to build the two steps that turn it into a revenue mart:

1. \`int_paid_orders\` — keeps only \`status = 'paid'\` rows.
2. \`fct_revenue_by_customer\` — sums paid \`amount\` per customer.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/dim_customers.sql': DIM_CUSTOMERS_VIEW,
    'models/stg_orders.sql': STG_ORDERS_HARDCODED,
    'models/int_paid_orders.sql': `-- Select every column from stg_orders, but only the rows where status = 'paid'.
-- Use {{ ref('stg_orders') }} so dbt knows about the dependency.
`,
  },
  seeds: {
    raw_customers: RAW_CUSTOMERS_CSV,
    raw_orders: RAW_ORDERS_CSV,
  },
  preRanModels: ['stg_customers', 'dim_customers', 'stg_orders'],
  tasks: [
    {
      id: 'int-ref',
      prompt: 'Open `models/int_paid_orders.sql` and write a `select` that reads from `{{ ref(\'stg_orders\') }}`.',
      hint: "Start with: `select * from {{ ref('stg_orders') }}`. You'll add the WHERE next.",
      validate: (s) => hasModel(s, 'int_paid_orders') && modelRefs(s, 'int_paid_orders', 'stg_orders'),
    },
    {
      id: 'int-filter',
      prompt: 'Add a `where` clause that keeps only `status = \'paid\'`.',
      hint: "Append `where status = 'paid'` (single quotes around `paid`).",
      validate: (s) =>
        modelRefs(s, 'int_paid_orders', 'stg_orders') &&
        modelSqlMatches(s, 'int_paid_orders', /where\s+status\s*=\s*'paid'/i),
    },
    {
      id: 'mart',
      prompt: 'Create `models/fct_revenue_by_customer.sql` that sums `amount` from `int_paid_orders` grouped by `customer_id`.',
      hint: "Try:\n```\nselect\n  customer_id,\n  sum(amount) as revenue\nfrom {{ ref('int_paid_orders') }}\ngroup by customer_id\n```",
      validate: (s) =>
        hasModel(s, 'fct_revenue_by_customer') &&
        modelRefs(s, 'fct_revenue_by_customer', 'int_paid_orders') &&
        modelSqlMatches(s, 'fct_revenue_by_customer', /sum\s*\(\s*amount\s*\)/i) &&
        modelSqlMatches(s, 'fct_revenue_by_customer', /group\s+by\s+customer_id/i),
    },
    {
      id: 'edges',
      prompt: 'Verify the DAG shows the full chain: `stg_orders → int_paid_orders → fct_revenue_by_customer`.',
      validate: (s) =>
        lineageHasEdge(s, 'stg_orders', 'int_paid_orders') &&
        lineageHasEdge(s, 'int_paid_orders', 'fct_revenue_by_customer'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and confirm all the new models build.',
      validate: (s) =>
        modelRan(s, 'stg_orders') &&
        modelRan(s, 'int_paid_orders') &&
        modelRan(s, 'fct_revenue_by_customer'),
    },
    {
      id: 'show',
      prompt: 'Preview the mart with `dbt show --select fct_revenue_by_customer` to see revenue per customer.',
      hint: 'You should see a row per `customer_id` with a `revenue` total. Refunded and pending orders should not be counted.',
      validate: (s) => s.shownModels.has('fct_revenue_by_customer'),
    },
  ],
  quiz: {
    question: 'What happens if you change `stg_orders` and run `dbt run`?',
    options: [
      'Only `stg_orders` is rebuilt',
      'Every model in the project is rebuilt in dependency order',
      'You have to manually rebuild downstream models',
      'Nothing. dbt only rebuilds when files are renamed',
    ],
    correctIndex: 1,
    explanation: '`dbt run` rebuilds all models in topological order, so downstream models always see the latest upstream output.',
  },
  goal: {
    dagShape: {
      nodes: [
        { id: 'stg_customers', label: 'stg_customers', layer: 'staging' },
        { id: 'dim_customers', label: 'dim_customers', layer: 'mart' },
        { id: 'stg_orders', label: 'stg_orders', layer: 'staging' },
        { id: 'int_paid_orders', label: 'int_paid_orders', layer: 'intermediate' },
        { id: 'fct_revenue_by_customer', label: 'fct_revenue_by_customer', layer: 'mart' },
      ],
      edges: [
        { source: 'stg_customers', target: 'dim_customers' },
        { source: 'stg_orders', target: 'int_paid_orders' },
        { source: 'int_paid_orders', target: 'fct_revenue_by_customer' },
      ],
    },
  },
  furtherReading: [
    { label: 'How we structure dbt projects', url: 'https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview' },
  ],
}

export default lesson03
