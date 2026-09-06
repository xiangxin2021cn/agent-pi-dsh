#!/usr/bin/env node

import { lstatSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function statOrMissing(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

/** Delete only the installer-owned Office tree, never its linked peer packages. */
export function removeUniverTree(installRoot, target) {
  if (typeof installRoot !== 'string' || !isAbsolute(installRoot)) {
    throw new Error('An absolute installation root is required')
  }
  const root = resolve(installRoot)
  if (root === parse(root).root || root.startsWith('\\\\')) {
    throw new Error('The installation root must be a dedicated local directory')
  }
  if (target !== 'current' && target !== 'previous') {
    throw new Error('Only current or previous installer-owned Office trees may be removed')
  }
  const vendor = join(root, 'resources', 'runtime', 'product', 'vendor')
  const path = join(vendor, target === 'current' ? 'dsh-univer-office' : '.agent-pi-univer-previous')
  const ancestors = []
  for (let current = vendor; ; current = dirname(current)) {
    ancestors.push(current)
    if (current === dirname(current)) break
  }
  for (const ancestor of ancestors.reverse()) {
    const stat = statOrMissing(ancestor)
    if (!stat) return { removed: false, path }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing a linked or non-directory ancestor: ${ancestor}`)
    }
  }
  const stat = statOrMissing(path)
  if (!stat) return { removed: false, path }
  if (!stat.isSymbolicLink() && !stat.isDirectory()) {
    throw new Error(`Refusing a non-directory Office tree: ${path}`)
  }
  // Node removes junction entries without following them. NSIS RMDir /r can
  // traverse the Office peer junctions and erase the shared DSH runtime.
  rmSync(path, { recursive: !stat.isSymbolicLink(), maxRetries: 3, retryDelay: 100 })
  return { removed: true, path }
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2) {
    throw new Error('Usage: installer-remove-univer-tree.mjs <absolute-install-root> <current|previous>')
  }
  const result = removeUniverTree(args[0], args[1])
  process.stdout.write(`${result.removed ? 'Removed' : 'No'} installer-owned Office tree: ${result.path}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
