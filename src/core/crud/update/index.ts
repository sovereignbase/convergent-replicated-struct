import type {
  CRStructChange,
  CRStructDelta,
  CRStructState,
} from '../../../.types/index.js'
import { safeStructuredClone, prototype } from '@sovereignbase/utils'
import { CRStructError } from '../../../.errors/class.js'
import { overwriteAndReturnSnapshotEntry } from '../../../.helpers/index.js'

/**
 * Overwrites a field with a new value.
 *
 * @param key - The field key to overwrite.
 * @param value - The next value for the field.
 * @throws {CRStructError} Thrown when the value is not supported by `structuredClone`.
 * @throws {CRStructError} Thrown when the value runtime type does not match the default value runtime type.
 */
export function __update<T extends Record<string, unknown>>(
  key: keyof T,
  value: T[keyof T],
  crStructReplica: CRStructState<T>
): { change: CRStructChange<T>; delta: CRStructDelta<T> } | false {
  const [cloned, copiedValue] = safeStructuredClone(value)
  if (!cloned)
    throw new CRStructError(
      'VALUE_NOT_CLONEABLE',
      'Updated values must be supported by structuredClone.'
    )

  if (prototype(copiedValue) !== prototype(crStructReplica.defaults[key]))
    throw new CRStructError(
      'VALUE_TYPE_MISMATCH',
      'Updated value must match the default value runtime type.'
    )
  const delta: CRStructDelta<T> = {}
  const change: CRStructChange<T> = {}
  delta[key] = overwriteAndReturnSnapshotEntry(
    key,
    copiedValue,
    crStructReplica
  )
  change[key] = structuredClone(copiedValue)
  return { change, delta }
}
