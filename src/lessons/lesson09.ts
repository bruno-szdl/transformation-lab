import type { Lesson } from '../engine/types'
import {
  testDefinitionsInclude,
  relationshipTestPoints,
  allTestsPass,
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
  SCHEMA_YML_L7,
} from './_canonical'

const lesson09: Lesson = {
  id: 9,
  title: 'Relationships & accepted_values',
  concept: `Beyond \`not_null\`/\`unique\`, two more data tests show up constantly:

- **accepted_values**: column must be one of a fixed list. Great for status fields where a typo or new value could silently break dashboards.
- **relationships**: every value in this column must exist in another model's column. This is a foreign-key check, without you ever writing one.

Both are declared in YAML under \`data_tests:\`, alongside the simpler data tests. Their syntax is slightly more involved because they take parameters:

\`\`\`yaml
- name: status
  data_tests:
    - accepted_values:
        arguments:
          values: ['paid', 'refunded', 'pending']
- name: customer_id
  data_tests:
    - relationships:
        arguments:
          to: ref('stg_customers')
          field: id
\`\`\`

Notice the indentation: the test name (\`accepted_values\` / \`relationships\`) is followed by a colon, then the parameter block indented underneath.

Our \`stg_customers\` already has \`not_null\` + \`unique\` from the previous lesson. Now you'll add the two new data tests to \`stg_orders\`.`,
  initialFiles: {
    'models/sources.yml': SOURCES_YML,
    'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
    'models/stg_orders.sql': STG_ORDERS_SOURCED,
    'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
    'models/int_paid_orders.sql': INT_PAID_ORDERS,
    'models/fct_revenue_by_customer.sql': FCT_REVENUE_BY_CUSTOMER,
    'models/dim_countries.sql': DIM_COUNTRIES,
    'seeds/countries.csv': COUNTRIES_CSV,
    'models/schema.yml': SCHEMA_YML_L7 + `  - name: stg_orders
    columns:
      - name: status
        data_tests:
          # add an accepted_values data test here
      - name: customer_id
        data_tests:
          # add a relationships data test here
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
      id: 'accepted',
      prompt: "Add an `accepted_values` test to `stg_orders.status` allowing `['paid', 'refunded', 'pending']`.",
      hint: "Under the column's `data_tests:` line, add:\n```\n          - accepted_values:\n              arguments:\n                values: ['paid', 'refunded', 'pending']\n```",
      validate: (s) => testDefinitionsInclude(s, 'stg_orders', ['accepted_values']),
    },
    {
      id: 'rel',
      prompt: "Add a `relationships` test to `stg_orders.customer_id` pointing at `stg_customers.id`.",
      hint: "Add:\n```\n          - relationships:\n              arguments:\n                to: ref('stg_customers')\n                field: id\n```",
      validate: (s) => relationshipTestPoints(s, 'stg_orders', 'customer_id', 'stg_customers', 'id'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt test`. Both new checks should pass.',
      validate: (s) => allTestsPass(s, 'stg_orders'),
    },
  ],
  quiz: {
    question: 'A `relationships` test on column A pointing at model X column B fails when…',
    options: [
      'Column A contains a NULL',
      'Column A contains a value not present in X.B',
      'Column B contains a duplicate',
      "Model X hasn't been built",
    ],
    correctIndex: 1,
    explanation: 'A relationships test fails on orphan rows (values in column A that have no matching row in the referenced model).',
  },
  furtherReading: [
    { label: 'Generic data tests reference', url: 'https://docs.getdbt.com/reference/resource-properties/data-tests' },
  ],
}

export default lesson09
