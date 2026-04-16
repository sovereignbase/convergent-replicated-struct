import type {
  CRStructState,
  CRStructSnapshotEntry,
} from '../../.types/index.js'
import { transformStateEntryToSnapshotEntry } from '../index.js'
import { v7 as uuidv7 } from 'uuid'
/**
 * Overwrites a field and returns the serialized delta entry for that overwrite.
 *
 * @param key - The field key to overwrite.
 * @param value - The next value for the field.
 * @returns The serialized snapshot entry for the new winning value.
 */
export function overwriteAndReturnSnapshotEntry<
  T extends Record<string, unknown>,
>(
  key: keyof T,
  value: T[keyof T],
  crStructReplica: CRStructState<T>
): CRStructSnapshotEntry<T[keyof T]> {
  const target = crStructReplica.entries[key]
  const oldUuidv7 = target.uuidv7
  target.uuidv7 = uuidv7()
  target.value = value
  target.predecessor = oldUuidv7
  target.tombstones.add(oldUuidv7)
  return transformStateEntryToSnapshotEntry(target)
}
