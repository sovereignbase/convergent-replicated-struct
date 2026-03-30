import { version as uuidVersion } from 'uuid'

export function isUuidV7(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return uuidVersion(value) === 7
  } catch {
    return false
  }
}
