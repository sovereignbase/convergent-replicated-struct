import type { CRStructState } from '../../../.types/index.js'

/**
 * Reads the current value of a field.
 *
 * @param key - The field key to read.
 * @returns A cloned copy of the field's current value.
 */
export function __read<T extends Record<string, unknown>>(
  key: keyof T,
  crStructReplica: CRStructState<T>
): T[keyof T] {
  return structuredClone(crStructReplica.entries[key].value)
}
