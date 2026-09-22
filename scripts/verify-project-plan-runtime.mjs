import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex')

export function verifyProjectPlanRuntime(productRoot, { portable = false } = {}) {
  const bundle = join(resolve(productRoot), 'bundles/project-plan')
  const runtime = join(bundle, 'runtime')
  const receipt = JSON.parse(readFileSync(join(runtime, 'build-receipt.json'), 'utf8'))
  if (receipt.mpxj !== '16.7.0' || receipt.source !== digest(join(bundle, 'src/ProjectPlan.java'))) {
    throw new Error('Project plan engine source or version is stale')
  }
  const jars = readdirSync(join(runtime, 'lib')).filter(name => name.endsWith('.jar')).sort()
  if (JSON.stringify(jars) !== JSON.stringify(Object.keys(receipt.jars).sort())) throw new Error('Project plan dependency inventory mismatch')
  for (const name of jars) {
    if (receipt.jars[name] !== digest(join(runtime, 'lib', name))) throw new Error(`Project plan dependency changed: ${name}`)
  }
  if (receipt.bridge !== digest(join(runtime, 'classes/ProjectPlan.class'))) throw new Error('Project plan bridge changed')
  for (const path of ['THIRD_PARTY_NOTICES.md', 'legal/MPXJ-LICENSE.txt', 'runtime/sources/mpxj-16.7.0-sources.jar']) {
    if (!existsSync(join(bundle, path))) throw new Error(`Project plan legal input missing: ${path}`)
  }
  if (!portable) {
    if (receipt.platform !== process.platform || receipt.arch !== process.arch) throw new Error('Project plan JRE targets a different platform')
    const java = join(runtime, 'jre/bin', process.platform === 'win32' ? 'java.exe' : 'java')
    const check = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
    if (check.status !== 0 || !/version "17\./.test(check.stderr)) throw new Error('Bundled Java 17 does not start')
    if (!existsSync(join(runtime, 'jre/legal/java.base/LICENSE'))) throw new Error('Java runtime license missing')
  }
  return receipt
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyProjectPlanRuntime(process.argv[2] || '.', { portable: process.argv.includes('--portable') })
  console.log('Project plan runtime verified')
}
