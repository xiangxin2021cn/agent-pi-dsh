import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { omitMacOSOptionalNative } from './omit-macos-claude-native.mjs'

export function prepareMacOSIntelOptionals(dshDirectory, productDirectory) {
  const dsh = realpathSync(resolve(dshDirectory))
  const product = realpathSync(resolve(productDirectory))
  if (!existsSync(join(product, 'package.json'))) throw new Error('Expected the product runtime directory')
  const omitted = omitMacOSOptionalNative(dsh)
  const store = join(dsh, 'node_modules/.pnpm')
  const candidates = existsSync(store) ? readdirSync(store)
    .filter(name => /^@openai\+codex@\d+\.\d+\.\d+-darwin-x64$/.test(name))
    .map(name => ({ root: dsh, path: join(store, name, 'node_modules/@openai/codex') })) : []
  candidates.push({ root: product, path: join(product, 'bundles/tender-host/node_modules/@openai/codex-darwin-x64') })
  const resources = []
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue
    const pkg = realpathSync(candidate.path)
    const child = relative(candidate.root, pkg)
    if (!child || isAbsolute(child) || child === '..' || child.startsWith('..' + sep)) throw new Error('Codex package escapes its runtime')
    const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
    if (manifest.name !== '@openai/codex' || !/^\d+\.\d+\.\d+-darwin-x64$/.test(manifest.version)) throw new Error('Unexpected Intel Codex package identity')
    for (const name of ['voice', 'zsh']) {
      const directory = join(pkg, 'vendor/x86_64-apple-darwin/codex-resources', name)
      if (!existsSync(directory)) continue
      const actual = realpathSync(directory)
      const local = relative(pkg, actual)
      if (!local || isAbsolute(local) || local === '..' || local.startsWith('..' + sep)) throw new Error('Codex resource escapes its package')
      rmSync(actual, { recursive: true, force: true })
      resources.push({ version: manifest.version, path: relative(candidate.root, actual).split(sep).join('/') })
    }
  }
  const marker = {
    schema: 1, minimumMacOS: '12.0', architecture: 'x64',
    disabledCapabilities: ['claude-code', 'local-voice', 'native-cua', 'codex-voice', 'codex-zsh-fork'],
    note: 'Use normal system shell execution. Optional newer-system native engines are excluded from this distribution.',
  }
  writeFileSync(join(product, 'MACOS-INTEL-MONTEREY.json'), JSON.stringify(marker, null, 2) + '\n')
  return { ...omitted, codexResources: resources, capabilities: marker }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== 'darwin' || process.arch !== 'x64') throw new Error('This preparation is only for the Intel macOS compatibility package')
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: prepare-macos-intel-optionals.mjs <dsh-directory> <product-directory>')
  console.log(JSON.stringify(prepareMacOSIntelOptionals(process.argv[2], process.argv[3])))
}
