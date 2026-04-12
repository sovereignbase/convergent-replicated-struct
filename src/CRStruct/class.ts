import { v7 as uuidv7 } from 'uuid'
import type {
  CRStructChange,
  CRStructDelta,
  CRStructEventListenerFor,
  CRStructEventMap,
  CRStructSnapshot,
  CRStructSnapshotEntry,
  CRStructState,
  CRStructStateEntry,
  CRStructAck,
} from '../.types/index.js'
import { CRStructError } from '../.errors/class.js'
import { parseSnapshotEntryToStateEntry } from '../.helpers/parseSnapshotEntryToStateEntry/index.js'
import { parseStateEntryToSnapshotEntry } from '../.helpers/parseStateEntryToSnapshotEntry/index.js'
import { isUuidV7, prototype, safeStructuredClone } from '@sovereignbase/utils'

import { __snapshot } from '../core/mags/index.js'
import { __create, __read, __update, __delete } from '../core/crud/index.js'

/**
 * Represents an observed-overwrite struct replica.
 *
 * The struct shape is fixed by the provided default values.
 */
export class CRStruct<T extends Record<string, unknown>> {
  [key: keyof T]: T[keyof T]
  declare private readonly state: CRStructState<T>
  declare private readonly eventTarget: EventTarget

  /**
   * Creates a replica from default values and an optional snapshot.
   *
   * @param defaults - The default field values that define the struct shape.
   * @param snapshot - An optional serialized snapshot used for hydration.
   * @throws {CRStructError} Thrown when the default values are not supported by `structuredClone`.
   */
  constructor(
    defaults: { [K in keyof T]: T[K] },
    snapshot?: CRStructSnapshot<T>
  ) {
    Object.defineProperties(this, {
      state: {
        value: __create<T>(defaults, snapshot),
        enumerable: false,
        configurable: false,
        writable: false,
      },
      eventTarget: {
        value: new EventTarget(),
        enumerable: false,
        configurable: false,
        writable: false,
      },
    })
    const keys = new Set(Object.keys(defaults))
    return new Proxy(this, {
      get(target, key, receiver) {
        // Preserve normal property access for unkown keys.
        if (typeof key !== 'string' || !keys.has(key))
          return Reflect.get(target, key, receiver)
        return __read(key, target.state)
      },
      has(target, key) {
        // Preserve normal property checks for unknown keys.
        if (typeof key !== 'string' || !keys.has(key))
          return Reflect.has(target, key)
        return true
      },
      set(target, key, value) {
        if (typeof key !== 'string' || !keys.has(key)) return false
        try {
          const result = __update<T>(key, value, target.state)
          if (!result) return false
          const { delta, change } = result
          if (delta)
            void target.eventTarget.dispatchEvent(
              new CustomEvent('delta', { detail: delta })
            )
          if (change)
            void target.eventTarget.dispatchEvent(
              new CustomEvent('change', { detail: change })
            )
          return true
        } catch {
          return false
        }
      },
      deleteProperty(target, key) {
        if (typeof key !== 'string' || !keys.has(key)) return false
        try {
          const result = __delete<T>(target.state, key)
          if (!result) return false
          const { delta, change } = result
          if (delta) {
            void target.eventTarget.dispatchEvent(
              new CustomEvent('delta', { detail: delta })
            )
          }
          if (change) {
            void target.eventTarget.dispatchEvent(
              new CustomEvent('change', { detail: change })
            )
          }
          return true
        } catch {
          return false
        }
      },
      ownKeys(target) {
        return [...Reflect.ownKeys(target.state.defaults)]
      },

      getOwnPropertyDescriptor(target, key) {
        // Preserve normal property checks for unknown keys.
        if (typeof key !== 'string' || !keys.has(key))
          return Reflect.getOwnPropertyDescriptor(target, key)
        return {
          value: __read(key, target.state),
          writable: true,
          enumerable: true,
          configurable: true,
        }
      },
    })
  }

  /**MAGS*/
  /**
   * Merges an incoming delta into the current replica.
   *
   * @param replica - The incoming partial snapshot projection to merge.
   */
  merge<K extends keyof T>(replica: CRStructDelta<T>): void {
    if (!replica || typeof replica !== 'object' || Array.isArray(replica))
      return

    const delta: CRStructDelta<T> = {}
    const change: CRStructChange<T> = {}
    let hasDelta = false
    let hasChange = false

    for (const [key, value] of Object.entries(replica)) {
      if (!Object.hasOwn(this.state, key)) continue

      const candidate = parseSnapshotEntryToStateEntry(
        this.defaults[key as K],
        value as CRStructSnapshotEntry<T[K]>
      )
      if (!candidate) continue

      const target = this.state[key as K]
      const current = { ...target }
      let frontier = ''
      for (const overwrite of target.tombstones) {
        if (frontier < overwrite) frontier = overwrite
      }

      for (const overwrite of candidate.tombstones) {
        if (overwrite <= frontier || target.tombstones.has(overwrite)) continue
        target.tombstones.add(overwrite)
      }

      if (target.tombstones.has(candidate.uuidv7)) continue

      if (current.uuidv7 === candidate.uuidv7) {
        if (current.predecessor < candidate.predecessor) {
          target.value = candidate.value
          target.predecessor = candidate.predecessor
          target.tombstones.add(candidate.predecessor)
          this.live[key as K] = candidate.value
          change[key as K] = structuredClone(candidate.value)
          hasChange = true
        } else {
          delta[key as K] = this.overwriteAndReturnSnapshotEntry(
            key as K,
            current.value
          )
          hasDelta = true
        }
        continue
      }

      if (
        current.uuidv7 === candidate.predecessor ||
        target.tombstones.has(current.uuidv7) ||
        candidate.uuidv7 > current.uuidv7
      ) {
        target.uuidv7 = candidate.uuidv7
        target.value = candidate.value
        target.predecessor = candidate.predecessor
        target.tombstones.add(candidate.predecessor)
        target.tombstones.add(current.uuidv7)
        this.live[key as K] = candidate.value
        change[key as K] = structuredClone(candidate.value)
        hasChange = true
        continue
      }

      target.tombstones.add(candidate.uuidv7)
      delta[key as K] = parseStateEntryToSnapshotEntry(target)
      hasDelta = true
    }
    if (hasDelta)
      this.eventTarget.dispatchEvent(
        new CustomEvent('delta', { detail: delta })
      )
    if (hasChange)
      this.eventTarget.dispatchEvent(
        new CustomEvent('change', { detail: change })
      )
  }

