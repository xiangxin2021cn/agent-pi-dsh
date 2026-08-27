import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'init-tender-profile.mjs'), 'utf8')

test('Univer runtime install resolves only production dependencies in a clean staging folder', () => {
  assert.match(script, /const runtimeDependencies = .*\.dependencies/)
  assert.match(script, /cwd: installDir/)
  assert.match(script, /cpSync\(join\(installDir, 'node_modules'\), join\(univerDir, 'node_modules'\)/)
  assert.doesNotMatch(script, /cwd: univerDir/)
})
