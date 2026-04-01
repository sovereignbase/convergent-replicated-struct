import { v7 as uuidv7 } from 'uuid'
import type {
  OOStructChange,
  OOStructDelta,
  OOStructEventListenerFor,
  OOStructEventMap,
  OOStructSnapshot,
  OOStructSnapshotEntry,
  OOStructState,
  OOStructStateEntry,
  OOStructAck,
} from '../.types/index.js'
import { OOStructError } from '../.errors/class.js'
import { parseSnapshotEntryToStateEntry } from './parseSnapshotEntryToStateEntry/index.js'
import { parseStateEntryToSnapshotEntry } from './parseStateEntryToSnapshotEntry/index.js'
import { isUuidV7, prototype, safeStructuredClone } from '@sovereignbase/utils'

/**
 * Represents an observed-overwrite struct replica.
 *
 * The struct shape is fixed by the provided default values.
 */
export class OOStruct<T extends Record<string, unknown>> {
  private readonly __eventTarget = new EventTarget()
  private readonly __defaults: T
  private readonly __state: OOStructState<T>
  private __live: T

  /**
   * Creates a replica from default values and an optional snapshot.
   *
   * @param defaults - The default field values that define the struct shape.
   * @param snapshot - An optional serialized snapshot used for hydration.
   * @throws {OOStructError} Thrown when the default values are not supported by `structuredClone`.
   */
  constructor(
    defaults: { [K in keyof T]: T[K] },
    snapshot?: OOStructSnapshot<T>
  ) {
    const [cloned, copiedDefaults] = safeStructuredClone(defaults)
    if (!cloned)
      throw new OOStructError(
        'DEFAULTS_NOT_CLONEABLE',
        'Default values must be supported by structuredClone.'
      )
    this.__defaults = copiedDefaults
    this.__state = {} as OOStructState<T>
    this.__live = {} as T

    const snapshotIsObject = snapshot && prototype(snapshot) === 'record'

    for (const key of Object.keys(this.__defaults)) {
      const defaultValue = this.__defaults[key as keyof T]
      if (snapshotIsObject && Object.hasOwn(snapshot, key)) {
        const valid = parseSnapshotEntryToStateEntry(
          defaultValue,
          snapshot[key as keyof T]
        )
        if (valid) {
          this.__live[key as keyof T] = valid.__value
          this.__state[key as keyof T] = valid
          continue
        }
      }
      this.__live[key as keyof T] = defaultValue
      const root = uuidv7()
      this.__state[key as keyof T] = {
        __uuidv7: uuidv7(),
        __after: root,
        __value: defaultValue,
        __overwrites: new Set([root]),
      }
    }
  }

  /**CRUD*/
  /**
   * Creates a new replica.
   *
   * @param defaults - The default field values that define the struct shape.
   * @param snapshot - An optional serialized snapshot used for hydration.
   * @returns A new OO-Struct replica.
   */
  static create<T extends Record<string, unknown>>(
    defaults: { [K in keyof T]: T[K] },
    snapshot?: OOStructSnapshot<T>
  ): OOStruct<T> {
    return new OOStruct(defaults, snapshot)
  }

  /**
   * Reads the current value of a field.
   *
   * @param key - The field key to read.
   * @returns A cloned copy of the field's current value.
   */
  read<K extends keyof T>(key: K): T[K] {
    return structuredClone(this.__live[key])
  }

  /**
   * Overwrites a field with a new value.
   *
   * @param key - The field key to overwrite.
   * @param value - The next value for the field.
   * @throws {OOStructError} Thrown when the value is not supported by `structuredClone`.
   * @throws {OOStructError} Thrown when the value runtime type does not match the default value runtime type.
   */
  update<K extends keyof T>(key: K, value: T[K]): void {
    const [cloned, copiedValue] = safeStructuredClone(value)
    if (!cloned)
      throw new OOStructError(
        'VALUE_NOT_CLONEABLE',
        'Updated values must be supported by structuredClone.'
      )

    if (prototype(copiedValue) !== prototype(this.__defaults[key]))
      throw new OOStructError(
        'VALUE_TYPE_MISMATCH',
        'Updated value must match the default value runtime type.'
      )
    const delta: OOStructDelta<T> = {}
    const change: OOStructChange<T> = {}
    delta[key] = this.overwriteAndReturnSnapshotEntry(key, copiedValue)
    change[key] = structuredClone(copiedValue)
    this.__eventTarget.dispatchEvent(
      new CustomEvent('delta', { detail: delta })
    )
    this.__eventTarget.dispatchEvent(
      new CustomEvent('change', { detail: change })
    )
  }

