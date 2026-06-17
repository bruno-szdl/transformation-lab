import type { Lesson } from '../engine/types'
import { fileMatches } from '../engine/validators'
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
} from './_canonical'

const lesson10: Lesson = {
  id: 10,
  title: 'Documentation',
  concept: `Every model and column in your YAML can carry a \`description\`. These descriptions are **portable metadata**: once you write them in dbt, they travel:

- they can surface in your data platform / warehouse UI, right next to the column
- \`dbt docs generate\` turns them into a static HTML documentation site
- they populate the catalog in the dbt platform
- custom tools and third-party data catalogs can read them straight from dbt's metadata

(This tool doesn't run \`dbt docs generate\`, but the descriptions you write below are exactly what feeds all of the above.)

Good documentation isn't about completeness. It's about the *non-obvious* bits. Compare:

- ❌ \`customer_id\`: *"The customer id"* (the name already says this)
- ✅ \`customer_id\`: *"FK to stg_customers.id; null for guest checkouts"* (semantics + nullability)

If a name is self-explanatory, you don't need to describe it. Spend your words on what the name *can't* tell you: what a status value means, why a column is nullable, which team owns the model.

The project already has data tests on \`stg_customers\` and \`stg_orders\`. Now let's add descriptions where they earn their keep.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'models/dim_countries.sql': DIM_COUNTRIES,
    'seeds/countries.csv': COUNTRIES_CSV,
    // Same as L8 but with empty description fields prefilled at model + status.
    'models/schema.yml': `version: 2

models:
  - name: stg_customers
    description: ""
    columns:
      - name: id
        data_tests:
          - not_null
          - unique
      - name: email
        data_tests:
          - not_null
  - name: stg_orders
    columns:
      - name: order_id
        data_tests:
          - not_null
          - unique
      - name: customer_id
        data_tests:
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: id
      - name: status
        description: ""
        data_tests:
          - accepted_values:
              arguments:
                values: ['paid', 'refunded', 'pending']
`,
  },
  openFiles: ['models/schema.yml'],
  seeds: {
    'raw.customers': RAW_CUSTOMERS_CSV,
    'raw.orders': RAW_ORDERS_CSV,
    countries: COUNTRIES_CSV,
  },
  preRanModels: [
    'stg_customers',
    'stg_orders',
    'dim_customers',
    'int_paid_orders',
    'fct_revenue_by_customer',
    'dim_countries',
  ],
  tasks: [
    {
      id: 'model-desc',
      prompt: 'Write a non-empty description on the `stg_customers` model in `schema.yml`.',
      hint: 'Replace the empty `""` after `description:` on the model with a short sentence, e.g. `"One row per customer, cleaned from raw.customers."`',
      validate: (s) => {
        const yml = s.files['models/schema.yml'] ?? ''
        const m = yml.match(/- name: stg_customers[\s\S]*?description:\s*"([^"]+)"/)
        return Boolean(m && m[1].trim().length >= 5)
      },
    },
    {
      id: 'col-desc',
      prompt: 'Write a description on the `status` column explaining what the allowed values mean.',
      hint: "Something like: `\"Order lifecycle: paid, refunded, or pending.\"`",
      validate: (s) => {
        const yml = s.files['models/schema.yml'] ?? ''
        const m = yml.match(/- name: status[\s\S]*?description:\s*"([^"]+)"/)
        return Boolean(m && m[1].trim().length >= 5)
      },
    },
    {
      id: 'mart-desc',
      prompt: 'Add a new entry under `models:` for `fct_revenue_by_customer` with a description (no columns block needed).',
      hint: "At the bottom of `schema.yml`, add:\n```\n  - name: fct_revenue_by_customer\n    description: \"Total paid revenue per customer.\"\n```",
      validate: (s) =>
        fileMatches(
          s,
          'models/schema.yml',
          /- name:\s*fct_revenue_by_customer[\s\S]*?description:\s*"[^"]{5,}"/,
        ),
    },
  ],
  quiz: {
    question: "What's the best column description?",
    options: [
      '"The customer id"',
      '"customer_id"',
      '"FK to stg_customers.id; nullable for guest checkouts"',
      'Leave it blank',
    ],
    correctIndex: 2,
    explanation: 'Descriptions earn their keep by capturing what the name alone cannot: semantics, nullability, ownership.',
  },
  furtherReading: [
    { label: 'Documentation', url: 'https://docs.getdbt.com/docs/build/documentation' },
  ],
}

export default lesson10
