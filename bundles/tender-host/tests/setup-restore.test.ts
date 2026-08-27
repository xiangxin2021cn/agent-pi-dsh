import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { completeSetup, refreshSourceBriefsAfterRestore, saveBoard, syncOrchestrationReportFromMarkdown } from '../src/orchestration.ts'
import { saveWorkspaceText } from '../src/preview-export.ts'
import { SETUP_RESTORE_KIND, isSetupAlignablePath, restoreSetupSource, restoreSetupSources } from '../src/setup-restore.ts'
import type { MineruIngestResult } from '../src/mineru-ingest.ts'

const SAMPLE_MARKDOWN = [
  '# 1 Materials',
  '',
  'Cement shall comply with GB 175 grade 42.5.',
  '',
  '# 2 Concrete',
  '',
  'Concrete strength shall not be lower than C30.',
  '',
].join('\n')

function fakeIngest(markdown = SAMPLE_MARKDOWN): typeof import('../src/mineru-ingest.ts').ingestDocumentForKb {
  return async () => ({
    markdown,
    contentList: [{ type: 'text', text: 'Cement', page_idx: 0 }],
    partCount: 1,
    via: 'local',
    route: 'local',
    ocr: false,
  } satisfies MineruIngestResult)
}

function writeDummyPdf(dir: string, name: string): string {
  const path = join(dir, name)
  writeFileSync(path, Buffer.from(`%PDF-dummy ${name}`))
  return path
}

test('restoreSetupSource rejects a type MinerU cannot align', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-reject-'))
  const zip = join(cwd, 'photos.zip')
  writeFileSync(zip, 'zip')
  await assert.rejects(
    () => restoreSetupSource(cwd, 'p1', zip, { ingest: fakeIngest() }),
    /对齐原稿/,
  )
})

test('restoreSetupSource writes manuscript.md + pack.json under setup/', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-restore-'))
  const pdf = writeDummyPdf(cwd, 'N.003-010-2017-3R Book 1 of Volume 3.pdf')
  const restore = await restoreSetupSource(cwd, 'n3-section1', pdf, { ingest: fakeIngest() })
  assert.equal(existsSync(restore.manuscriptPath), true)
  assert.equal(existsSync(restore.packPath), true)
  assert.match(restore.packDir.replace(/\\/g, '/'), /Agent Pi Outputs\/n3-section1\/setup\//)
  assert.match(restore.packDir, /解析稿/)
  const pack = JSON.parse(readFileSync(restore.packPath, 'utf8')) as {
    kind: string
    role: string
    manuscript: string
    originalPath: string
    units: Array<{ title?: string }>
  }
  assert.equal(pack.kind, 'agent-pi-kb-pack')
  assert.equal(pack.role, SETUP_RESTORE_KIND)
  assert.equal(pack.manuscript, 'manuscript.md')
  assert.equal(pack.originalPath, pdf)
  assert.ok(pack.units.length >= 2)
  assert.match(readFileSync(restore.manuscriptPath, 'utf8'), /GB 175/)
})

test('restoreSetupSources aligns Word/Excel and skips unsupported types', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-skip-'))
  const pdf = writeDummyPdf(cwd, 'book.pdf')
  const docx = join(cwd, 'forms.docx')
  const xlsx = join(cwd, 'schedule.xlsx')
  const zip = join(cwd, 'photos.zip')
  writeFileSync(docx, 'word')
  writeFileSync(xlsx, 'excel')
  writeFileSync(zip, 'zip')
  assert.equal(isSetupAlignablePath(docx), true)
  assert.equal(isSetupAlignablePath(xlsx), true)
  assert.equal(isSetupAlignablePath(zip), false)
  const first = await restoreSetupSource(cwd, 'p1', pdf, { ingest: fakeIngest() })
  const batch = await restoreSetupSources(cwd, 'p1', [pdf, docx, xlsx, zip], { ingest: fakeIngest('# changed\n') })
  assert.equal(batch.restored.length, 3)
  assert.equal(batch.restored[0]?.manuscriptPath, first.manuscriptPath)
  assert.match(readFileSync(first.manuscriptPath, 'utf8'), /GB 175/)
  assert.ok(batch.restored.some((item) => item.sourcePath === docx && /forms-解析稿/.test(item.packDir.replace(/\\/g, '/'))))
  assert.ok(batch.restored.some((item) => item.sourcePath === xlsx && /schedule-解析稿/.test(item.packDir.replace(/\\/g, '/'))))
  assert.equal(batch.skipped.some((item) => item.reason === 'unsupported' && item.sourcePath === zip), true)
})

