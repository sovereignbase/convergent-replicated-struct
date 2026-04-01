import * as api from '../../../dist/index.js'
import {
  ensurePassing,
  printResults,
  runOOStructSuite,
} from '../shared/suite.mjs'

const results = await runOOStructSuite(api, { label: 'deno esm' })
printResults(results)
ensurePassing(results)
