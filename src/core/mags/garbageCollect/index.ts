import { CRStructState, CRStructAck } from '../../../.types/index.js'
import { isUuidV7 } from '@sovereignbase/utils'

/**
 * Removes overwritten identifiers that every provided frontier has acknowledged.
 *
 * The smallest valid acknowledgement per field is collected first, then local
 * tombstones at or below that frontier are removed while keeping the current
 * predecessor identifier intact.
 *
 * @param frontiers - A collection of acknowledgement frontiers to compact against.
 * @param crStructReplica - The replica state to compact.
 *
 * Time complexity: O(a + t), worst case O(a + t)
 *
 * a = acknowledgement entries scanned across all provided frontiers
 * t = tombstone count scanned across compacted fields
 *
 * Space complexity: O(k)
 *
 * k = fields that receive a valid acknowledgement frontier
 */
export function __garbageCollect<T extends Record<string, unknown>>(
  frontiers: Array<CRStructAck<T>>,
  crStructReplica: CRStructState<T>
): void {
  if (!Array.isArray(frontiers) || frontiers.length < 1) return
  const smallestAcknowledgementsPerKey: CRStructAck<T> = {}

  for (const frontier of frontiers) {
    if (!frontier || typeof frontier !== 'object' || Array.isArray(frontier))
      continue
    for (const [key, value] of Object.entries(frontier)) {
      if (!Object.hasOwn(crStructReplica.entries, key) || !isUuidV7(value))
        continue

      const current = smallestAcknowledgementsPerKey[key]
      if (typeof current === 'string' && current <= value) continue
      smallestAcknowledgementsPerKey[key as keyof T] = value
    }
  }

  for (const [key, value] of Object.entries(smallestAcknowledgementsPerKey)) {
    const target = crStructReplica.entries[key]
    const smallest = value as string
    for (const uuidv7 of target.tombstones) {
      if (uuidv7 === target.predecessor || uuidv7 > smallest) continue
      target.tombstones.delete(uuidv7)
    }
  }
}
