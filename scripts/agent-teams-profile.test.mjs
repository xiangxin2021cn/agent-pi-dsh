import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { configureTeamPreset } from './agent-teams-profile.mjs'
import { normalizeAgentTeamsPreference, createAgentTeamsPreferenceUpdate } from '../apps/desktop/agent-team-preferences.mjs'
import { startupFailureDetail, sanitizeStartupLog } from '../apps/desktop/startup-diagnostics.mjs'

test('team preference is opt-in and accepts only booleans', () => {
  assert.equal(normalizeAgentTeamsPreference({}).enabled, false)
  assert.equal(normalizeAgentTeamsPreference({ agentTeamsEnabled: 'true' }).enabled, false)
  assert.equal(normalizeAgentTeamsPreference(createAgentTeamsPreferenceUpdate(true)).enabled, true)
  assert.throws(() => createAgentTeamsPreferenceUpdate('true'))
})

test('team preset disables scoped legacy controls and preserves independent Codex execution', () => {
  const source = readFileSync(new URL('../vendor/dsh-router-standard/preset/agent.cordis.yml', import.meta.url), 'utf8')
  const next = configureTeamPreset(source)
  for (const id of ['tool-subagent-control', 'tool-subagent-list-agents']) {
    const row = next.replaceAll('\r\n', '\n').split(`- id: ${id}\n`)[1]?.split(/\n\s*- id:/)[0]
    assert.match(row || '', /disabled: true/)
  }
  assert.equal((next.match(/backgroundMode: one-shot/g) || []).length, 2)
  assert.equal(next.slice(next.indexOf('    - id: tool-subagent-codex')), source.slice(source.indexOf('    - id: tool-subagent-codex')))
  assert.equal(configureTeamPreset(next), next)
})

test('startup diagnostic retains the concrete dependency error without tokens or secrets', () => {
  const output = 'API_KEY=private\n[out] http://127.0.0.1:3080/?token=private\nError: Cannot find package @puppeteer/browsers\n'
  const detail = startupFailureDetail(new Error('profile init failed'), output, 'test.log')
  assert.match(detail, /@puppeteer\/browsers/)
  assert.doesNotMatch(detail, /private/)
  assert.doesNotMatch(sanitizeStartupLog(output), /API_KEY/)
})
