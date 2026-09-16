import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const market = join(root, 'vendor/dshmarket')
const require = createRequire(join(root, 'vendor/deepseek-harness/package.json'))
const ts = require('typescript')
// The official npm artifact includes types. Re-emit the locally adapted host
// sources with the same .ts -> .js import convention and native client wrapper.
for (const name of readdirSync(join(market, 'src')).filter(name => name.endsWith('.ts'))) {
  const result = ts.transpileModule(readFileSync(join(market, 'src', name), 'utf8'), {
    fileName: name, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, rewriteRelativeImportExtensions: true },
  })
  if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error(`Market syntax check failed: ${name}`)
  writeFileSync(join(market, 'lib', name.replace(/\.ts$/, '.js')), result.outputText)
}
const built = spawnSync(process.execPath, [join(root, 'vendor/deepseek-harness/node_modules/tsdown/dist/run.mjs'), '--config', 'tsdown.config.ts'], {
  cwd: market, stdio: 'inherit', windowsHide: true,
})
if (built.error) throw built.error
if (built.status !== 0) throw new Error(`Market client build failed: ${built.status}`)
