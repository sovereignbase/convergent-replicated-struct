import * as api from '/dist/index.js'
import { printResults, runOOStructSuite } from '../shared/suite.mjs'

const results = await runOOStructSuite(api, { label: 'browser esm' })
printResults(results)
window.__OOSTRUCT_RESULTS__ = results

const status = document.getElementById('status')
if (status) {
  status.textContent = results.ok ? 'ok' : `failed: ${results.errors.length}`
}
