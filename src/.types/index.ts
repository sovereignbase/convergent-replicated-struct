export type OOMapSnapshot<T extends object> = {
  [K in keyof T]: {
    __uuidv7: string
    __value: T[K]
    __overwrites: Array<string>
  }
}
