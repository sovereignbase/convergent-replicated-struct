import assert from 'node:assert/strict'
import test from 'node:test'
import { isUuidV7 } from '@sovereignbase/utils'
import {
  createValidUuid,
  createReplica,
  readAck,
  readSnapshot,
} from '../shared/oostruct.mjs'

test('acknowledge emits valid frontier identifiers for every field', () => {
  const replica = createReplica()
  replica.update('name', 'alice')
  replica.update('count', 1)
  replica.update('meta', { enabled: true })
  const ack = readAck(replica)

  assert.deepEqual(Object.keys(ack).sort(), ['count', 'meta', 'name', 'tags'])
  for (const value of Object.values(ack)) {
    assert.equal(isUuidV7(value), true)
  }
})

test('garbageCollect removes acknowledged overwrites but preserves current after', () => {
  const replica = createReplica()
  replica.update('name', 'a')
  replica.update('name', 'b')
  replica.update('name', 'c')
  const before = readSnapshot(replica)
  const ack = readAck(replica)

  replica.garbageCollect([{ ghost: createValidUuid('ghost'), name: '' }, ack])

  const after = readSnapshot(replica)

  assert.equal(after.name.__overwrites.includes(after.name.__after), true)
  assert(after.name.__overwrites.length < before.name.__overwrites.length)
  assert.deepEqual(after.name.__overwrites, [after.name.__after])
})

test('garbageCollect ignores non-array and empty frontier inputs', () => {
  const replica = createReplica()
  replica.update('name', 'alice')
  const before = readSnapshot(replica)

  replica.garbageCollect(false)
  replica.garbageCollect([])

  assert.deepEqual(readSnapshot(replica), before)
})