  /**
   * Resets one field or the entire struct back to default values.
   *
   * @param key - The optional field key to reset. When omitted, every field is reset.
   */
  delete<K extends keyof T>(key?: K): void {
    const delta: OOStructDelta<T> = {}
    const change: OOStructChange<T> = {}

    if (key !== undefined) {
      if (!Object.hasOwn(this.__defaults, key)) return
      const value = this.__defaults[key]
      delta[key] = this.overwriteAndReturnSnapshotEntry(key, value)
      change[key] = structuredClone(value)
    } else {
      for (const [key, value] of Object.entries(this.__defaults)) {
        delta[key as K] = this.overwriteAndReturnSnapshotEntry(
          key as K,
          value as T[K]
        )
        change[key as K] = structuredClone(value as T[K])
      }
    }
    this.__eventTarget.dispatchEvent(
      new CustomEvent('delta', { detail: delta })
    )
    this.__eventTarget.dispatchEvent(
      new CustomEvent('change', { detail: change })
    )
  }

  /**MAGS*/
  /**
   * Merges an incoming delta into the current replica.
   *
   * @param replica - The incoming partial snapshot projection to merge.
   */
  merge<K extends keyof T>(replica: OOStructDelta<T>): void {
    if (!replica || typeof replica !== 'object' || Array.isArray(replica))
      return

    const delta: OOStructDelta<T> = {}
    const change: OOStructChange<T> = {}
    let hasDelta = false
    let hasChange = false

    for (const [key, value] of Object.entries(replica)) {
      if (!Object.hasOwn(this.__state, key)) continue

      const candidate = parseSnapshotEntryToStateEntry(
        this.__defaults[key as K],
        value as OOStructSnapshotEntry<T[K]>
      )
      if (!candidate) continue

      const target = this.__state[key as K]
      const current = { ...target }
      let frontier = ''
      for (const overwrite of target.__overwrites) {
        if (frontier < overwrite) frontier = overwrite
      }

      for (const overwrite of candidate.__overwrites) {
        if (overwrite <= frontier || target.__overwrites.has(overwrite))
          continue
        target.__overwrites.add(overwrite)
      }

      if (target.__overwrites.has(candidate.__uuidv7)) continue

      if (current.__uuidv7 === candidate.__uuidv7) {
        if (current.__after < candidate.__after) {
          target.__value = candidate.__value
          target.__after = candidate.__after
          target.__overwrites.add(candidate.__after)
          this.__live[key as K] = candidate.__value
          change[key as K] = structuredClone(candidate.__value)
          hasChange = true
        } else {
          delta[key as K] = this.overwriteAndReturnSnapshotEntry(
            key as K,
            current.__value
          )
          hasDelta = true
        }
        continue
      }

      if (
        current.__uuidv7 === candidate.__after ||
        target.__overwrites.has(current.__uuidv7) ||
        candidate.__uuidv7 > current.__uuidv7
      ) {
        target.__uuidv7 = candidate.__uuidv7
        target.__value = candidate.__value
        target.__after = candidate.__after
        target.__overwrites.add(candidate.__after)
        target.__overwrites.add(current.__uuidv7)
        this.__live[key as K] = candidate.__value
        change[key as K] = structuredClone(candidate.__value)
        hasChange = true
        continue
      }

      target.__overwrites.add(candidate.__uuidv7)
      delta[key as K] = parseStateEntryToSnapshotEntry(target)
      hasDelta = true
    }
    if (hasDelta)
      this.__eventTarget.dispatchEvent(
        new CustomEvent('delta', { detail: delta })
      )
    if (hasChange)
      this.__eventTarget.dispatchEvent(
        new CustomEvent('change', { detail: change })
      )
  }

