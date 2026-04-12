import type {
  CRStructState,
  CRStructStateEntry,
  CRStructSnapshot,
} from '../../../.types/index.js'
import { safeStructuredClone, prototype } from '@sovereignbase/utils'
import { CRStructError } from '../../../.errors/class.js'
import { parseSnapshotEntryToStateEntry } from '../../../.helpers/parseSnapshotEntryToStateEntry/index.js'
import { v7 as uuidv7 } from 'uuid'

export function __create<T extends Record<string, unknown>>(
  defaults: T,
  snapshot?: CRStructSnapshot<T>
): CRStructState<T> {
  const [cloned, copiedDefaults] = safeStructuredClone(defaults)
  if (!cloned)
    throw new CRStructError(
      'DEFAULTS_NOT_CLONEABLE',
      'Default values must be supported by structuredClone.'
    )
  const state: CRStructState<T> = {
    entries: {} as { [K in keyof T]: CRStructStateEntry<T[K]> },
    defaults: copiedDefaults,
  }

  const snapshotIsObject = snapshot && prototype(snapshot) === 'record'

  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key as keyof T]
    if (snapshotIsObject && Object.hasOwn(snapshot, key)) {
      const valid = parseSnapshotEntryToStateEntry(
        defaultValue,
        snapshot[key as keyof T]
      )
      if (valid) {
        state.entries[key as keyof T] = valid
        continue
      }
    }
    const root = uuidv7()
    state.entries[key as keyof T] = {
      uuidv7: uuidv7(),
      predecessor: root,
      value: defaultValue,
      tombstones: new Set([root]),
    }
  }
  return state
}
