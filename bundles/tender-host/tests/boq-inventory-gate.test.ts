import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  BOQ_INVENTORY_MEMO,
  assessBoqInventoryGate,
  boqInventoryApplies,
  boqInventoryRejectReason,
  fixtureBoqReconciliationData,
  writeBoqInventoryFixture,
} from '../src/boq-inventory-gate.ts'
import { fixtureAnalysisSuiteMarkdown } from '../src/analysis-suite.ts'
import { initTenderWorkspace, upsertWorkspaceSection } from '../src/workspace.ts'
import { writeJson } from '../src/fsutil.ts'

function seed(cwd: string, projectId: string, fileName: string, kind: 'boq' | 'specification' | 'other' = 'boq') {
  const path = join(cwd, fileName)
  writeFileSync(path, 'boq fixture '.repeat(20))
  initTenderWorkspace(cwd, projectId, { id: projectId, title: projectId, status: 'active' })
  upsertWorkspaceSection(cwd, projectId, {
    documents: [{
      id: 'src-boq-seed-aa11bb22cc33',
      name: fileName,
      path,
      kind,
      status: 'active',
    }],
  })
  if (kind === 'boq') {
    writeBoqRestore(cwd, projectId, path, [
      '# BOQ',
      '| ITEM | DESCRIPTION | UNIT | QTY | RATE | AMT |',
      '| --- | --- | --- | --- | --- | --- |',
      '| C1.1 | Clear and grub the road reserve | ha | 12.5 | | 0 |',
      '| C1.2 | Remove topsoil to stockpile | m3 | 850 | | 0 |',
      '| C2.1 | Cut to spoil in all materials | m3 | 4200 | | 0 |',
    ].join('\n'))
  }
  return path
}

function writePack(cwd: string, projectId: string, data: unknown) {
  writeJson(join(cwd, '.agent-pi', 'business', 'tender', projectId, 'packs', 'boq-reconciliation.json'), {
    schemaVersion: 1,
    capability: 'boq_reconciliation',
    projectId,
    revision: 1,
    coreRevision: 2,
    upstream: [{ capability: 'core', revision: 2 }],
    updatedAt: '2026-08-25T10:00:00.000Z',
    data,
  })
}

function writeBoqRestore(cwd: string, projectId: string, sourcePath: string, markdown: string) {
  const dir = join(cwd, 'Agent Pi Outputs', projectId, 'setup', 'boq-source-解析稿')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manuscript.md'), markdown)
  writeFileSync(join(dir, 'pack.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'agent-pi-kb-pack',
    role: 'agent-pi-setup-restore',
    name: 'BOQ source',
    manuscript: 'manuscript.md',
    originalName: 'BOQ-pricing-schedule.xlsx',
    originalPath: sourcePath,
    units: [],
  }, null, 2))
}

test('analysis stage owns the BOQ inventory gate', () => {
  assert.equal(boqInventoryApplies('tender-document-analysis'), true)
  assert.equal(boqInventoryApplies('boq-five-step-pricing'), false)
})

test('missing pack and missing BOQ file fail closed', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-empty-'))
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.match(gate.shortGaps, /未登记工程量清单/)
  assert.match(gate.shortGaps, /boq-reconciliation/)
  assert.match(boqInventoryRejectReason(gate), /不得结束招标文件解析/)
  assert.match(boqInventoryRejectReason(gate), /force_pass/)
})

test('empty items cannot close analysis', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-zero-'))
  seed(cwd, 'p1', 'Bill-of-Quantities.xlsx')
  writePack(cwd, 'p1', { items: [], scopeLinks: [] })
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO))
  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.equal(gate.packExists, true)
  assert.match(gate.shortGaps, /没有清单行/)
})

test('placeholder rows and a spec PDF source do not count', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-fake-'))
  seed(cwd, 'p1', 'COTO-specification.pdf', 'specification')
  writePack(cwd, 'p1', {
    items: [{
      id: 'boq-demo',
      source: { documentId: 'src-boq-seed-aa11bb22cc33', sheet: 'A', cell: 'B2' },
      code: 'demo',
      description: '示例清单项占位',
      unit: 'm',
      quantity: '1',
      quantityBasis: 'boq',
      quantityStatus: 'sourced',
      quantityRefs: [],
    }],
    scopeLinks: [],
  })
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), `${fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO)}\n\ndemo\n`)
  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.ok(gate.shortGaps.includes('占位') || gate.shortGaps.includes('不是工程量清单') || gate.shortGaps.includes('未登记工程量清单'))
})

test('three real lines plus memo codes clear the gate', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-ok-'))
  seed(cwd, 'p1', 'BOQ-pricing-schedule.xlsx')
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO))
  writeBoqInventoryFixture(cwd, 'p1', analysisDir)
  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, true, gate.shortGaps)
  assert.equal(gate.touchedCount, 3)
  assert.ok(gate.codes.includes('C1.1'))
  const memo = readFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), 'utf8')
  assert.match(memo, /C1\.1/)
  assert.match(memo, /C2\.1/)
})

