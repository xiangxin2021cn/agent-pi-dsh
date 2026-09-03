import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'))

test('client manifest declares the official Chat projection it reads', () => {
  assert.deepEqual(manifest.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-chat',
  ])
  assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
})
