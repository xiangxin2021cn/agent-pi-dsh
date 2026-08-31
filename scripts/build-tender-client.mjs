import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'bundles', 'tender-web')
const cli = join(root, 'vendor', 'deepseek-harness', 'node_modules', 'tsdown', 'dist', 'run.mjs')
const entry = join(bundle, 'src', 'client', 'index.js')

if (!existsSync(cli)) {
  throw new Error('tsdown is missing under vendor/deepseek-harness/node_modules; initialize the DSH checkout first')
}
if (!existsSync(entry)) {
  throw new Error('tender-web source entry is missing: ' + entry)
}

const built = spawnSync(process.execPath, [cli, '--config', 'tsdown.config.mjs'], {
  cwd: bundle,
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  stdio: 'inherit',
})
if (built.error) throw built.error
if (built.status !== 0) throw new Error('tender-web client build failed with exit code ' + built.status)
