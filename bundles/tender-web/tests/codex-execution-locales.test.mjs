import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AP_LANGUAGE_DEFINITIONS } from '../src/client/locales/catalog.js'
import { codexExecutionLocales, tCodexExecution } from '../src/client/locales/codex-execution.js'

const keys = ['main', 'ready', 'starting', 'running', 'waiting', 'failed', 'stop', 'intro', 'you', 'tool', 'answerNeeded', 'approvalNeeded', 'choose', 'other', 'reply', 'approve', 'decline', 'switchBlocked', 'desktopRequired', 'loginRequired', 'runtimeUnavailable', 'modelUnavailable', 'accessDenied', 'quotaExceeded', 'requestFailed', 'processDisconnected', 'requestTimeout', 'openConversation', 'engineCodexTitle', 'engineDshTitle', 'attachmentsNotReady', 'attachmentPathUnavailable', 'sessionBusy', 'invalidTask', 'switchWorkspace', 'answerAll', 'approvalInvalid', 'interactionExpired', 'attachmentTask', 'replyFailed']

test('Codex execution has every control and safe error in all ten application languages', () => {
  assert.deepEqual(Object.keys(codexExecutionLocales).sort(), AP_LANGUAGE_DEFINITIONS.map(({ id }) => id).sort())
  for (const [language, dictionary] of Object.entries(codexExecutionLocales)) {
    assert.deepEqual(Object.keys(dictionary), keys, language)
    for (const key of keys) {
      assert.equal(typeof dictionary[key], 'string', `${language}: ${key}`)
      assert.ok(dictionary[key].trim(), `${language}: ${key}`)
      assert.equal(tCodexExecution(key, language), dictionary[key], `${language}: ${key}`)
    }
  }
})

test('non-Chinese Codex controls never fall back to Chinese copy', () => {
  for (const [language, dictionary] of Object.entries(codexExecutionLocales)) {
    if (language === 'zh') continue
    for (const key of keys) {
      assert.notEqual(dictionary[key], codexExecutionLocales.zh[key], `${language}: ${key}`)
      // Japanese uses Han characters too; match untranslated Chinese wording instead.
      assert.doesNotMatch(dictionary[key], /主执行|待命|执行中|答复|请选择|请先|账户|额度|请求失败|请求超时|连接已断开/, `${language}: ${key}`)
      if (language !== 'ja') assert.doesNotMatch(dictionary[key], /\p{Script=Han}/u, `${language}: ${key}`)
    }
  }
})

test('Codex translation resolves region variants and uses English for unsupported locales', () => {
  assert.equal(tCodexExecution('approvalNeeded', 'JA-JP'), codexExecutionLocales.ja.approvalNeeded)
  assert.equal(tCodexExecution('modelUnavailable', 'pt-BR'), codexExecutionLocales.pt.modelUnavailable)
  for (const language of [undefined, null, '', 'xx']) assert.equal(tCodexExecution('desktopRequired', language), codexExecutionLocales.en.desktopRequired)
  assert.equal(tCodexExecution('unknownKey', 'zh'), 'unknownKey')
})
