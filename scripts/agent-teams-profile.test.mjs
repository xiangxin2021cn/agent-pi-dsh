import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { retireLegacyTeamLinks, TEAM_BUNDLES } from './agent-teams-profile.mjs'
import { normalizeAgentTeamsPreference, createAgentTeamsPreferenceUpdate } from '../apps/desktop/agent-team-preferences.mjs'
import { startupFailureDetail, sanitizeStartupLog } from '../apps/desktop/startup-diagnostics.mjs'

test('team preference is opt-in and accepts only booleans', () => {
  assert.equal(normalizeAgentTeamsPreference({}).enabled, false)
  assert.equal(normalizeAgentTeamsPreference({ agentTeamsEnabled: 'true' }).enabled, false)
  assert.equal(normalizeAgentTeamsPreference(createAgentTeamsPreferenceUpdate(true)).enabled, true)
  assert.throws(() => createAgentTeamsPreferenceUpdate('true'))
})

test('rc.3 retires only product-owned legacy Team links and preserves a byte-exact backup', t => {
  const profile = mkdtempSync(join(tmpdir(), 'ap-teams-390-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  const path = join(profile, 'package.json')
  const original = JSON.stringify({ dependencies: {
    [TEAM_BUNDLES[0]]: 'link:C:/old/runtime/deepseek-harness/packages/experimental/agent-team-profile',
    [TEAM_BUNDLES[1]]: '0.2.2-rc.1',
    [TEAM_BUNDLES[2]]: 'link:C:/user/tool-agent-team',
    'user-plugin': '^1.0.0',
  }, dsh: { profile: { bundles: [...TEAM_BUNDLES, 'user-plugin'] } } }, null, 4) + '\n'
  writeFileSync(path, original)
  assert.equal(retireLegacyTeamLinks(profile), true)
  assert.equal(readFileSync(path + '.pre-3.9.0-teams.bak', 'utf8'), original)
  const next = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(next.dependencies[TEAM_BUNDLES[0]], undefined)
  assert.equal(next.dependencies[TEAM_BUNDLES[1]], '0.2.2-rc.1')
  assert.equal(next.dependencies[TEAM_BUNDLES[2]], 'link:C:/user/tool-agent-team')
  assert.deepEqual(next.dsh.profile.bundles, ['user-plugin'])
  assert.equal(retireLegacyTeamLinks(profile), false)
  assert.equal(readFileSync(path + '.pre-3.9.0-teams.bak', 'utf8'), original)
})

test('startup diagnostic retains the concrete dependency error without tokens or secrets', () => {
  const output = 'API_KEY=private\n[out] http://127.0.0.1:3080/?token=private\nError: Cannot find package @puppeteer/browsers\n'
  const detail = startupFailureDetail(new Error('profile init failed'), output, 'test.log')
  assert.match(detail, /@puppeteer\/browsers/)
  assert.doesNotMatch(detail, /private/)
  assert.doesNotMatch(sanitizeStartupLog(output), /API_KEY/)
})
