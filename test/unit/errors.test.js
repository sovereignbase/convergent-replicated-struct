import assert from 'node:assert/strict'
import test from 'node:test'
import { OOStruct } from '../../dist/index.js'
import {
  assertOOStructError,
  createDefaults,
  createReplica,
  readSnapshot,
} from '../shared/oostruct.mjs'

test('constructor exposes DEFAULTS_NOT_CLONEABLE for unsupported defaults', () => {
  assert.throws(
    () =>
      new OOStruct({
        ...createDefaults(),
        bad: () => {},
      }),
    (error) => {
      assertOOStructError(error, 'DEFAULTS_NOT_CLONEABLE')
      assert.match(
        error.message,
        /Default values must be supported by structuredClone\./
      )
      return true
    }
  )
})

test('update exposes VALUE_NOT_CLONEABLE and leaves state unchanged', () => {
  const replica = createReplica()

  assert.throws(
    () => replica.update('name', () => {}),
    (error) => {
      assertOOStructError(error, 'VALUE_NOT_CLONEABLE')
      assert.match(
        error.message,
        /Updated values must be supported by structuredClone\./
      )
      return true
    }
  )

  assert.equal(replica.read('name'), '')
})

test('update exposes VALUE_TYPE_MISMATCH and leaves state unchanged', () => {
  const replica = createReplica()
  const before = readSnapshot(replica)

  assert.throws(
    () => replica.update('count', 'bad'),
    (error) => {
      assertOOStructError(error, 'VALUE_TYPE_MISMATCH')
      assert.match(
        error.message,
        /Updated value must match the default value runtime type\./
      )
      return true
    }
  )

  assert.deepEqual(readSnapshot(replica), before)
})

test('captured OOStructError constructor falls back to the code when message is omitted', () => {
  let ErrorCtor

  try {
    new OOStruct({
      ...createDefaults(),
      bad: () => {},
    })
  } catch (error) {
    ErrorCtor = error.constructor
  }

  assert.equal(typeof ErrorCtor, 'function')

  const error = new ErrorCtor('VALUE_TYPE_MISMATCH')

  assert.equal(error.code, 'VALUE_TYPE_MISMATCH')
  assert.equal(error.name, 'OOStructError')
  assert.match(error.message, /VALUE_TYPE_MISMATCH/)
})
