import type { Lesson } from '../engine/types'
import { modelRan, modelShown } from '../engine/validators'
import { RAW_CUSTOMERS_CSV, STG_CUSTOMERS_HARDCODED } from './_canonical'

const lesson01: Lesson = {
  id: 1,
  title: 'Your first dbt model',
  panels: ['warehouse'],
  // Keep the early view focused on models - the engine infra/macros sync but stay out of the tree (D30).
  hiddenGlobs: ['dbt_project.yml', 'profiles.yml', 'macros/**'],
  concept: `Throughout this course you'll be working on a single fictional dbt project for a small e-commerce company. Each lesson adds one new concept on top of what came before.

A **model** in dbt is just a \`SELECT\` statement saved as a \`.sql\` file inside the \`models/\` folder. When you run dbt, it turns that query into a **view** in your Database (a saved query the Database knows by name).

The project already has one model: \`stg_customers.sql\`. It reads from a raw table called \`raw.customers\`.

Two commands you'll use constantly:

- \`dbt run\`: materializes every model. After it finishes, \`stg_customers\` will appear in the **Database** panel as a view.

- \`dbt show --select <model>\`: previews the rows of a model.

Try them below.`,
  initialFiles: {
    'models/stg_customers.sql': STG_CUSTOMERS_HARDCODED,
  },
  seeds: { 'raw.customers': RAW_CUSTOMERS_CSV },
  tasks: [
    {
      id: 'run',
      prompt: 'Run `dbt run` in the terminal to build the stg_customers model in your Database.',
      hint: 'Type `dbt run` at the prompt and press Enter.',
      validate: (s) => modelRan(s, 'stg_customers'),
    },
    {
      id: 'show',
      prompt: 'Preview the rows by running `dbt show --select stg_customers`.',
      hint: '`dbt show` reads the materialized result back from the warehouse.',
      validate: (s) => modelShown(s, 'stg_customers'),
    },
  ],
  quiz: {
    question: 'You want to materialize your models in the warehouse - but you don\'t want to run any tests yet. Which command does exactly that?',
    options: [
      '`dbt compile` - turns Jinja into SQL only',
      '`dbt run` - materializes models, no tests',
      '`dbt build` - materializes models *and* runs tests',
      '`dbt test` - runs tests on already-built models',
    ],
    correctIndex: 1,
    explanation: '`dbt run` is the build-without-test path. `dbt build` does both in one go (you\'ll meet it later); `dbt compile` only renders the Jinja and stops; `dbt test` runs tests on what is already in the warehouse.',
  },
  goal: {
    dagShape: {
      nodes: [{ id: 'stg_customers', label: 'stg_customers', layer: 'staging' }],
      edges: [],
    },
  },
  furtherReading: [
    { label: 'dbt run command reference', url: 'https://docs.getdbt.com/reference/commands/run' },
    { label: 'About dbt models', url: 'https://docs.getdbt.com/docs/build/models' },
  ],
}

export default lesson01
