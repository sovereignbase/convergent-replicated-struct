import type {
  CRStructSnapshotEntry,
  CRStructStateEntry,
} from '../../.types/index.js'
import { isUuidV7, prototype, safeStructuredClone } from '@sovereignbase/utils'

/**
 * Validates and converts a serialized field entry into internal replica state.
 *
 * Invalid entries are rejected by returning `false`.
 *
 * @param defaultValue - The default value for the field used for runtime type comparison.
 * @param snapshotEntry - The serialized entry to validate and parse.
 * @returns The parsed state entry, or `false` when the entry is invalid.
 */
export function transformSnapshotEntryToStateEntry<V>(
  defaultValue: V,
  snapshotEntry: CRStructSnapshotEntry<V>
): CRStructStateEntry<V> | false {
  if (
    prototype(snapshotEntry) !== 'record' ||
    !Object.hasOwn(snapshotEntry, 'value') ||
    !isUuidV7(snapshotEntry.uuidv7) ||
    !isUuidV7(snapshotEntry.predecessor) ||
    !Array.isArray(snapshotEntry.tombstones)
  )
    return false

  const [cloned, copiedValue] = safeStructuredClone(snapshotEntry.value)
  if (!cloned || prototype(copiedValue) !== prototype(defaultValue))
    return false

  const tombstones = new Set<string>([])
  for (const overwrite of snapshotEntry.tombstones) {
    if (
      !isUuidV7(overwrite) ||
      overwrite ===
        snapshotEntry.uuidv7 /**if it was actually overwritten the current uuid would be different so this must be malicious*/
    )
      continue
    tombstones.add(overwrite)
  }

  if (!tombstones.has(snapshotEntry.predecessor)) return false

  return {
    uuidv7: snapshotEntry.uuidv7,
    value: copiedValue,
    predecessor: snapshotEntry.predecessor,
    tombstones: tombstones,
  }
}
