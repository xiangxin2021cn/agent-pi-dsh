import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

const preset = `plugins:
  group:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'

    - id: tool-subagent-codex
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true
      config:
        provider: codex

- id: tool-web
  name: '@deepseek-ai/dsh-tool-web'
  config:
    fetch: false
    searchTimeoutMs: 60000
`

function writePreset(file) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, preset)
}

test('staged alpha.1 runtime receives all Agent Pi session overlays', () => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-runtime-overlays-'))
  const dshRoot = join(root, 'deepseek-harness')
  const productRoot = join(root, 'product')
  const files = ['standard', 'ptc', 'cordis'].map((id) => join(
    dshRoot,
    'packages/preset/agent-presets/presets',
    id,
    'agent.cordis.yml',
  ))
  files.push(join(productRoot, 'vendor/dsh-router-standard/preset/agent.cordis.yml'))
  files.forEach(writePreset)

  const result = spawnSync(process.execPath, [
    join(import.meta.dirname, 'apply-runtime-overlays.mjs'),
    dshRoot,
    productRoot,
  ], { encoding: 'utf8', windowsHide: true })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.match(text, /thresholdRatio: 0\.72/)
    assert.match(text, /summarizationFallbacks:[\s\S]*deepseek-v4-flash-vision-exp/)
    assert.doesNotMatch(text, /tool-subagent-codex[\s\S]*?disabled: true/)
    assert.match(text, /fetch: true/)
  }
})
