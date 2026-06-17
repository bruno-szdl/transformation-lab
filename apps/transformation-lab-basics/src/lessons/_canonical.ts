/**
 * Reference project snapshot.
 *
 * Every lesson is a slice of the same fictional dbt project. The constants
 * below are the "ideal" file contents at each milestone - what the learner's
 * project would look like if they had completed every previous lesson
 * perfectly. Each lesson imports the snapshot it starts from.
 *
 * Schema (never changes across lessons):
 *   raw.customers(id, name, email, country)
 *   raw.orders(id, customer_id, amount, status, created_at)
 *     status ∈ {'paid', 'refunded', 'pending'}
 */

// ─── Raw data ──────────────────────────────────────────────────────────────

export const RAW_CUSTOMERS_CSV = `id,name,email,country
1,Alice,alice@example.com,US
2,Bob,bob@example.com,CA
3,Carol,carol@example.com,BR
4,Dave,dave@example.com,IN
5,Eve,eve@example.com,DE`

export const RAW_ORDERS_CSV = `id,customer_id,amount,status,created_at
101,1,42.00,paid,2024-01-10
102,2,18.50,paid,2024-01-12
103,1,99.00,refunded,2024-01-15
104,3,12.75,paid,2024-02-01
105,4,55.00,paid,2024-02-04
106,2,8.00,pending,2024-02-09`

/**
 * Dirty variant of raw.customers - Eve's email is missing. IDs stay unique, so
 * only a `not_null` test on `email` catches it. Used by lesson 8 to let the
 * learner experience a test failing on real bad data, then fix it.
 */
export const RAW_CUSTOMERS_CSV_DIRTY = `id,name,email,country
1,Alice,alice@example.com,US
2,Bob,bob@example.com,CA
3,Carol,carol@example.com,BR
4,Dave,dave@example.com,IN
5,Eve,,DE`

/**
 * Dirty variant of raw.orders - order 105 has status 'cancelled' (not in the accepted list).
 * Used by lesson 9 to let the learner experience accepted_values failing on real bad data, then fix it.
 */
export const RAW_ORDERS_CSV_DIRTY = `id,customer_id,amount,status,created_at
101,1,42.00,paid,2024-01-10
102,2,18.50,paid,2024-01-12
103,1,99.00,refunded,2024-01-15
104,3,12.75,paid,2024-02-01
105,4,55.00,cancelled,2024-02-04
106,2,8.00,pending,2024-02-09`

/**
 * Dirty variant of raw.orders - order 107 is dated far in the future (2099).
 * Used by lesson 13 to let the learner experience a singular test failing on real bad data, then fix it.
 */
export const RAW_ORDERS_CSV_WITH_FUTURE = `id,customer_id,amount,status,created_at
101,1,42.00,paid,2024-01-10
102,2,18.50,paid,2024-01-12
103,1,99.00,refunded,2024-01-15
104,3,12.75,paid,2024-02-01
105,4,55.00,paid,2024-02-04
106,2,8.00,pending,2024-02-09
107,1,25.00,paid,2099-01-01`

export const COUNTRIES_CSV = `code,name,region
US,United States,Americas
CA,Canada,Americas
BR,Brazil,Americas
IN,India,Asia
DE,Germany,Europe`

// ─── Pre-source form (lessons 1–4: hardcoded schema.table, no source()) ─────

export const STG_CUSTOMERS_HARDCODED = `select
    id,
    name,
    email,
    country
from raw.customers`

export const STG_ORDERS_HARDCODED = `select
    id as order_id,
    customer_id,
    amount,
    status,
    created_at
from raw.orders`

// ─── Source form (lessons 5+: uses {{ source(...) }}) ──────────────────────

export const STG_CUSTOMERS_SOURCED = `select
    id,
    name,
    email,
    country
from {{ source('raw', 'customers') }}`

export const STG_ORDERS_SOURCED = `select
    id as order_id,
    customer_id,
    amount,
    status,
    created_at
from {{ source('raw', 'orders') }}`

// ─── Downstream models (stable from the lesson they're introduced) ────────

export const DIM_CUSTOMERS_VIEW = `select * from {{ ref('stg_customers') }}`

export const DIM_CUSTOMERS_TABLE = `{{ config(materialized='table') }}

select * from {{ ref('stg_customers') }}`

export const INT_PAID_ORDERS = `select *
from {{ ref('stg_orders') }}
where status = 'paid'`

export const FCT_REVENUE_BY_CUSTOMER = `select
    customer_id,
    sum(amount) as revenue
from {{ ref('int_paid_orders') }}
group by customer_id`

export const DIM_COUNTRIES = `select
    code,
    name,
    region
from {{ ref('countries') }}`

// ─── YAML files ────────────────────────────────────────────────────────────

export const SOURCES_YML = `version: 2

sources:
  - name: raw
    tables:
      - name: customers
      - name: orders
`

/** schema.yml as of lesson 7 - just stg_customers.id has not_null + unique. */
export const SCHEMA_YML_L7 = `version: 2

models:
  - name: stg_customers
    columns:
      - name: id
        data_tests:
          - not_null
          - unique
      - name: email
        data_tests:
          - not_null
`

/** schema.yml as of lesson 8 - adds relationships + accepted_values on stg_orders. */
export const SCHEMA_YML_L8 = `version: 2

models:
  - name: stg_customers
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
        data_tests:
          - accepted_values:
              arguments:
                values: ['paid', 'refunded', 'pending']
`

/** schema.yml as of lesson 9 - descriptions added. */
export const SCHEMA_YML_L9 = `version: 2

models:
  - name: stg_customers
    description: "One row per customer, cleaned from raw.customers."
    columns:
      - name: id
        description: "Primary key. Stable across the customer lifecycle."
        data_tests:
          - not_null
          - unique
      - name: email
        description: "Customer email. Used as the contact channel; never null."
        data_tests:
          - not_null
  - name: stg_orders
    description: "One row per order, cleaned from raw.orders."
    columns:
      - name: order_id
        description: "Primary key."
        data_tests:
          - not_null
          - unique
      - name: customer_id
        description: "FK to stg_customers.id."
        data_tests:
          - relationships:
              arguments:
                to: ref('stg_customers')
                field: id
      - name: status
        description: "Order lifecycle: paid, refunded, or pending."
        data_tests:
          - accepted_values:
              arguments:
                values: ['paid', 'refunded', 'pending']
  - name: fct_revenue_by_customer
    description: "Total paid revenue per customer (refunds and pending excluded)."
`

export const SINGULAR_TEST_NO_FUTURE = `-- Returns rows where created_at is in the future.
-- Singular tests fail when they return any rows. So empty = pass.

select *
from {{ ref('stg_orders') }}
where created_at > current_date`
