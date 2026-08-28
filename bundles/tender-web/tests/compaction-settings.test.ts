import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const client = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lib/client.js'), 'utf8')
const start = client.indexOf('function CodexSettingsSection()')
const end = client.indexOf('function CompanyLockup', start)
const section = client.slice(start, end)

test('compaction settings explain the trigger, target, charge, and provider boundary', () => {
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(section, /对话自动压缩/)
  assert.match(section, /约 72%/)
  assert.match(section, /deepseek-v4-flash-vision-exp/)
  assert.match(section, /DeepSeek 调用费用/)
  assert.match(section, /跨供应商/)
  assert.match(section, /当前会话模型/)
})

test('compaction bridge is available only when both desktop methods exist', () => {
  assert.match(section, /typeof desktop\.compactionFallbackStatus === 'function'\s*&&\s*typeof desktop\.setCompactionFallback === 'function'/)
  assert.match(section, /compactionFallbackStatus\(\)/)
  assert.match(section, /setCompactionFallback\(nextEnabled\)/)
  assert.match(section, /仅在打包的桌面应用中可用/)
})

test('loaded and saved booleans control the compaction switch', () => {
  assert.match(section, /const result = await desktop\.compactionFallbackStatus\(\)/)
  assert.match(section, /setCompactionEnabled\(result\.enabled\)/)
  assert.match(section, /const result = await desktop\.setCompactionFallback\(nextEnabled\)/)
  assert.match(section, /'aria-checked': compactionEnabled \? 'true' : 'false'/)
  assert.match(section, /restartRequired\s*\?\s*\(zh \? '重启应用后生效' : 'Restart the app to apply'/)
})

test('restartRequired false is a successful save without a restart or error message', () => {
  assert.match(section, /typeof result\.restartRequired !== 'boolean'/)
  assert.doesNotMatch(section, /result\.restartRequired !== true/)
  assert.match(section, /lastConfirmedCompaction\.current = result\.enabled\s*setCompactionEnabled\(result\.enabled\)/)
  assert.match(section, /result\.restartRequired \? \(zh \? '重启应用后生效' : 'Restart the app to apply'\) : ''/)
})

test('malformed or failed bridge results restore the last confirmed value', () => {
  assert.match(section, /typeof result\.enabled !== 'boolean'/)
  assert.match(section, /lastConfirmedCompaction\.current = result\.enabled/)
  assert.match(section, /setCompactionEnabled\(lastConfirmedCompaction\.current\)/)
  assert.match(section, /重试/)
})

test('the accessible switch is disabled while loading, saving, or unavailable', () => {
  assert.match(section, /role: 'switch'/)
  assert.match(section, /disabled: compactionBusy \|\| !compactionBridgeAvailable/)
  assert.match(section, /setCompactionBusy\(true\)/)
  assert.match(section, /setCompactionBusy\(false\)/)
})

test('renderer neither restarts the app nor accesses preferences directly', () => {
  assert.doesNotMatch(section, /relaunch\s*\(/)
  assert.doesNotMatch(section, /window-prefs\.json|compactionFallbackEnabled|readFile|writeFile/)
})

test('Codex settings keep the login card and add an independent compaction card', () => {
  assert.match(section, /ChatGPT \/ Codex/)
  assert.match(section, /codexAuthLogin/)
  assert.match(section, /codexAuthLogout/)
  assert.equal(section.match(/className: 'ap-codex-card'/g)?.length, 2)
})
