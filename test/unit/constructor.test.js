import assert from 'node:assert/strict'
import test from 'node:test'
import { OOStruct } from '../../dist/index.js'
import {
  assertSnapshotShape,
  cloneSnapshot,
  createDefaults,
  createReplica,
  readSnapshot,
} from '../shared/oostruct.mjs'

test('constructor starts from defaults and exposes a valid snapshot shape', () => {
  const replica = createReplica()

  assert.deepEqual(replica.keys(), ['name', 'count', 'meta', 'tags'])
  assert.equal(replica.read('name'), '')
  assert.equal(replica.read('count'), 0)
  assert.deepEqual(replica.read('meta'), { enabled: false })
  assert.deepEqual(replica.read('tags'), [])

  assertSnapshotShape(readSnapshot(replica))
})

test('constructor hydrates a valid snapshot and ignores unknown keys', () => {
  const source = createReplica()
  source.update('name', 'alice')
  source.update('count', 7)
  source.update('meta', { enabled: true })
  source.update('tags', ['a', 'b'])
  const snapshot = cloneSnapshot(readSnapshot(source))
  snapshot.ghost = snapshot.name

  const target = createReplica(snapshot)

  assert.equal(target.read('name'), 'alice')
  assert.equal(target.read('count'), 7)
  assert.deepEqual(target.read('meta'), { enabled: true })
  assert.deepEqual(target.read('tags'), ['a', 'b'])
  assert.equal(target.keys().includes('ghost'), false)
})

test('constructor falls back to defaults for invalid field entries only', () => {
  const source = createReplica()
  source.update('count', 3)
  source.update('meta', { enabled: true })
  const snapshot = cloneSnapshot(readSnapshot(source))
  snapshot.name = {
    __uuidv7: 'bad',
    __after: 'bad',
    __value: 'broken',
    __overwrites: [],
  }

  const target = createReplica(snapshot)

  assert.equal(target.read('name'), '')
  assert.equal(target.read('count'), 3)
  assert.deepEqual(target.read('meta'), { enabled: true })
  assert.deepEqual(target.read('tags'), [])
})

test('constructor filters invalid and self overwrites from accepted entries', () => {
  const source = createReplica()
  source.update('name', 'alice')
  const snapshot = cloneSnapshot(readSnapshot(source))
  snapshot.name.__overwrites = [
    'bad',
    snapshot.name.__uuidv7,
    snapshot.name.__after,
  ]

  const target = createReplica(snapshot)
  const hydrated = readSnapshot(target)

  assert.equal(target.read('name'), 'alice')
  assert.deepEqual(hydrated.name.__overwrites, [snapshot.name.__after])
})

test('create factory returns a working replica instance', () => {
  const replica = OOStruct.create(createDefaults())

  assert.equal(replica instanceof OOStruct, true)
  assert.deepEqual(replica.keys(), ['name', 'count', 'meta', 'tags'])
})
