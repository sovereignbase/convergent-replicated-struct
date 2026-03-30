import type { OOMapSnapshot } from '../.types/index.js'
export class OOMap<T extends object> {
  private state: T
  constructor(defaults: { [K in keyof T]: T[K] }, snapshot?: OOMapSnapshot<T>) {
    this.state = defaults
  }
}
