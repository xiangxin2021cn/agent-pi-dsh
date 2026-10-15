import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const nativeName = '@anthropic-ai/claude-agent-sdk-darwin-x64'

export function omitMacOSClaudeNative(dshRoot) {
  const root = realpathSync(resolve(dshRoot))
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'pnpm-lock.yaml'))) {
    throw new Error('Expected an installed DSH runtime directory')
  }
  const inside = (parent, path) => {
    const child = relative(parent, path)
    return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))
  }
  const pending = [root]
  const packages = []
  const links = []
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const inDependencies = relative(root, path).split(sep).includes('node_modules')
      if (entry.isSymbolicLink()) {
        if (inDependencies) links.push(path)
        continue
      }
      if (!entry.isDirectory() || entry.name === '.git') continue
      if (inDependencies && entry.name === 'claude-agent-sdk-darwin-x64' && basename(directory) === '@anthropic-ai') {
        const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
        if (manifest.name !== nativeName) throw new Error(`Unexpected native package identity: ${path}`)
        packages.push(realpathSync(path))
      } else pending.push(path)
    }
  }
  for (const path of packages) {
    if (path === root || !inside(root, path)) throw new Error('Refusing removal outside DSH runtime')
  }
  const removed = []
  for (const link of links) {
    let target
    try { target = realpathSync(link) } catch { continue }
    if (!packages.some(path => inside(path, target))) continue
    if (!inside(root, link)) throw new Error('Refusing removal outside DSH runtime')
    rmSync(link, { force: true })
    removed.push(relative(root, link).split(sep).join('/'))
  }
  for (const path of packages) {
    rmSync(path, { recursive: true, force: true })
    removed.push(relative(root, path).split(sep).join('/'))
  }
  return { package: nativeName, removed: removed.length, paths: removed.sort() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== 'darwin' || process.arch !== 'x64') throw new Error('Only the Intel macOS compatibility build omits this native engine')
  if (!process.argv[2]) throw new Error('Usage: omit-macos-claude-native.mjs <installed-dsh-directory>')
  console.log(JSON.stringify(omitMacOSClaudeNative(process.argv[2])))
}
