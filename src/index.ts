/**
 * The CR-Struct replica implementation.
 */
export { CRStruct } from './CRStruct/class.js'

/**
 * The public CR-Struct error class and code union.
 */
export { CRStructError, type CRStructErrorCode } from './.errors/class.js'

/**
 * Public CR-Struct types.
 */
export type {
  CRStructEventMap,
  CRStructEventListener,
  CRStructEventListenerFor,
  /***/
  CRStructState,
  CRStructStateEntry,
  /***/
  CRStructSnapshot,
  CRStructSnapshotEntry,
  /***/
  CRStructChange,
  /***/
  CRStructDelta,
  CRStructAck,
} from './.types/index.js'

/**
 * Public advanced exports, CR-Struct primitives.
 */
export { __create, __read, __update, __delete } from './core/crud/index.js'
export {
  __merge,
  __acknowledge,
  __garbageCollect,
  __snapshot,
} from './core/mags/index.js'
