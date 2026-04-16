import type {
  CRStructStateEntry,
  CRStructSnapshotEntry,
} from '../../.types/index.js'

/**
 * Makes a field state entry into a serializeable snapshot entry.
 *
 * @param stateEntry - The internal state entry to serialize.
 * @returns The serializeable snapshot entry.
 */
export function transformStateEntryToSnapshotEntry<K>(
  stateEntry: CRStructStateEntry<K>
): CRStructSnapshotEntry<K> {
  return {
    uuidv7: stateEntry.uuidv7,
    value: structuredClone(stateEntry.value),
    predecessor: stateEntry.predecessor,
    tombstones: Array.from(stateEntry.tombstones),
  }
}
