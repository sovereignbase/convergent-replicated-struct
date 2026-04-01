import assert from 'node:assert/strict'
import test from 'node:test'
import { OOStruct } from '../../dist/index.js'
import {
  createDefaults,
  createReplica,
  readSnapshot,
} from '../shared/oostruct.mjs'

test('event listener object handleEvent receives delta detail', () => {
  const replica = createReplica()
  let detail

  replica.addEventListener('delta', {
    handleEvent(event) {
      detail = event.detail
    },
  })

  replica.update('name', 'alice')

  assert.equal(detail.name.__value, 'alice')
})

test('removeEventListener stops function and object listeners', () => {
  const replica = createReplica()
  let fnCalls = 0
  let objectCalls = 0
  const fnListener = () => {
    fnCalls++
  }
  const objectListener = {
    handleEvent() {
      objectCalls++
    },
  }

  replica.addEventListener('delta', fnListener)
  replica.addEventListener('snapshot', objectListener)
  replica.removeEventListener('delta', fnListener)
  replica.removeEventListener('snapshot', objectListener)
  replica.update('name', 'alice')
  replica.snapshot()

  assert.equal(fnCalls, 0)
  assert.equal(objectCalls, 0)
})

test('event channels remain independent across update merge snapshot and acknowledge', () => {
  const local = createReplica()
  const remote = new OOStruct(createDefaults())
  const counts = { delta: 0, change: 0, snapshot: 0, ack: 0 }

  local.addEventListener('delta', () => {
    counts.delta++
  })
  local.addEventListener('change', () => {
    counts.change++
  })
  local.addEventListener('snapshot', () => {
    counts.snapshot++
  })
  local.addEventListener('ack', () => {
    counts.ack++
  })

  local.update('name', 'alice')
  remote.update('name', 'bob')
  local.merge(readSnapshot(remote))
  local.snapshot()
  local.acknowledge()

  assert.deepEqual(counts, {
    delta: 1,
    change: 2,
    snapshot: 1,
    ack: 1,
  })
})

test('snapshot payloads are detached from live state', () => {
  const replica = createReplica()
  replica.update('meta', { enabled: true })
  const snapshot = readSnapshot(replica)

  snapshot.meta.__value.enabled = false
  snapshot.tags.__value.push('mutated')

  assert.deepEqual(replica.read('meta'), { enabled: true })
  assert.deepEqual(replica.read('tags'), [])
})
