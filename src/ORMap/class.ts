import { ORSet } from '@sovereignbase/observed-remove-set'
import type { ORMapSnapshot } from '../.types/index.js'

export class ORMap<T extends object> {
  private __size: number
  private __state: T
  constructor(snapshot?: ORMapSnapshot<T>) {
    this.__size = 0
    this.__state = {}
    this.__live = {}
    if (snapshot) {
      for (const [key, value] of Object.entries(snapshot)) {
        const set = new ORSet<{ value: T }>(value)
        this.__state[key] = set
        set.addEventListener('merge', (ev) => {
          /** or undefined if there is a later delete */
          this.__live[key] = ev.detail.additions
            .sort((a, b) => a.localeCompare(b))
            .pop()?.value
        })
      }
    }
  }
  get size() {}
  get(key: keyof T): T[keyof T] {
    return this.__live[key]
  }
  set(key: keyof T, value: T[keyof T]): void {
    __this.state[key].clear()
    __this.state[key].append(value)
  }
  has(key: keyof T): boolean {
    return Object.hasOwn(this.__live, key)
  }
  delete(key: keyof T): void {
    __this.state[key].clear()
  }
  clear(): void {}
  values(): Array<T[keyof T]> {}
  keys(): Array<keyof T> {}
  entries(): Array<Record<keyof T> | T[keyof T]> {}
  tombstones()
  merge()
  snapshot()
}
