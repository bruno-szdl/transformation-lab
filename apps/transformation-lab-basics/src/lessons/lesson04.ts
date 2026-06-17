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
  concept: `By default, every dbt model becomes a **view** (a saved query that re-runs every time it's selected). Views are cheap to build but slow to query. (You can change the default project-wide in \`dbt_project.yml\`, but per-model is the override you'll see most.)

When a model is queried frequently or is expensive to compute, you'll want a **table** (the result is physically stored). You switch the **materialization** with a config block at the top of the model:

\`\`\`sql
{{ config(materialized='table') }}

select ...
\`\`\`

Our project's marts get hit often by downstream consumers. Convert \`dim_customers\` and \`fct_revenue_by_customer\` to tables so reads are fast.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/dim_customers.sql': DIM_CUSTOMERS_VIEW,
    'models/stg_orders.sql': STG_ORDERS_HARDCODED,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
  },
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
  },
  openFiles: ['models/dim_customers.sql', 'models/stg_customers.sql'],
  preRanModels: ['stg_customers', 'dim_customers', 'stg_orders', 'int_paid_orders', 'fct_revenue_by_customer'],
  tasks: [
    {
      id: 'table',
      prompt: "Change `dim_customers` so it's materialized as a table (add the config block at the top).",
      hint: "`{{ config(materialized='table') }}` on the first line of the file.",
      validate: (s) => modelMaterialization(s, 'dim_customers', 'table'),
    },
    {
      id: 'table-fct',
      prompt: "Do the same for `fct_revenue_by_customer` -it's a mart, so it should be a table too.",
      hint: "Same config block at the top of `models/fct_revenue_by_customer.sql`: `{{ config(materialized='table') }}`.",
      validate: (s) => modelMaterialization(s, 'fct_revenue_by_customer', 'table'),
    },
    {
      id: 'view',
      prompt: "Make sure `stg_customers` stays as a view (the default; no config needed).",
      hint: "Views are the default. As long as you haven't added a config block to stg_customers, it's already a view.",
      validate: (s) => modelMaterialization(s, 'stg_customers', 'view'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and watch each model build with its chosen materialization.',
      validate: (s) =>
        s.buildSucceeded &&
        modelRan(s, 'dim_customers') &&
        modelRan(s, 'fct_revenue_by_customer') &&
        modelRan(s, 'stg_customers'),
    },
  ],
  quiz: {
    question: 'A mart is rebuilt once a night and queried hundreds of times during the day by a BI dashboard. View or table?',
    options: [
      'View - the query is simple, so re-running it each time is cheap',
      'Table - pay the compute once at build time so every dashboard read is fast',
      'View - tables can\'t be queried by BI tools',
      'Doesn\'t matter - dbt picks the optimal materialization automatically',
    ],
    correctIndex: 1,
    explanation: 'Tables trade build cost for read cost. Once a model is queried far more often than it\'s rebuilt - exactly the dashboard pattern - materializing as a table pays for itself many times over.',
  },
  furtherReading: [
    { label: 'Materializations', url: 'https://docs.getdbt.com/docs/build/materializations' },
  ],
}

export default lesson04
