import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dependencyRoots = ['deepseek-harness/node_modules', 'product/bundles/tender-host/node_modules']
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** Remove only validated development source maps from two production dependency trees. */
export function pruneRuntimeDebugMaps(runtimeRoot, { apply = false } = {}) {
  if (!isAbsolute(runtimeRoot)) throw new Error('An absolute staging runtime directory is required')
  const root = resolve(runtimeRoot)
  const product = JSON.parse(readFileSync(join(root, 'product/package.json'), 'utf8'))
  const dsh = JSON.parse(readFileSync(join(root, 'deepseek-harness/package.json'), 'utf8'))
  if (product.agentPiProduct?.edition !== 'mainline' || dsh.name !== '@deepseek-ai/dsh-root') {
    throw new Error('Debug-map pruning requires the staged mainline runtime')
  }
  const candidates = [], skippedLinks = [], areas = []
  const ordinary = path => {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Linked or non-directory dependency root: ' + path)
  }
  ordinary(root)
  for (const area of dependencyRoots) {
    const inventory = { path: area, beforeFiles: 0, beforeBytes: 0, removedFiles: 0, removedBytes: 0 }
    areas.push(inventory)
    let directory = root
    for (const part of area.split('/')) { directory = join(directory, part); ordinary(directory) }
    const visit = current => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name)
        if (entry.isSymbolicLink()) { skippedLinks.push(relative(root, path)); continue }
        if (entry.isDirectory()) { visit(path); continue }
        if (!entry.isFile()) continue
        const stat = lstatSync(path)
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Dependency file changed during inventory: ' + path)
        inventory.beforeFiles++
        inventory.beforeBytes += stat.size
        if (!/\.(?:[cm]?js|css|d\.ts)\.map$/i.test(entry.name)) continue
        const bytes = readFileSync(path)
        let map
        try { map = JSON.parse(bytes.toString('utf8')) } catch { continue }
        if (map?.version !== 3 || typeof map.mappings !== 'string' || !Array.isArray(map.sources)
          || !map.sources.every(source => typeof source === 'string')) continue
        const relativePath = relative(root, path)
        if (relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) throw new Error('Debug map escaped staging')
        inventory.removedFiles++
        inventory.removedBytes += bytes.length
        candidates.push({ path: relativePath.replace(/\\/g, '/'), bytes: bytes.length, sha256: sha(bytes) })
      }
    }
    visit(directory)
  }
  if (apply) for (const file of candidates) {
    const path = join(root, file.path)
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Debug map changed before removal: ' + path)
    if (sha(readFileSync(path)) !== file.sha256) throw new Error('Debug-map content changed before removal: ' + path)
    unlinkSync(path)
  }
  return { schema: 'agent-pi-dsh/runtime-debug-map-pruning/v1', mode: apply ? 'removed' : 'dry-run',
    productVersion: product.version ?? null, dshVersion: dsh.version ?? null,
    script: 'scripts/prune-runtime-debug-maps.mjs', scriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    dependencyRoots, areas: areas.map(area => ({ ...area, afterFiles: area.beforeFiles - (apply ? area.removedFiles : 0),
      afterBytes: area.beforeBytes - (apply ? area.removedBytes : 0) })),
    files: candidates.length, bytes: candidates.reduce((sum, file) => sum + file.bytes, 0),
    candidateInventorySha256: sha(JSON.stringify(candidates)), candidates, skippedLinks }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, root] = process.argv.slice(2)
  if (!['--dry-run', '--apply'].includes(mode) || !root) throw new Error('Usage: prune-runtime-debug-maps.mjs <--dry-run|--apply> <staged-runtime-root>')
  const { candidates, skippedLinks, ...summary } = pruneRuntimeDebugMaps(root, { apply: mode === '--apply' })
  if (mode === '--apply') {
    const after = pruneRuntimeDebugMaps(root)
    assert.equal(after.files, 0, 'Validated debug maps remain after staging cleanup')
    summary.areas.forEach((area, index) => {
      assert.equal(after.areas[index].beforeFiles, area.afterFiles)
      assert.equal(after.areas[index].beforeBytes, area.afterBytes)
    })
    writeFileSync(join(root, 'RUNTIME-DEBUG-MAP-PRUNING.json'), JSON.stringify({ ...summary,
      skippedLinks: skippedLinks.length, postRemovalInventoryVerified: true, completedAt: new Date().toISOString() }, null, 2) + '\n')
  }
  console.log(JSON.stringify({ ...summary, skippedLinks: skippedLinks.length }))
}
