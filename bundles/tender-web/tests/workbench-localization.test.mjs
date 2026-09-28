import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { localizeWorkbenchCopy } from '../src/client/locales/workbench-chrome.js'
import { stageGate, stageHint, stageLabel } from '../src/client/locales/workbench-stages.js'
import { localizeDepthCopy } from '../src/client/locales/professional-depth.js'

test('English workbench copy covers every translated project-view literal', () => {
  const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
  const keys = [...source.matchAll(/workbenchText\('((?:\\.|[^'\\])*)'\)/g)].map((match) => match[1])
  assert.ok(keys.length > 170)
  for (const key of keys) assert.doesNotMatch(localizeWorkbenchCopy(key, 'en'), /[\u3400-\u9fff]/u, key)
  assert.equal(localizeWorkbenchCopy('客户填写的中文要求', 'en'), '客户填写的中文要求')
  assert.equal(localizeWorkbenchCopy('流程监控', 'zh'), '流程监控')
})

test('professional-depth controls have English copy for every localized literal', () => {
  const source = readFileSync(new URL('../src/client/professional-depth.js', import.meta.url), 'utf8')
  const keys = [...source.matchAll(/\bt\('((?:\\.|[^'\\])*)'\)/g)].map((match) => match[1])
  assert.ok(keys.length > 40)
  for (const key of keys) assert.doesNotMatch(localizeDepthCopy(key, 'en'), /[\u3400-\u9fff]/u, key)
  assert.equal(localizeDepthCopy('客户自填内容', 'en'), '客户自填内容')
})

test('built-in stages and approval gates translate without altering customer edits', () => {
  const stage = {
    id: 'pricing-basis-freeze', label: 'Pricing basis freeze', labelZh: '组价基准冻结',
    hintZh: '把币种、税费、工资、材料、机械、工效、风险费和缺口处理冻结成可追溯基准，再由用户确认进入详细组价。',
    approvalGate: { approveLabelZh: '确认基准，开始组价' },
  }
  assert.equal(stageLabel(stage, 'en'), 'Pricing basis freeze')
  assert.match(stageHint(stage, 'en'), /currency/)
  assert.equal(stageGate(stage, 'approveLabelZh', 'en'), 'Confirm basis and price BOQ')
  assert.equal(stageLabel(stage, 'zh'), '组价基准冻结')
  const edited = { ...stage, labelZh: '客户自定义阶段', hintZh: '客户自定义提示' }
  assert.equal(stageLabel(edited, 'en'), '客户自定义阶段')
  assert.equal(stageHint(edited, 'en'), '客户自定义提示')
})
