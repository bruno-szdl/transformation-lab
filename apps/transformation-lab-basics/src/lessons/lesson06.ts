import type { Lesson } from '../engine/types'
import {
  sourceDefined,
  modelRan,
  fileMatches,
  lineageHasSourceEdge,
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

const lesson06: Lesson = {
  id: 6,
  title: 'Sources',
  concept: `So far our staging models read directly from tables like \`raw.customers\` and \`raw.orders\`, using hardcoded schema-qualified names. That works, but it has problems: nothing tells dbt where those tables came from, the DAG doesn't show the real upstream system, and there's no place to attach tests or freshness checks on the raw side.

The fix: declare **sources** in a \`.yml\` file, then read them with \`{{ source('schema', 'table') }}\` in your models.

The YAML format looks like this:

\`\`\`yaml
version: 2

sources:
  - name: raw    # the schema
    tables:
      - name: customers
      - name: orders
\`\`\`

In this lesson you'll declare both raw tables as sources, then refactor \`stg_customers\` and \`stg_orders\` to use \`source()\` instead of the hardcoded names.`,
  initialFiles: {
    'models/sources.yml': `version: 2

sources:
  - name: raw
    tables:
      # add "- name: customers" and "- name: orders" entries below
`,
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/stg_orders.sql': STG_ORDERS_HARDCODED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
  },
  openFiles: ['models/sources.yml', 'models/stg_customers.sql', 'models/stg_orders.sql'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
  },
  tasks: [
    {
      id: 'declare-customers',
      prompt: 'In `models/sources.yml`, add a `- name: customers` entry under the `raw` source\'s `tables:` list.',
      hint: 'On a new line under `tables:`, write `      - name: customers` (six leading spaces, matching the example in the lesson).',
      validate: (s) => sourceDefined(s, 'raw', 'customers'),
    },
    {
      id: 'declare-orders',
      prompt: 'Add a second entry, `- name: orders`, right below `customers`.',
      hint: 'Same indentation, one line below.',
      validate: (s) => sourceDefined(s, 'raw', 'orders'),
    },
    {
      id: 'use-source-customers',
      prompt: "Refactor `stg_customers.sql` so its FROM clause uses `{{ source('raw', 'customers') }}` instead of the hardcoded `raw.customers`.",
      hint: "Change `from raw.customers` to `from {{ source('raw', 'customers') }}`.",
      validate: (s) =>
        lineageHasSourceEdge(s, 'raw', 'customers', 'stg_customers') &&
        !fileMatches(s, 'models/stg_customers.sql', /\braw\.customers\b/),
    },
    {
      id: 'use-source-orders',
      prompt: "Refactor `stg_orders.sql` the same way, using `{{ source('raw', 'orders') }}`.",
      hint: "Change `from raw.orders` to `from {{ source('raw', 'orders') }}`.",
      validate: (s) =>
        lineageHasSourceEdge(s, 'raw', 'orders', 'stg_orders') &&
        !fileMatches(s, 'models/stg_orders.sql', /\braw\.orders\b/),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and confirm the whole project still builds on top of the new sources.',
      validate: (s) =>
        modelRan(s, 'stg_customers') &&
        modelRan(s, 'stg_orders') &&
        modelRan(s, 'fct_revenue_by_customer'),
    },
  ],
  quiz: {
    question: 'When should you use `source()` vs `ref()`?',
    options: [
      'They are interchangeable',
      "`source()` for raw warehouse tables you didn't build; `ref()` for dbt models",
      '`source()` only in production',
      '`ref()` only for table materializations',
    ],
    correctIndex: 1,
    explanation: '`source()` points to inputs you don\'t own (raw landings, external systems). `ref()` points to other dbt models.',
  },
  goal: {
    dagShape: {
      nodes: [
        { id: 'source.raw.customers', label: 'raw.customers', layer: 'source' },
        { id: 'source.raw.orders', label: 'raw.orders', layer: 'source' },
        { id: 'stg_customers', label: 'stg_customers', layer: 'staging' },
        { id: 'stg_orders', label: 'stg_orders', layer: 'staging' },
      ],
      edges: [
        { source: 'source.raw.customers', target: 'stg_customers' },
        { source: 'source.raw.orders', target: 'stg_orders' },
      ],
    },
  },
  furtherReading: [
    { label: 'Sources', url: 'https://docs.getdbt.com/docs/build/sources' },
  ],
}

export default lesson06
