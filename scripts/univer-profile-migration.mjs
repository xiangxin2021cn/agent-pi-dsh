import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const UNIVER_OFFICE_NAME = 'dsh-univer-office'

function normalize(path) {
  return resolve(path).split(sep).join('/').toLowerCase()
}

function dependencyTarget(profileDir, spec) {
  if (/^file:\/\//i.test(spec)) return fileURLToPath(spec)
  const raw = spec.replace(/^(?:link|file):/i, '')
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // A literal percent is valid in a local path. Preserve it rather than
    // turning an unrelated user-owned dependency into a startup failure.
  }
  return resolve(profileDir, decoded)
}

function isProductVendorTarget(target, productRoot) {
  const normalized = normalize(target)
  const current = normalize(join(productRoot, 'vendor', UNIVER_OFFICE_NAME))
  return normalized === current
    || normalized.endsWith('/product/vendor/dsh-univer-office')
}

function removeProductOwnedModule(modulePath, target) {
  try {
    const stat = lstatSync(modulePath)
    if (stat.isSymbolicLink()) {
      const linked = resolve(dirname(modulePath), readlinkSync(modulePath))
      if (!existsSync(linked) || normalize(linked) === normalize(target)) {
        rmSync(modulePath, { force: true })
        return true
      }
      return false
    }
    if (stat.isDirectory() && existsSync(join(modulePath, 'AGENT-PI-VENDOR-RECEIPT.json'))) {
      const receipt = JSON.parse(readFileSync(join(modulePath, 'AGENT-PI-VENDOR-RECEIPT.json'), 'utf8'))
      if (receipt?.package?.name === UNIVER_OFFICE_NAME) {
        rmSync(modulePath, { recursive: true, force: true })
        return true
      }
    }
  } catch {
    // Missing or user-owned package: there is nothing product-owned to remove.
  }
  return false
}

/**
 * Remove only the obsolete Agent Pi `link:`/`file:` dependency left by an
 * older installer. A registry install (semver/git spec or ordinary package
 * directory) belongs to the user and is never rewritten or deleted.
 */
export function removeMissingProductUniverDependency({ dependencies, profileDir, productRoot }) {
  const spec = dependencies[UNIVER_OFFICE_NAME]
  if (typeof spec !== 'string' || !/^(?:link|file):/i.test(spec)) {
    return { changed: false, removedModule: false }
  }
  const target = dependencyTarget(profileDir, spec)
  if (!isProductVendorTarget(target, productRoot) || existsSync(target)) {
    return { changed: false, removedModule: false }
  }
  delete dependencies[UNIVER_OFFICE_NAME]
  const removedModule = removeProductOwnedModule(
    join(profileDir, 'node_modules', UNIVER_OFFICE_NAME),
    target,
  )
  return { changed: true, removedModule }
}
