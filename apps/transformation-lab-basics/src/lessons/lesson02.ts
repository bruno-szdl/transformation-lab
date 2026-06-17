import type { Lesson } from '../engine/types'
import {
  hasModel,
  modelRan,
  modelRefs,
  modelCompiled,
  modelSelectsExactly,
  lineageHasEdge,
} from '../engine/validators'
import { RAW_CUSTOMERS_CSV, STG_CUSTOMERS_HARDCODED } from './_canonical'

const lesson02: Lesson = {
  id: 2,
  title: 'ref() and the DAG',
  panels: ['warehouse', 'lineage'],
  concept: `Models almost never stand alone. They read from other models. Instead of hardcoding the table name, you use \`{{ ref('model_name') }}\`. dbt parses every \`ref()\` call to figure out which model depends on which, and that becomes the **DAG** (the lineage graph on the right).

The \`{{ ... }}\` is **Jinja**, a templating language. A dbt model file is SQL with bits of Jinja mixed in. Before running anything, dbt **compiles** the Jinja away: \`{{ ref('stg_customers') }}\` becomes the real table name in your warehouse. You can see a model's compiled SQL with \`dbt compile --select <model>\` - selecting a single model makes dbt print it (plain \`dbt compile\` compiles every model to files but prints nothing).

In our project, \`stg_customers\` is in place from the previous lesson. Now you'll build a couple of models on top of it using \`ref()\`.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/dim_customers.sql': `-- Replace this line with a SELECT that uses {{ ref('stg_customers') }}.
`,
    'models/customer_emails.sql': `-- Replace this line with a SELECT of id and email from {{ ref('stg_customers') }}.
`,
  },
  openFiles: [
    'models/dim_customers.sql',
    'models/customer_emails.sql',
    'models/stg_customers.sql',
  ],
  seeds: { 'raw.customers': RAW_CUSTOMERS_CSV },
  preRanModels: ['stg_customers'],
  tasks: [
    {
      id: 'create',
      prompt: 'In `models/dim_customers.sql`, write a SELECT that reads all columns from `stg_customers` using `ref()`.',
      hint: "Try: `select * from {{ ref('stg_customers') }}`",
      validate: (s) => hasModel(s, 'dim_customers') && modelRefs(s, 'dim_customers', 'stg_customers'),
    },
    {
      id: 'create-emails',
      prompt: 'Now do it again in `models/customer_emails.sql`: select just `id` and `email` from `stg_customers`, again using `ref()`.',
      hint: "Same pattern, fewer columns: `select id, email from {{ ref('stg_customers') }}`",
      validate: (s) =>
        hasModel(s, 'customer_emails') &&
        modelRefs(s, 'customer_emails', 'stg_customers') &&
        modelSelectsExactly(s, 'customer_emails', ['id', 'email']),
    },
    {
      id: 'lineage',
      prompt: 'Look at the lineage graph -`stg_customers` should now fan out to both models you just wrote.',
      hint: "The DAG updates as soon as the ref() is in your file. Look at the lineage tab.",
      validate: (s) =>
        lineageHasEdge(s, 'stg_customers', 'dim_customers') &&
        lineageHasEdge(s, 'stg_customers', 'customer_emails'),
    },
    {
      id: 'compile',
      prompt: 'Run `dbt compile --select customer_emails` and read the output - dbt prints the compiled SQL, with `{{ ref(\'stg_customers\') }}` replaced by the real table name.',
      hint: '`dbt compile` turns the Jinja into plain SQL. Selecting one model makes dbt print it: `dbt compile --select customer_emails`.',
      validate: (s) => modelCompiled(s, 'customer_emails'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and make sure both new models build.',
      validate: (s) =>
        s.buildSucceeded && modelRan(s, 'dim_customers') && modelRan(s, 'customer_emails'),
    },
  ],
  quiz: {
    question: 'Why use `{{ ref(...) }}` instead of hardcoding a table name?',
    options: [
      'It runs faster',
      'It lets dbt understand model dependencies and order builds correctly',
      "It's required by SQL",
      "It's just shorter to type",
    ],
    correctIndex: 1,
    explanation: '`ref()` is what gives dbt the dependency graph. Without it, dbt has no idea your model depends on another model.',
  },
  goal: {
    dagShape: {
      nodes: [
        { id: 'stg_customers', label: 'stg_customers', layer: 'staging' },
        { id: 'dim_customers', label: 'dim_customers', layer: 'mart' },
        { id: 'customer_emails', label: 'customer_emails', layer: 'mart' },
      ],
      edges: [
        { source: 'stg_customers', target: 'dim_customers' },
        { source: 'stg_customers', target: 'customer_emails' },
      ],
    },
  },
  furtherReading: [
    { label: 'ref() function', url: 'https://docs.getdbt.com/reference/dbt-jinja-functions/ref' },
    { label: 'About Jinja', url: 'https://docs.getdbt.com/docs/build/jinja-macros' },
  ],
}

export default lesson02
