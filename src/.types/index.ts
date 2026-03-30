export type OOMapSnapshotEntry<V> = {
  __uuidv7: string
  __value: V
  __overwrites: Array<string>
}

export type OOMapStateEntry<V> = {
  __uuidv7: string
  __value: V
  __overwrites: Set<string>
}

export type OOMapSnapshot<T extends object> = {
  [K in keyof T]: OOMapSnapshotEntry<T[K]>
}

export type OOMapState<T extends object> = {
  [K in keyof T]: OOMapStateEntry<T[K]>
}
