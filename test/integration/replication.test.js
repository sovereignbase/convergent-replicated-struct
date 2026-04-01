import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createReplica,
  mulberry32,
  readAck,
  readSnapshot,
} from '../shared/oostruct.mjs'

function nextValue(field, step, replicaIndex) {
  switch (field) {
    case 'name':
      return `name-${replicaIndex}-${step}`
    case 'count':
      return step + replicaIndex
    case 'meta':
      return { enabled: (step + replicaIndex) % 2 === 0 }
    case 'tags':
      return [`tag-${replicaIndex}-${step}`, `tag-${step}`]
    default:
      throw new Error(`Unknown field: ${field}`)
  }
}

function hostileDelta(step) {
  return step % 4 === 0
    ? { name: null }
    : step % 4 === 1
      ? {
          name: {
            __uuidv7: 'bad',
            __after: 'bad',
            __value: 'x',
            __overwrites: [],
          },
        }
      : step % 4 === 2
        ? {
            count: {
              __uuidv7: 'bad',
              __after: 'bad',
              __value: 1,
              __overwrites: [],
            },
          }
        : { ghost: { __uuidv7: 'bad' } }
}

test('three replicas converge after deterministic random operations hostile ingress and protocol gc', () => {
  const rng = mulberry32(0x0ddc0ffe)
  const replicas = [createReplica(), createReplica(), createReplica()]
  const fields = ['name', 'count', 'meta', 'tags']

  for (let step = 0; step < 250; step++) {
    const actorIndex = Math.floor(rng() * replicas.length)
    const actor = replicas[actorIndex]
    const branch = rng()

    if (branch < 0.35) {
      const field = fields[Math.floor(rng() * fields.length)]
      actor.update(field, nextValue(field, step, actorIndex))
      continue
    }

    if (branch < 0.5) {
      if (rng() < 0.5) actor.delete()
      else actor.delete(fields[Math.floor(rng() * fields.length)])
      continue
    }

    if (branch < 0.75) {
      const sourceIndex = Math.floor(rng() * replicas.length)
      if (sourceIndex === actorIndex) continue
      actor.merge(readSnapshot(replicas[sourceIndex]))
      continue
    }

    if (branch < 0.9) {
      assert.doesNotThrow(() => {
        actor.merge(hostileDelta(step))
      })
      continue
    }

    const frontiers = replicas.map(readAck)
    for (const replica of replicas) {
      replica.garbageCollect(frontiers)
    }
  }

  for (let round = 0; round < 4; round++) {
    const snapshots = replicas.map(readSnapshot)
    for (let targetIndex = 0; targetIndex < replicas.length; targetIndex++) {
      for (let sourceIndex = 0; sourceIndex < snapshots.length; sourceIndex++) {
        if (sourceIndex === targetIndex) continue
        replicas[targetIndex].merge(snapshots[sourceIndex])
      }
    }
  }

  const projections = replicas.map((replica) =>
    Object.fromEntries(replica.entries())
  )

  assert.deepEqual(projections[0], projections[1])
  assert.deepEqual(projections[1], projections[2])
})