  /**
   * Emits the current acknowledgement frontier for each field.
   */
  acknowledge<K extends Extract<keyof T, string>>(): void {
    const ack: OOStructAck<T> = {}
    for (const [key, value] of Object.entries(this.__state)) {
      let max = ''
      for (const overwrite of (value as OOStructStateEntry<T[K]>)
        .__overwrites) {
        if (max < overwrite) max = overwrite
      }
      ack[key as K] = max
    }
    this.__eventTarget.dispatchEvent(new CustomEvent('ack', { detail: ack }))
  }

  /**
   * Removes overwritten identifiers that every provided frontier has acknowledged.
   *
   * @param frontiers - A collection of acknowledgement frontiers to compact against.
   */
  garbageCollect<K extends Extract<keyof T, string>>(
    frontiers: Array<OOStructAck<T>>
  ): void {
    if (!Array.isArray(frontiers) || frontiers.length < 1) return
    const smallestAcknowledgementsPerKey: OOStructAck<T> = {}

    for (const frontier of frontiers) {
      for (const [key, value] of Object.entries(frontier)) {
        if (!Object.hasOwn(this.__state, key) || !isUuidV7(value)) continue

        const current = smallestAcknowledgementsPerKey[key as K]
        if (typeof current === 'string' && current <= value) continue
        smallestAcknowledgementsPerKey[key as K] = value
      }
    }

    for (const [key, value] of Object.entries(smallestAcknowledgementsPerKey)) {
      const target = this.__state[key]
      const smallest = value as string
      for (const uuidv7 of target.__overwrites) {
        if (uuidv7 === target.__after || uuidv7 > smallest) continue
        target.__overwrites.delete(uuidv7)
      }
    }
  }

  /**
   * Emits a serialized snapshot of the current replica state.
   */
  snapshot(): void {
    const snapshot = {} as OOStructSnapshot<T>

    for (const [key, value] of Object.entries(this.__state)) {
      snapshot[key as keyof T] = parseStateEntryToSnapshotEntry(
        value as OOStructStateEntry<T[keyof T]>
      )
    }

    this.__eventTarget.dispatchEvent(
      new CustomEvent('snapshot', { detail: snapshot })
    )
  }

  /**ADDITIONAL*/

  /**
   * Returns the struct field keys.
   *
   * @returns The field keys in the current replica.
   */
  keys<K extends keyof T>(): Array<K> {
    return Object.keys(this.__live) as Array<K>
  }

  /**
   * Returns cloned copies of the current field values.
   *
   * @returns The current field values.
   */
  values<K extends keyof T>(): Array<T[K]> {
    return Object.values(this.__live).map((value) =>
      structuredClone(value)
    ) as Array<T[K]>
  }

  /**
   * Returns cloned key-value pairs for the current replica state.
   *
   * @returns The current field entries.
   */
  entries<K extends keyof T>(): Array<[K, T[K]]> {
    return Object.entries(this.__live).map(([key, value]) => [
      key as K,
      structuredClone(value as T[K]),
    ])
  }

  /**EVENTS*/

  /**
   * Registers an event listener.
   *
   * @param type - The event type to listen for.
   * @param listener - The listener to register.
   * @param options - Listener registration options.
   */
  addEventListener<K extends keyof OOStructEventMap<T>>(
    type: K,
    listener: OOStructEventListenerFor<T, K> | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.__eventTarget.addEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options
    )
  }

  /**
   * Removes an event listener.
   *
   * @param type - The event type to stop listening for.
   * @param listener - The listener to remove.
   * @param options - Listener removal options.
   */
  removeEventListener<K extends keyof OOStructEventMap<T>>(
    type: K,
    listener: OOStructEventListenerFor<T, K> | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.__eventTarget.removeEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options
    )
  }

  /**HELPERS*/

  /**
   * Overwrites a field and returns the serialized delta entry for that overwrite.
   *
   * @param key - The field key to overwrite.
   * @param value - The next value for the field.
   * @returns The serialized snapshot entry for the new winning value.
   */
  private overwriteAndReturnSnapshotEntry<K extends keyof T>(
    key: K,
    value: T[K]
  ): OOStructSnapshotEntry<T[K]> {
    const target = this.__state[key]
    const old = { ...target }
    target.__uuidv7 = uuidv7()
    target.__value = value
    target.__after = old.__uuidv7
    target.__overwrites.add(old.__uuidv7)
    this.__live[key] = value
    return parseStateEntryToSnapshotEntry(target)
  }
}
