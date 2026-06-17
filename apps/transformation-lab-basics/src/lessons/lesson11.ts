import type { Lesson } from '../engine/types'
import { modelRan } from '../engine/validators'
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

const lesson11: Lesson = {
  id: 11,
  title: 'Project structure: staging, intermediate, marts',
  concept: `The dbt community has a strong convention for organizing models into three layers:

- **staging/**: one model per source table, light cleaning (renames, casts). Prefixed \`stg_\`.
- **intermediate/**: joins and reusable building blocks. Prefixed \`int_\`.
- **marts/**: business-facing tables (often dimensional). Prefixed \`dim_\` or \`fct_\`.

Folders aren't enforced by dbt, but following the convention makes any dbt project instantly readable. Until now our project has kept everything flat in \`models/\`. In this lesson you'll refactor it into the standard three-layer layout.

Right-click a file (or hover and click the rename icon) to move it. dbt identifies models by filename, not by folder path, so this is purely organizational.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/schema.yml': SCHEMA_YML_L9,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/dim_countries.sql': DIM_COUNTRIES,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'models/staging/.gitkeep': '',
    'models/intermediate/.gitkeep': '',
    'models/marts/.gitkeep': '',
    'seeds/countries.csv': COUNTRIES_CSV,
  },
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
    countries: COUNTRIES_CSV,
  },
  tasks: [
    {
      id: 'move-staging',
      prompt: 'Move both `stg_customers.sql` and `stg_orders.sql` into the `models/staging/` folder. (Rename each file to `models/staging/<name>.sql`.)',
      hint: 'Right-click a file (or hover for the rename icon) and change the path to `models/staging/stg_customers.sql`.',
      validate: (s) =>
        Boolean(s.files['models/staging/stg_customers.sql']) &&
        Boolean(s.files['models/staging/stg_orders.sql']) &&
        !s.files['models/stg_customers.sql'] &&
        !s.files['models/stg_orders.sql'],
    },
    {
      id: 'move-intermediate',
      prompt: 'Move `int_paid_orders.sql` into `models/intermediate/`.',
      validate: (s) =>
        Boolean(s.files['models/intermediate/int_paid_orders.sql']) &&
        !s.files['models/int_paid_orders.sql'],
    },
    {
      id: 'move-marts',
      prompt: 'Move `dim_customers.sql`, `dim_countries.sql`, and `fct_revenue_by_customer.sql` into `models/marts/`.',
      hint: 'Three renames. dbt resolves models by name, not path -refs and tests keep working unchanged.',
      validate: (s) =>
        Boolean(s.files['models/marts/dim_customers.sql']) &&
        Boolean(s.files['models/marts/dim_countries.sql']) &&
        Boolean(s.files['models/marts/fct_revenue_by_customer.sql']) &&
        !s.files['models/dim_customers.sql'] &&
        !s.files['models/dim_countries.sql'] &&
        !s.files['models/fct_revenue_by_customer.sql'],
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and verify every model still builds after the reorg.',
      hint: 'Nothing about the SQL needs to change -only the file paths moved.',
      validate: (s) =>
        modelRan(s, 'stg_customers') &&
        modelRan(s, 'stg_orders') &&
        modelRan(s, 'int_paid_orders') &&
        modelRan(s, 'fct_revenue_by_customer'),
    },
  ],
  quiz: {
    question: 'A new teammate sees a model called `int_active_users`. What should they expect?',
    options: [
      'A raw source table',
      'A staging model with light renames',
      'A reusable joined/aggregated model, not yet business-facing',
      'A dashboard',
    ],
    correctIndex: 2,
    explanation: 'The `int_` prefix signals intermediate logic: joins, aggregations, building blocks consumed by marts.',
  },
  furtherReading: [
    { label: 'How we structure dbt projects', url: 'https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview' },
  ],
}

export default lesson11
