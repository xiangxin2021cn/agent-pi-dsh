import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export function pluginDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

export function repoRoot(): string {
  return resolve(pluginDir(), '../../..')
}
