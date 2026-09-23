import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PRODUCT_PRESETS = 'dsh-agent-pi-presets'

/** Extract the official child composition without evaluating Cordis !!js expressions. */
export function shippedPresetPlugins(text) {
  const normalized = text.replaceAll('\r\n', '\n')
  const offset = normalized.indexOf('        plugins:\n')
  if (offset === -1) throw new Error('Official preset has no plugins declaration')
  const body = normalized.slice(offset + '        plugins:\n'.length)
  if (body.split('\n').some(line => line.trim() && !line.startsWith('          '))) {
    throw new Error('Official preset declaration shape changed')
  }
  return body.split('\n').map(line => line.slice(10)).join('\n')
}

/** Generate a normal DSH bundle; keep legacy custom preset files untouched. */
export function writePresetBundle({ systemRoot, userRoot, ids, parseYaml }) {
  const patches = []
  const rows = []
  for (const id of ids) {
    const plugins = readFileSync(join(systemRoot, id, 'agent.cordis.yml'), 'utf8')
    rows.push(`- id: preset-${id}\n  config:\n    id: ${id}\n    order: ${ids.indexOf(id) + 1}\n    plugins:\n${indent(plugins, 6)}`)
  }
  // Preserve legacy user presets without editing their source or module base.
  const userIds = existsSync(userRoot) ? readdirSync(userRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(userRoot, entry.name, 'agent.cordis.yml')))
    .map(entry => entry.name).sort() : []
  for (const id of userIds) {
    const directory = join(userRoot, id)
    const plugins = readFileSync(join(directory, 'agent.cordis.yml'), 'utf8').replace(
      /(^\s*name:\s*)(['"]?)(\.\.?\/[^\s'"\r\n]+)\2/gm,
      (_all, prefix, _quote, path) => prefix + JSON.stringify(pathToFileURL(resolve(directory, path)).href),
    )
    const key = JSON.stringify(`preset-${id}`)
    const value = JSON.stringify(id)
    const metadataPath = join(directory, 'preset.yml')
    const metadata = existsSync(metadataPath) && parseYaml ? parseYaml(readFileSync(metadataPath, 'utf8')) : null
    const name = JSON.stringify(typeof metadata?.name === 'string' ? metadata.name : id)
    const description = JSON.stringify(typeof metadata?.description === 'string' ? metadata.description : '')
    if (ids.includes(id)) rows.push(`- id: ${key}\n  config:\n    id: ${value}\n    name: ${name}\n    description: ${description}\n    plugins:\n${indent(plugins, 6)}`)
    else rows.push(`- insert:\n    - id: ${key}\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: ${value}\n        name: ${name}\n        description: ${description}\n        order: 10\n        plugins:\n${indent(plugins, 10)}`)
  }
  mkdirSync(systemRoot, { recursive: true })
  writeFileSync(join(systemRoot, 'cordis.patch.yml'), rows.join('\n') + '\n')
  patches.push('./cordis.patch.yml', './product-defaults.patch.yml')
  writeFileSync(join(systemRoot, 'package.json'), JSON.stringify({
    name: PRODUCT_PRESETS, version: '3.7.2', private: true, type: 'module',
    dsh: { bundle: { patch: patches } },
  }, null, 2) + '\n')
}

function indent(text, count) {
  return text.replaceAll('\r\n', '\n').split('\n').map(line => line ? ' '.repeat(count) + line : '').join('\n')
}
