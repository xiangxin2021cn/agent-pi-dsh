import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = join(import.meta.dirname, '..')
const directories = ['packages/engineering-core/tests', 'packages/engineering-rebar/tests', 'packages/china-tender/tests', 'packages/engineering-cad/tests', 'packages/engineering-road/tests', 'bundles/engineering/tests', 'bundles/engineering-rebar/tests', 'bundles/china-tender/tests', 'bundles/engineering-cad/tests', 'bundles/engineering-pdf/tests', 'bundles/engineering-road/tests']
const tests = directories.flatMap(directory => existsSync(join(root, directory)) ? readdirSync(join(root, directory)).filter(name => name.endsWith('.test.ts')).map(name => join(directory, name)) : [])
for (const directory of ['packages/engineering-bim/tests', 'bundles/engineering-bim/tests', 'packages/engineering-civil/tests', 'bundles/engineering-delivery/tests']) if (existsSync(join(root, directory))) tests.push(...readdirSync(join(root, directory)).filter(name => name.endsWith('.test.ts')).map(name => join(directory, name)))
tests.push('scripts/version-3.8.1.test.mjs')
tests.push('scripts/engineering-panel.test.mjs')
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', ...tests], { cwd: root, stdio: 'inherit', windowsHide: true })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
