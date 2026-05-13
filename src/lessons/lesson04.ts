import type { Lesson } from '../engine/types'
import { modelMaterialization, modelRan } from '../engine/validators'
import {
  RAW_CUSTOMERS_CSV,
  RAW_ORDERS_CSV,
  STG_CUSTOMERS_HARDCODED,
  DIM_CUSTOMERS_VIEW,
  STG_ORDERS_HARDCODED,
  INT_PAID_ORDERS,
  FCT_REVENUE_BY_CUSTOMER,
} from './_canonical'

const lesson04: Lesson = {
  id: 4,
  title: 'Materializations: view vs table',
  panels: ['lineage', 'files', 'warehouse'],
  concept: `By default, every dbt model becomes a **view** (a saved query that re-runs every time it's selected). Views are cheap to build but slow to query.

When a model is queried frequently or is expensive to compute, you'll want a **table** (the result is physically stored). You switch the materialization with a config block at the top of the model:

\`\`\`sql
{{ config(materialized='table') }}

select ...
\`\`\`

Our project's marts get hit often by downstream consumers. Convert \`dim_customers\` to a table so reads are fast.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/dim_customers.sql': DIM_CUSTOMERS_VIEW,
    'models/stg_orders.sql': STG_ORDERS_HARDCODED,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
  },
  seeds: {
    raw_customers: RAW_CUSTOMERS_CSV,
    raw_orders: RAW_ORDERS_CSV,
  },
  preRanModels: ['stg_customers', 'dim_customers', 'stg_orders', 'int_paid_orders', 'fct_revenue_by_customer'],
  tasks: [
    {
      id: 'table',
      prompt: "Change `dim_customers` so it's materialized as a table (add the config block at the top).",
      hint: "`{{ config(materialized='table') }}` on the first line of the file.",
      validate: (s) => modelMaterialization(s, 'dim_customers', 'table'),
    },
    {
      id: 'view',
      prompt: "Make sure `stg_customers` stays as a view (the default; no config needed).",
      hint: "Views are the default. As long as you haven't added a config block to stg_customers, it's already a view.",
      validate: (s) => modelMaterialization(s, 'stg_customers', 'view'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and watch both models build with their chosen materializations.',
      validate: (s) => modelRan(s, 'dim_customers') && modelRan(s, 'stg_customers'),
    },
  ],
  quiz: {
    question: 'When should you prefer a table materialization over a view?',
    options: [
      'Always. Tables are faster',
      'Never. Views are cheaper',
      "When the model is queried often or is expensive to compute",
      'Only on the first run',
    ],
    correctIndex: 2,
    explanation: 'Tables trade build time for query time. Use them when the read cost outweighs the build cost (typically marts and dashboards).',
  },
  furtherReading: [
    { label: 'Materializations', url: 'https://docs.getdbt.com/docs/build/materializations' },
  ],
}

export default lesson04
