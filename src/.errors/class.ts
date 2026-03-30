export type OOMapErrorCode = 'BAD_SNAPSHOT'

export class OOMapError extends Error {
  readonly code: OOMapErrorCode

  constructor(code: OOMapErrorCode, message?: string) {
    const detail = message ?? code
    super(`{@sovereignbase/observed-overwrite-map} ${detail}`)
    this.code = code
    this.name = 'OOMapError'
  }
}
