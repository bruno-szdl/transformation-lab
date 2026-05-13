import type { Lesson } from '../engine/types'
import { hasModel, modelRan, modelRefs, lineageHasEdge } from '../engine/validators'
import { RAW_CUSTOMERS_CSV, STG_CUSTOMERS_HARDCODED } from './_canonical'

const lesson02: Lesson = {
  id: 2,
  title: 'ref() and the DAG',
  panels: ['warehouse', 'lineage'],
  concept: `Models almost never stand alone. They read from other models. Instead of hardcoding the table name, you use \`{{ ref('model_name') }}\`. dbt parses every \`ref()\` call to figure out which model depends on which, and that becomes the **DAG** (the lineage graph on the right).

In our project, \`stg_customers\` is in place from the previous lesson. Now you'll build a \`dim_customers\` model on top of it using \`ref()\`.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
    'models/dim_customers.sql': `-- Replace this line with a SELECT that uses {{ ref('stg_customers') }}.
`,
  },
  seeds: { raw_customers: RAW_CUSTOMERS_CSV },
  preRanModels: ['stg_customers'],
  tasks: [
    {
      id: 'create',
      prompt: 'Open `models/dim_customers.sql` (tab next to `stg_customers.sql`) and write a SELECT that reads all columns from `stg_customers` using `ref()`.',
      hint: "Try: `select * from {{ ref('stg_customers') }}`",
      validate: (s) => hasModel(s, 'dim_customers') && modelRefs(s, 'dim_customers', 'stg_customers'),
    },
    {
      id: 'lineage',
      prompt: 'Confirm the edge `stg_customers → dim_customers` appears in the lineage graph.',
      hint: "The DAG updates as soon as the ref() is in your file. Look at the lineage tab.",
      validate: (s) => lineageHasEdge(s, 'stg_customers', 'dim_customers'),
    },
    {
      id: 'run',
      prompt: 'Run `dbt run` and make sure `dim_customers` builds.',
      validate: (s) => modelRan(s, 'dim_customers'),
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
      ],
      edges: [{ source: 'stg_customers', target: 'dim_customers' }],
    },
  },
  furtherReading: [
    { label: 'ref() function', url: 'https://docs.getdbt.com/reference/dbt-jinja-functions/ref' },
  ],
}

export default lesson02