test('real lines without naming the codes in the memo still fail', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-uncited-'))
  seed(cwd, 'p1', '工程量清单.xlsx')
  writePack(cwd, 'p1', fixtureBoqReconciliationData('src-boq-seed-aa11bb22cc33'))
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO))
  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.match(gate.shortGaps, /未点名实际清单号/)
})

test('a registered BOQ without a restored source fails closed', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-unrestored-'))
  const sourcePath = join(cwd, 'BOQ.xlsx')
  writeFileSync(sourcePath, 'unreadable fixture')
  initTenderWorkspace(cwd, 'p1', { id: 'p1', title: 'p1', status: 'active' })
  upsertWorkspaceSection(cwd, 'p1', {
    documents: [{
      id: 'src-boq-seed-aa11bb22cc33',
      name: 'BOQ.xlsx',
      path: sourcePath,
      kind: 'boq',
      status: 'active',
    }],
  })
  writePack(cwd, 'p1', fixtureBoqReconciliationData('src-boq-seed-aa11bb22cc33'))
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), [
    fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO),
    'C1.1 C1.2 C2.1',
  ].join('\n'))

  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.deepEqual(gate.missingRestoreDocuments, ['BOQ.xlsx'])
  assert.match(gate.shortGaps, /解析稿/)
})

test('a three-row sample cannot hide additional coded BOQ rows in the restored source', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-coverage-'))
  const sourcePath = seed(cwd, 'p1', 'BOQ-pricing-schedule.xlsx')
  writeBoqRestore(cwd, 'p1', sourcePath, [
    '# BOQ',
    '| ITEM | DESCRIPTION | UNIT | QTY | RATE | AMT |',
    '| --- | --- | --- | --- | --- | --- |',
    '| C1.1 | Clear and grub the road reserve | ha | 12.5 | | 0 |',
    '| C1.2 | Remove topsoil to stockpile | m3 | 850 | | 0 |',
    '| C2.1 | Cut to spoil in all materials | m3 | 4200 | | 0 |',
    '| C9.9 | Asphalt surfacing of the carriageway | m2 | 12000 | | 0 |',
  ].join('\n'))
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO))
  writeBoqInventoryFixture(cwd, 'p1', analysisDir)

  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.equal(gate.sourceCodeCount, 4)
  assert.deepEqual(gate.missingSourceCodes, ['C9.9'])
  assert.match(gate.shortGaps, /源表.*C9\.9/)
})

test('an inherited lettered BOQ row counts even when the source omits a repeated full code', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-letter-row-'))
  const sourcePath = seed(cwd, 'p1', 'BOQ-pricing-schedule.xlsx')
  writeBoqRestore(cwd, 'p1', sourcePath, [
    '# BOQ',
    '| ITEM | DESCRIPTION | UNIT | QTY | RATE | AMT |',
    '| --- | --- | --- | --- | --- | --- |',
    '| C1.1 | Clear and grub the road reserve | ha | 12.5 | | 0 |',
    '| C1.2 | Remove topsoil to stockpile | m3 | 850 | | 0 |',
    '| C2.1 | Concrete structures | m3 | 4200 | | 0 |',
    '| | (a) | Manholes and inlet structures | m3 | 5 | | 0 |',
  ].join('\n'))
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO))
  writeBoqInventoryFixture(cwd, 'p1', analysisDir)

  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, false)
  assert.equal(gate.sourceRowCount, 4)
  assert.equal(gate.missingSourceCodes.length, 0)
  assert.match(gate.shortGaps, /4.*3/)
})

test('a genuinely one-row BOQ is judged by full coverage, not an arbitrary minimum', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-boq-one-row-'))
  const sourcePath = seed(cwd, 'p1', 'BOQ-pricing-schedule.xlsx')
  writeBoqRestore(cwd, 'p1', sourcePath, [
    '# BOQ',
    '| ITEM | DESCRIPTION | UNIT | QTY | RATE | AMT |',
    '| --- | --- | --- | --- | --- | --- |',
    '| C1.1 | Clear and grub the road reserve | ha | 12.5 | | 0 |',
  ].join('\n'))
  const one = fixtureBoqReconciliationData('src-boq-seed-aa11bb22cc33')
  one.items = one.items.slice(0, 1)
  writePack(cwd, 'p1', one)
  const analysisDir = join(cwd, 'document-analysis')
  mkdirSync(analysisDir)
  writeFileSync(join(analysisDir, BOQ_INVENTORY_MEMO), `${fixtureAnalysisSuiteMarkdown(BOQ_INVENTORY_MEMO)}\nC1.1\n`)

  const gate = assessBoqInventoryGate(cwd, 'p1', analysisDir)
  assert.equal(gate.ready, true, gate.shortGaps)
  assert.equal(gate.sourceCodeCount, 1)
})

test('workbench client surfaces the inventory gap', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/client.js'), 'utf8')
  assert.match(page, /st\.boqInventory/)
  assert.match(page, /工程量清单已抽出/)
})
