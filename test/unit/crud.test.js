import assert from 'node:assert/strict'
import test from 'node:test'
import { captureEvents, createReplica } from '../shared/oostruct.mjs'

test('read values and entries return detached clones', () => {
  const replica = createReplica()

  const meta = replica.read('meta')
  meta.enabled = true

  const entries = Object.fromEntries(replica.entries())
  entries.meta.enabled = true
  entries.tags.push('entry')

  const values = replica.values()
  values[2].enabled = true
  values[3].push('value')

  assert.deepEqual(replica.read('meta'), { enabled: false })
  assert.deepEqual(replica.read('tags'), [])
})

test('update overwrites a field and emits detached delta and change payloads', () => {
  const replica = createReplica()
  const { events } = captureEvents(replica)

  replica.update('meta', { enabled: true })

  assert.deepEqual(replica.read('meta'), { enabled: true })
  assert.equal(events.delta.length, 1)
  assert.equal(events.change.length, 1)

  events.delta[0].meta.__value.enabled = false
  events.change[0].meta.enabled = false

  assert.deepEqual(replica.read('meta'), { enabled: true })
})

test('delete resets a single field to its default value', () => {
  const replica = createReplica()
  replica.update('name', 'alice')
  replica.update('count', 3)
  const { events } = captureEvents(replica)

  replica.delete('name')

  assert.equal(replica.read('name'), '')
  assert.equal(replica.read('count'), 3)
  assert.deepEqual(Object.keys(events.delta[0]), ['name'])
  assert.deepEqual(Object.keys(events.change[0]), ['name'])
})

test('delete without a key resets every field to defaults', () => {
  const replica = createReplica()
  replica.update('name', 'alice')
  replica.update('count', 3)
  replica.update('meta', { enabled: true })
  replica.update('tags', ['x'])
  const { events } = captureEvents(replica)

  replica.delete()

  assert.equal(replica.read('name'), '')
  assert.equal(replica.read('count'), 0)
  assert.deepEqual(replica.read('meta'), { enabled: false })
  assert.deepEqual(replica.read('tags'), [])
  assert.deepEqual(Object.keys(events.delta[0]).sort(), [
    'count',
    'meta',
    'name',
    'tags',
  ])
  assert.deepEqual(Object.keys(events.change[0]).sort(), [
    'count',
    'meta',
    'name',
    'tags',
  ])
})

test('delete ignores unknown runtime keys', () => {
  const replica = createReplica()
  const { events } = captureEvents(replica)

  replica.delete('ghost')

  assert.equal(events.delta.length, 0)
  assert.equal(events.change.length, 0)
})
