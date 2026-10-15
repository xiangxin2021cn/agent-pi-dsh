import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

test('packaged provider disables omitted Codex capabilities only in the Intel distribution', async t => {
  const product = mkdtempSync(join(tmpdir(), 'agent-pi-codex-provider-'))
  t.after(() => rmSync(product, { recursive: true, force: true }))
  const lib = join(product, 'bundles/tender-host/lib')
  mkdirSync(lib, { recursive: true })
  const modulePath = join(lib, 'codex-model-bridge.mjs')
  writeFileSync(modulePath, stripTypeScriptTypes(readFileSync(new URL('../bundles/tender-host/src/codex-model-bridge.ts', import.meta.url), 'utf8')))
  const marker = join(product, 'MACOS-INTEL-MONTEREY.json')
  for (const compatibility of [false, true]) {
    if (compatibility) writeFileSync(marker, '{}')
    const { applyCodexModelProvider } = await import(pathToFileURL(modulePath).href + `?compatibility=${compatibility}`)
    let provider, actual
    const ctx = {
      subagents: { registerProvider(value) { provider = value } },
      subprocess: { spawn(spec) { actual = spec; return 'started' } },
    }
    applyCodexModelProvider(ctx, {}, (target) => target.subagents.registerProvider({
      name: 'codex', capabilities: {}, inheritsParentContext: false,
      start: () => target.subprocess.spawn({ argv: ['node', 'official-wrapper', 'app-server', '--stdio'], env: { CODEX_HOME: 'user-home' } }),
    }), 'packaged-wrapper')
    assert.equal(provider.start({}), 'started')
    assert.deepEqual(actual.argv, ['node', 'packaged-wrapper', ...(compatibility
      ? ['--config', 'features.shell_zsh_fork=false', '--config', 'features.realtime_conversation=false'] : []), 'app-server', '--stdio'])
    assert.deepEqual(actual.env, { CODEX_HOME: 'user-home' })
  }
})