  /**
   * Emits the current acknowledgement frontier for each field.
   */
  acknowledge<K extends Extract<keyof T, string>>(): void {
    const ack: CRStructAck<T> = {}
    for (const [key, value] of Object.entries(this.state)) {
      let max = ''
      for (const overwrite of (value as CRStructStateEntry<T[K]>).tombstones) {
        if (max < overwrite) max = overwrite
      }
      ack[key as K] = max
    }
    this.eventTarget.dispatchEvent(new CustomEvent('ack', { detail: ack }))
  }

  /**
   * Removes overwritten identifiers that every provided frontier has acknowledged.
   *
   * @param frontiers - A collection of acknowledgement frontiers to compact against.
   */
  garbageCollect<K extends Extract<keyof T, string>>(
    frontiers: Array<CRStructAck<T>>
  ): void {
    if (!Array.isArray(frontiers) || frontiers.length < 1) return
    const smallestAcknowledgementsPerKey: CRStructAck<T> = {}

    for (const frontier of frontiers) {
      for (const [key, value] of Object.entries(frontier)) {
        if (!Object.hasOwn(this.state, key) || !isUuidV7(value)) continue

        const current = smallestAcknowledgementsPerKey[key as K]
        if (typeof current === 'string' && current <= value) continue
        smallestAcknowledgementsPerKey[key as K] = value
      }
    }

    for (const [key, value] of Object.entries(smallestAcknowledgementsPerKey)) {
      const target = this.state[key]
      const smallest = value as string
      for (const uuidv7 of target.tombstones) {
        if (uuidv7 === target.predecessor || uuidv7 > smallest) continue
        target.tombstones.delete(uuidv7)
      }
    }
  }

  /**
   * Emits a serialized snapshot of the current replica state.
   */
  snapshot(): void {
    const snapshot = __snapshot<T>(this.state)
    if (snapshot) {
      this.eventTarget.dispatchEvent(
        new CustomEvent('snapshot', { detail: snapshot })
      )
    }
  }

  /**ADDITIONAL*/

  /**
   * Returns the struct field keys.
   *
   * @returns The field keys in the current replica.
   */
  keys<K extends keyof T>(): Array<K> {
    return Object.keys(this.live) as Array<K>
  }

  /**
   * Returns cloned copies of the current field values.
   *
   * @returns The current field values.
   */
  values<K extends keyof T>(): Array<T[K]> {
    return Object.values(this.live).map((value) =>
      structuredClone(value)
    ) as Array<T[K]>
  }

  /**
   * Returns cloned key-value pairs for the current replica state.
   *
   * @returns The current field entries.
   */
  entries<K extends keyof T>(): Array<[K, T[K]]> {
    return Object.entries(this.live).map(([key, value]) => [
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
  addEventListener<K extends keyof CRStructEventMap<T>>(
    type: K,
    listener: CRStructEventListenerFor<T, K> | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.eventTarget.addEventListener(
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
  removeEventListener<K extends keyof CRStructEventMap<T>>(
    type: K,
    listener: CRStructEventListenerFor<T, K> | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.eventTarget.removeEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options
    )
  }
  /**
   * Returns a serializable snapshot representation of this list.
   *
   * Called automatically by `JSON.stringify`.
   */
  toJSON(): CRStructSnapshot<T> {
    return __snapshot<T>(this.state)
  }
  /**
   * Returns this list as a JSON string.
   */
  toString(): string {
    return JSON.stringify(this)
  }
  /**
   * Returns the Node.js console inspection representation.
   */
  [Symbol.for('nodejs.util.inspect.custom')](): CRStructSnapshot<T> {
    return this.toJSON()
  }
  /**
   * Returns the Deno console inspection representation.
   */
  [Symbol.for('Deno.customInspect')](): CRStructSnapshot<T> {
    return this.toJSON()
  }
  /**
   * Iterates over the current live values in index order.
   */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let index = 0; index < this.size; index++) {
      const value = this[index]
      yield value
    }
  }
}