test('saving the restore manuscript rebuilds pack.json units', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-save-'))
  const pdf = writeDummyPdf(cwd, 'spec.pdf')
  const restore = await restoreSetupSource(cwd, 'p1', pdf, { ingest: fakeIngest() })
  const edited = [
    '# 1.1 Cement',
    '',
    'Use CEM I 42.5N only.',
    '',
    '# 1.2 Water',
    '',
    'Mixing water shall be potable.',
    '',
  ].join('\n')
  const saved = saveWorkspaceText(cwd, restore.manuscriptPath, edited)
  assert.equal(saved.packSidecar, restore.packPath)
  const pack = JSON.parse(readFileSync(restore.packPath, 'utf8')) as {
    manuscript: string
    units: Array<{ title?: string; startOffset: number; endOffset: number }>
  }
  assert.equal(pack.manuscript, 'manuscript.md')
  assert.ok(pack.units.some((unit) => /Water/.test(String(unit.title || ''))))
  assert.ok(pack.units.every((unit) => unit.endOffset <= edited.length + 1))
  assert.match(readFileSync(restore.manuscriptPath, 'utf8'), /CEM I 42\.5N/)
})

test('saving analysis markdown stamps the paired report and leaves pack.json alone', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-report-'))
  const pdf = writeDummyPdf(cwd, 'volume.pdf')
  const restore = await restoreSetupSource(cwd, 'p1', pdf, { ingest: fakeIngest() })
  const project = createBusinessProject({
    workspaceRootPath: cwd,
    module: 'tender',
    projectId: 'p1',
    name: 'N3',
    rootPath: join(cwd, 'proj'),
    workflowId: 'tender',
    createDirectory: true,
    inputPaths: [pdf],
  })
  const analysisMd = join(cwd, 'Agent Pi Outputs', 'p1', 'document-analysis', 'volume.md')
  const reportPath = join(cwd, '.agent-pi', 'business', 'tender', 'p1', 'orchestration', 'reports', 'volume.json')
  mkdirSync(join(analysisMd, '..'), { recursive: true })
  mkdirSync(join(reportPath, '..'), { recursive: true })
  writeFileSync(analysisMd, '# old\n')
  writeFileSync(reportPath, `${JSON.stringify({
    markdown: '# old\n',
    sections: [{ id: 'materials', title: 'Materials' }],
  }, null, 2)}\n`)
  saveBoard(cwd, {
    schemaVersion: 2,
    projectId: project.projectId,
    module: 'tender',
    currentStageId: 'tender-document-analysis',
    updatedAt: new Date().toISOString(),
    stages: {
      'project-setup': {
        stageId: 'project-setup',
        status: 'done',
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: 'file-1',
          title: 'volume.pdf',
          sourcePath: pdf,
          markdownPath: restore.manuscriptPath,
          reportPath: restore.packPath,
          status: 'done',
        }],
      },
      'tender-document-analysis': {
        stageId: 'tender-document-analysis',
        status: 'idle',
        updatedAt: new Date().toISOString(),
        tasks: [{
          id: 'volume',
          title: 'volume.pdf',
          sourcePath: pdf,
          markdownPath: analysisMd,
          reportPath,
          status: 'queued',
        }],
      },
    },
  })

  const analysisSaved = saveWorkspaceText(cwd, analysisMd, '# revised analysis\n\nUser edit.\n')
  assert.equal(analysisSaved.reportSidecar, reportPath)
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
    markdown: string
    markdownHash: string
    staleStructured: boolean
    sections: unknown[]
  }
  assert.match(report.markdown, /User edit/)
  assert.equal(report.staleStructured, true)
  assert.equal(report.sections.length, 1)
  assert.equal(typeof report.markdownHash, 'string')

  const packBefore = readFileSync(restore.packPath, 'utf8')
  const stamped = syncOrchestrationReportFromMarkdown(cwd, restore.manuscriptPath, readFileSync(restore.manuscriptPath, 'utf8'))
  assert.equal(stamped, null)
  const pack = JSON.parse(readFileSync(restore.packPath, 'utf8')) as { manuscript: string }
  assert.equal(pack.manuscript, 'manuscript.md')
  assert.equal(readFileSync(restore.packPath, 'utf8'), packBefore)
})

