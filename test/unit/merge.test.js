import assert from 'node:assert/strict'
import test from 'node:test'
import {
  captureEvents,
  cloneSnapshot,
  createReplica,
  createValidUuid,
  normalizeSnapshot,
  readSnapshot,
} from '../shared/oostruct.mjs'

test('merge ignores malformed ingress and hostile per-key payloads without throwing', () => {
  const replica = createReplica()
  const before = normalizeSnapshot(readSnapshot(replica))
  const validUuid = createValidUuid('valid')
  const validAfter = createValidUuid('after')
  const corpus = [
    null,
    false,
    0,
    'bad',
    [],
    { ghost: { __uuidv7: validUuid } },
    { name: null },
    {
      name: { __uuidv7: 'bad', __after: 'bad', __value: 'x', __overwrites: [] },
    },
    {
      name: {
        __uuidv7: validUuid,
        __after: validAfter,
        __value: 123,
        __overwrites: [validAfter],
      },
    },
    {
      name: {
        __uuidv7: validUuid,
        __after: validAfter,
        __value: 'ok',
        __overwrites: 'bad',
      },
    },
    {
      name: {
        __uuidv7: validUuid,
        __after: validAfter,
        __value: () => {},
        __overwrites: [validAfter],
      },
    },
  ]

  for (const payload of corpus) {
    assert.doesNotThrow(() => {
      replica.merge(payload)
    })
  }

  assert.deepEqual(normalizeSnapshot(readSnapshot(replica)), before)
})

test('merge adopts a direct successor and emits change', () => {
  const source = createReplica()
  const baseSnapshot = readSnapshot(source)
  const target = createReplica(baseSnapshot)
  const sourceEvents = captureEvents(source)
  source.update('name', 'alice')
  const delta = sourceEvents.events.delta[0]

  const targetEvents = captureEvents(target)
  target.merge(delta)

  assert.equal(target.read('name'), 'alice')
  assert.equal(targetEvents.events.delta.length, 0)
  assert.equal(targetEvents.events.change.length, 1)
})

test('merge ignores candidates whose after identifier is missing from overwrites', () => {
  const replica = createReplica()
  const candidateUuid = createValidUuid('candidate')
  const after = createValidUuid('after')
  const before = normalizeSnapshot(readSnapshot(replica))

  replica.merge({
    name: {
      __uuidv7: candidateUuid,
      __after: after,
      __value: 'ignored',
      __overwrites: [],
    },
  })

  assert.deepEqual(normalizeSnapshot(readSnapshot(replica)), before)
})

test('merge keeps the current winner and emits a rebuttal delta for stale concurrent ingress', () => {
  const base = createReplica()
  const baseSnapshot = readSnapshot(base)
  const older = createReplica(baseSnapshot)
  const newer = createReplica(baseSnapshot)

  older.update('name', 'older')
  const olderSnapshot = readSnapshot(older)
  newer.update('name', 'newer')

  const newerEvents = captureEvents(newer)
  newer.merge(olderSnapshot)

  assert.equal(newer.read('name'), 'newer')
  assert.equal(newerEvents.events.change.length, 0)
  assert.equal(newerEvents.events.delta.length, 1)

  older.merge(newerEvents.events.delta[0])

  assert.deepEqual(
    normalizeSnapshot(readSnapshot(older)),
    normalizeSnapshot(readSnapshot(newer))
  )
})

test('merge adopts a same-uuid candidate with a greater after identifier', () => {
  const replica = createReplica()
  replica.update('name', 'local')
  const snapshot = cloneSnapshot(readSnapshot(replica))
  const greaterAfter = createValidUuid('greater-after')

  snapshot.name.__value = 'remote'
  snapshot.name.__after = greaterAfter
  snapshot.name.__overwrites.push(greaterAfter)

  const { events } = captureEvents(replica)
  replica.merge({ name: snapshot.name })

  assert.equal(replica.read('name'), 'remote')
  assert.equal(events.delta.length, 0)
  assert.equal(events.change.length, 1)
})

test('merge repairs a same-uuid conflict with a stale after identifier', () => {
  const replica = createReplica()
  replica.update('name', 'local')
  const snapshot = cloneSnapshot(readSnapshot(replica))
  snapshot.name.__value = 'conflict'

  const { events } = captureEvents(replica)
  replica.merge({ name: snapshot.name })

  assert.equal(replica.read('name'), 'local')
  assert.equal(events.change.length, 0)
  assert.equal(events.delta.length, 1)
})
