import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const macIntelElectronVersion = '43.7.11'

export function macIntelManifest(original) {
  if (!/^\d+\.\d+\.\d+$/.test(original.version) || !original.build?.mac || !original.devDependencies?.electron) {
    throw new Error('Expected a released Agent Pi desktop package with macOS build configuration')
  }
  const manifest = structuredClone(original)
  manifest.devDependencies.electron = macIntelElectronVersion
  manifest.build.mac.target = [
    { target: 'dmg', arch: ['x64'] },
    { target: 'zip', arch: ['x64'] },
  ]
  manifest.build.mac.minimumSystemVersion = '12.0'
  manifest.build.mac.artifactName = 'Agent-Pi-DSH-${version}-mac-${arch}-monterey.${ext}'
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: prepare-macos-intel.mjs <extracted-desktop-directory>')
  const filename = join(resolve(process.argv[2]), 'package.json')
  const manifest = macIntelManifest(JSON.parse(readFileSync(filename, 'utf8')))
  writeFileSync(filename, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({ appVersion: manifest.version, electron: macIntelElectronVersion, arch: 'x64', minimumMacOS: '12.0' }))
}
