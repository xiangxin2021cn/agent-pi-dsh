import { existsSync, lstatSync, realpathSync, renameSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeManifest } from './repair-dsh-links.mjs'

/** Keep the original Windows engine bytes, below LibreOffice's path limit. */
export function stageOfficeEngine(dshRoot) {
  const root = realpathSync(dshRoot)
  const consumer = createRequire(join(root, 'packages/skill/skill-office/package.json'))
  const kit = createRequire(consumer.resolve('@deepseek-ai/libreoffice-kit/package.json'))
  const source = realpathSync(dirname(kit.resolve('@deepseek-ai/libreoffice-kit-win32-x64/package.json')))
  const target = join(root, 'node_modules/.office')
  if (source === target) return target
  const modules = realpathSync(join(root, 'node_modules')) + sep
  if (!source.startsWith(modules) || !target.startsWith(modules) || lstatSync(source).isSymbolicLink()) {
    throw new Error('Office engine must be a physical package inside the staged DSH node_modules')
  }
  if (existsSync(target)) throw new Error('Office short-path destination already exists')
  renameSync(source, target)
  symlinkSync(target, source, 'junction')
  // The installer restores relative links after copying to the chosen location.
  writeManifest(root)
  return relative(root, target)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: stage-office-engine.mjs <staged-dsh-root>')
  console.log(`Office engine staged: ${stageOfficeEngine(process.argv[2])}`)
}
