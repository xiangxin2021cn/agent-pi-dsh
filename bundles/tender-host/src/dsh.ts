import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { repoRoot } from './root.ts'

export function dshRoot(): string {
  return process.env.DSH_CHECKOUT ?? resolve(repoRoot(), 'vendor/deepseek-harness')
}

export function dshFile(rel: string): string {
  return resolve(dshRoot(), rel)
}

export async function importDsh<T = Record<string, unknown>>(rel: string): Promise<T> {
  return await import(pathToFileURL(dshFile(rel)).href) as T
}
