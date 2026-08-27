import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  ANALYSIS_SUITE,
  ANALYSIS_SUITE_MIN_CHARS,
  analysisSuiteRejectReason,
  assessAnalysisSuite,
  fixtureAnalysisSuiteMarkdown,
} from '../src/analysis-suite.ts'

test('empty official folder fails the analysis suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-suite-empty-'))
  const status = assessAnalysisSuite(dir)
  assert.equal(status.ok, false)
  assert.equal(status.missing.length, ANALYSIS_SUITE.length)
  assert.match(status.shortGaps, /缺《招标文件总结\.md》/)
  assert.match(analysisSuiteRejectReason(status), /不能代替这五份/)
})

test('a lone summary-sized file does not satisfy the suite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-suite-summary-'))
  writeFileSync(join(dir, '招标文件解析总报告.md'), '# 总报告\n' + '综述 '.repeat(400))
  const status = assessAnalysisSuite(dir)
  assert.equal(status.ok, false)
  assert.ok(status.missing.includes('招标文件总结.md'))
})

test('short or chapter-thin memos fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-suite-thin-'))
  for (const spec of ANALYSIS_SUITE) {
    writeFileSync(join(dir, spec.fileName), `# ${spec.fileName}\n太短。`)
  }
  const short = assessAnalysisSuite(dir)
  assert.equal(short.ok, false)
  assert.equal(short.short.length, ANALYSIS_SUITE.length)

  writeFileSync(join(dir, '招标文件总结.md'), `# 招标文件总结\n\n${'占位文字。'.repeat(ANALYSIS_SUITE_MIN_CHARS)}\n`)
  const thin = assessAnalysisSuite(dir)
  const summary = thin.files.find((file) => file.fileName === '招标文件总结.md')
  assert.ok(summary)
  assert.equal(summary.longEnough, true)
  assert.ok(summary.missingTerms.length > 0)
  assert.equal(thin.ok, false)
})

test('five fixture memos clear the mechanical bar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-suite-ok-'))
  for (const spec of ANALYSIS_SUITE) {
    const body = fixtureAnalysisSuiteMarkdown(spec.fileName)
    assert.ok(body.length >= ANALYSIS_SUITE_MIN_CHARS)
    writeFileSync(join(dir, spec.fileName), body)
  }
  const status = assessAnalysisSuite(dir)
  assert.equal(status.ok, true)
  assert.equal(status.shortGaps, '')
  assert.ok(status.files.every((file) => file.ok))
})

test('workbench client lists the suite on the check panel', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/client.js'), 'utf8')
  assert.match(page, /深度套件已齐/)
  assert.match(page, /st\.suite\.shortGaps/)
  assert.match(page, /分析深度套件/)
  assert.match(page, /st\.boqInventory/)
  assert.match(page, /工程量清单已抽出/)
  assert.match(page, /action: 'check'/)
})
