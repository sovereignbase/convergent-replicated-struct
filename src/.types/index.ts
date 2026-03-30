import type { ORSetSnapshot } from '@sovereignbase/observed-remove-set'

export type ORMapSnapshot<T extends object> = Record<string, ORSetSnapshot<T>>
