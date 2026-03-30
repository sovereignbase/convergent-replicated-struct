import { v7 as uuidv7 } from 'uuid'
import { OOMapError } from '../.errors/class.js'
import type {
  OOMapSnapshot,
  OOMapSnapshotEntry,
  OOMapState,
} from '../.types/index.js'
import { isUuidV7 } from './isUuidV7/index.js'

export class OOMap<T extends object> {
  private readonly eventTarget = new EventTarget()
  private readonly __state: OOMapState<T>
  private __live: T

  constructor(defaults: { [K in keyof T]: T[K] }, snapshot?: OOMapSnapshot<T>) {
    this.__live = {} as T
    this.__state = {} as OOMapState<T>

    if (snapshot === undefined) {
      for (const [rawKey, rawValue] of Object.entries(defaults)) {
        const key = rawKey as keyof T
        const value = rawValue as T[keyof T]

        this.__live[key] = value
        this.__state[key] = {
          __uuidv7: uuidv7(),
          __value: value,
          __overwrites: new Set([]),
        }
      }

      return
    }

    for (const [rawKey, rawEntry] of Object.entries(snapshot)) {
      const key = rawKey as keyof T
      const entry = rawEntry as OOMapSnapshotEntry<T[keyof T]>

      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        !isUuidV7(entry.__uuidv7) ||
        !Array.isArray(entry.__overwrites) ||
        !Object.hasOwn(entry, '__value')
      ) {
        throw new OOMapError('BAD_SNAPSHOT', 'Malformed snapshot.')
      }
      this.__live[key] = entry.__value
      this.__state[key] = {
        __uuidv7: entry.__uuidv7,
        __value: entry.__value,
        __overwrites: new Set([]),
      }
      for (const overwrite of entry.__overwrites) {
        if (!isUuidV7(overwrite)) continue
        this.__state[key].__overwrites.add(overwrite)
      }
    }
  }
  get(key: keyof T): T[keyof T] {
    return this.__live[key]
  }
  set(key: keyof T, value: T[keyof T]): void {}
  /**
   * Registers an event listener.
   *
   * @param type - The event type to listen for.
   * @param listener - The listener to register.
   * @param options - Listener registration options.
   */
  addEventListener<K extends string>(
    type: K,
    listener: ORSetEventListenerFor<T, K> | null,
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
  removeEventListener<K extends string>(
    type: K,
    listener: ORSetEventListenerFor<T, K> | null,
    options?: boolean | EventListenerOptions
  ): void {
    this.eventTarget.removeEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options
    )
  }
}
