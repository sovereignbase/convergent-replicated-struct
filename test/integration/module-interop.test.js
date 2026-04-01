import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { OOStruct as OOStructEsm } from '../../dist/index.js'
import { createDefaults, readAck, readSnapshot } from '../shared/oostruct.mjs'

const require = createRequire(import.meta.url)
const { OOStruct: OOStructCjs } = require('../../dist/index.cjs')

test('esm and cjs replicas converge after interleaved updates merges and garbage collection', () => {
  const esm = new OOStructEsm(createDefaults())
  const cjs = new OOStructCjs(createDefaults())

  esm.update('name', 'alice')
  cjs.merge(readSnapshot(esm))
  cjs.update('count', 7)
  esm.merge(readSnapshot(cjs))
  esm.update('meta', { enabled: true })
  cjs.update('tags', ['cjs'])
  esm.delete('name')
  cjs.merge(readSnapshot(esm))
  esm.merge(readSnapshot(cjs))

  const frontiers = [readAck(esm), readAck(cjs)]
  esm.garbageCollect(frontiers)
  cjs.garbageCollect(frontiers)

  esm.merge(readSnapshot(cjs))
  cjs.merge(readSnapshot(esm))

  assert.deepEqual(
    Object.fromEntries(esm.entries()),
    Object.fromEntries(cjs.entries())
  )
})