test('completeSetup hands the restored manuscript to the analysis brief', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-brief-'))
  const pdf = writeDummyPdf(cwd, 'Book 2 of Volume 3.pdf')
  const restore = await restoreSetupSource(cwd, 'p1', pdf, { ingest: fakeIngest() })
  const project = createBusinessProject({
    workspaceRootPath: cwd,
    module: 'tender',
    projectId: 'p1',
    name: 'N3',
    rootPath: join(cwd, 'proj'),
    workflowId: 'tender',
    createDirectory: true,
    inputPaths: [pdf],
  })
  const result = completeSetup(cwd, project)
  assert.equal(result.blocked, undefined)
  assert.equal(result.nextStageId, 'tender-document-analysis')
  const analysis = result.board.stages['tender-document-analysis']
  assert.ok(analysis)
  const task = analysis.tasks[0]
  assert.ok(task?.briefPath)
  const brief = JSON.parse(readFileSync(task.briefPath, 'utf8')) as {
    sourcePath: string
    originalSourcePath: string
    restoredManuscript: string
    packPath: string
  }
  assert.equal(brief.restoredManuscript, restore.manuscriptPath)
  assert.equal(brief.packPath, restore.packPath)
  assert.equal(brief.sourcePath, restore.manuscriptPath)
  assert.equal(brief.originalSourcePath, pdf)
})

test('a late restore rewrites already-issued analysis briefs', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-setup-late-'))
  const pdf = writeDummyPdf(cwd, 'Book 3 of Volume 3.pdf')
  const project = createBusinessProject({
    workspaceRootPath: cwd,
    module: 'tender',
    projectId: 'p1',
    name: 'N3',
    rootPath: join(cwd, 'proj'),
    workflowId: 'tender',
    createDirectory: true,
    inputPaths: [pdf],
  })
  const first = completeSetup(cwd, project)
  const briefPath = first.board.stages['tender-document-analysis']?.tasks[0]?.briefPath
  assert.ok(briefPath)
  const before = JSON.parse(readFileSync(briefPath, 'utf8')) as { sourcePath: string; restoredManuscript?: string }
  assert.equal(before.sourcePath, pdf)
  assert.equal(before.restoredManuscript, undefined)
  const restore = await restoreSetupSource(cwd, 'p1', pdf, { ingest: fakeIngest() })
  refreshSourceBriefsAfterRestore(cwd, project)
  const after = JSON.parse(readFileSync(briefPath, 'utf8')) as {
    sourcePath: string
    originalSourcePath: string
    restoredManuscript: string
    packPath: string
  }
  assert.equal(after.sourcePath, restore.manuscriptPath)
  assert.equal(after.originalSourcePath, pdf)
  assert.equal(after.restoredManuscript, restore.manuscriptPath)
  assert.equal(after.packPath, restore.packPath)
})
