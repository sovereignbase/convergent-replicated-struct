const TEST_TIMEOUT_MS = 5000

export async function runOOStructSuite(api, options = {}) {
  const { label = 'runtime' } = options
  const results = { label, ok: true, errors: [], tests: [] }
  const { OOStruct } = api

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'assertion failed')
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `expected ${actual} to equal ${expected}`)
    }
  }

  function assertJsonEqual(actual, expected, message) {
    assertEqual(
      JSON.stringify(actual),
      JSON.stringify(expected),
      message || 'json mismatch'
    )
  }

  function createDefaults() {
    return {
      name: '',
      count: 0,
      meta: { enabled: false },
      tags: [],
    }
  }

  function createReplica(snapshot) {
    return new OOStruct(createDefaults(), snapshot)
  }

  function captureEvents(replica) {
    const events = {
      delta: [],
      change: [],
      snapshot: [],
      ack: [],
    }

    replica.addEventListener('delta', (event) => {
      events.delta.push(event.detail)
    })
    replica.addEventListener('change', (event) => {
      events.change.push(event.detail)
    })
    replica.addEventListener('snapshot', (event) => {
      events.snapshot.push(event.detail)
    })
    replica.addEventListener('ack', (event) => {
      events.ack.push(event.detail)
    })

    return events
  }

  function readSnapshot(replica) {
    let snapshot
    replica.addEventListener(
      'snapshot',
      (event) => {
        snapshot = event.detail
      },
      { once: true }
    )
    assertEqual(replica.snapshot(), undefined)
    assert(snapshot, 'expected snapshot detail')
    return snapshot
  }

  function readAck(replica) {
    let ack
    replica.addEventListener(
      'ack',
      (event) => {
        ack = event.detail
      },
      { once: true }
    )
    assertEqual(replica.acknowledge(), undefined)
    assert(ack, 'expected ack detail')
    return ack
  }

  function createValidUuid(seed = 'seed') {
    const replica = createReplica()
    replica.update('name', seed)
    return readSnapshot(replica).name.__uuidv7
  }

  function normalizeSnapshot(snapshot) {
    const normalized = {}
    for (const key of Object.keys(snapshot).sort()) {
      const entry = snapshot[key]
      normalized[key] = {
        __uuidv7: entry.__uuidv7,
        __value: structuredClone(entry.__value),
        __after: entry.__after,
        __overwrites: [...entry.__overwrites].sort(),
      }
    }
    return normalized
  }

  function readProjection(replica) {
    return Object.fromEntries(replica.entries())
  }

  function assertOOStructError(error, code) {
    assert(error, 'expected an error')
    assertEqual(error.name, 'OOStructError', 'expected OOStructError name')
    assertEqual(error.code, code, `expected ${code} code`)
    assert(
      /\{@sovereignbase\/observed-overwrite-struct\}/.test(
        String(error.message)
      ),
      'expected prefixed error message'
    )
  }

  async function withTimeout(promise, ms, name) {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`timeout after ${ms}ms: ${name}`))
      }, ms)
    })
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
  }

  async function runTest(name, fn) {
    try {
      await withTimeout(Promise.resolve().then(fn), TEST_TIMEOUT_MS, name)
      results.tests.push({ name, ok: true })
    } catch (error) {
      results.ok = false
      results.tests.push({ name, ok: false })
      results.errors.push({ name, message: String(error) })
    }
  }

  await runTest('exports shape', () => {
    assert(typeof OOStruct === 'function', 'OOStruct export missing')
  })

  await runTest('constructor and snapshot shape', () => {
    const replica = createReplica()
    const snapshot = readSnapshot(replica)

    assertJsonEqual(replica.keys(), ['name', 'count', 'meta', 'tags'])
    assertEqual(replica.read('name'), '')
    assertEqual(replica.read('count'), 0)
    assertJsonEqual(replica.read('meta'), { enabled: false })
    assertJsonEqual(replica.read('tags'), [])
    assertJsonEqual(Object.keys(snapshot), ['name', 'count', 'meta', 'tags'])
  })

  await runTest('update emits detached delta and change payloads', () => {
    const replica = createReplica()
    const events = captureEvents(replica)
    replica.update('meta', { enabled: true })

    assertJsonEqual(replica.read('meta'), { enabled: true })
    assertEqual(events.delta.length, 1)
    assertEqual(events.change.length, 1)

    events.delta[0].meta.__value.enabled = false
    events.change[0].meta.enabled = false

    assertJsonEqual(replica.read('meta'), { enabled: true })
  })

  await runTest('update reports typed errors', () => {
    const replica = createReplica()

    try {
      replica.update('count', 'bad')
      throw new Error('expected update to throw')
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'expected update to throw'
      ) {
        throw error
      }
      assertOOStructError(error, 'VALUE_TYPE_MISMATCH')
    }
  })

  await runTest('delete resets one field and whole struct', () => {
    const replica = createReplica()
    replica.update('name', 'alice')
    replica.update('count', 7)
    replica.delete('name')

    assertEqual(replica.read('name'), '')
    assertEqual(replica.read('count'), 7)

    replica.delete()

    assertEqual(replica.read('name'), '')
    assertEqual(replica.read('count'), 0)
    assertJsonEqual(replica.read('meta'), { enabled: false })
    assertJsonEqual(replica.read('tags'), [])
  })

  await runTest('merge converges replicas', () => {
    const a = createReplica()
    const b = createReplica()
    a.update('name', 'alice')
    b.merge(readSnapshot(a))
    b.update('count', 5)
    a.merge(readSnapshot(b))
    a.update('meta', { enabled: true })
    b.merge(readSnapshot(a))
    a.merge(readSnapshot(b))

    assertJsonEqual(readProjection(a), readProjection(b))
  })

  await runTest(
    'acknowledge and garbageCollect compact overwritten identifiers',
    () => {
      const replica = createReplica()
      replica.update('name', 'a')
      replica.update('name', 'b')
      replica.update('name', 'c')
      const before = readSnapshot(replica)
      const ack = readAck(replica)

      replica.garbageCollect([ack])

      const after = readSnapshot(replica)
      assert(after.name.__overwrites.length < before.name.__overwrites.length)
      assert(
        after.name.__overwrites.includes(after.name.__after),
        'expected current after to survive gc'
      )
    }
  )

  await runTest('listener object and removeEventListener work', () => {
    const replica = createReplica()
    let calls = 0
    const listener = {
      handleEvent() {
        calls++
      },
    }

    replica.addEventListener('snapshot', listener)
    replica.snapshot()
    replica.removeEventListener('snapshot', listener)
    replica.snapshot()

    assertEqual(calls, 1)
  })

  await runTest(
    'malformed ingress stays non-throwing and does not corrupt state',
    () => {
      const replica = createReplica()
      const before = normalizeSnapshot(readSnapshot(replica))

      replica.merge({ name: null })
      replica.merge({ ghost: { __uuidv7: createValidUuid('ghost') } })
      replica.merge([])
      replica.merge(false)

      assertJsonEqual(normalizeSnapshot(readSnapshot(replica)), before)
    }
  )

  return results
}

export function printResults(results) {
  const passed = results.tests.filter((test) => test.ok).length
  console.log(`${results.label}: ${passed}/${results.tests.length} passed`)
  if (!results.ok) {
    for (const error of results.errors) {
      console.error(`  - ${error.name}: ${error.message}`)
    }
  }
}

export function ensurePassing(results) {
  if (results.ok) return
  throw new Error(
    `${results.label} failed with ${results.errors.length} failing tests`
  )
}
