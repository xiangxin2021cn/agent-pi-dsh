import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import {
  isUniverOfficePath,
  openUniverOfficePreview,
  pickUniverOfficeViewerUrl,
  resolveUniverOfficeService,
  univerOfficePreviewKind,
  univerPreviewSidecarPath,
} from '../src/univer-office-open.ts'

test('official import covers sheet, word, and slides', () => {
  assert.equal(isUniverOfficePath('a.xlsx'), true)
  assert.equal(isUniverOfficePath('a.docx'), true)
  assert.equal(isUniverOfficePath('a.pptx'), true)
  assert.equal(isUniverOfficePath('a.doc'), false)
  assert.equal(isUniverOfficePath('a.ppt'), false)
  assert.equal(univerOfficePreviewKind('a.xlsx'), 'spreadsheet')
  assert.equal(univerOfficePreviewKind('a.docx'), 'word')
  assert.equal(univerOfficePreviewKind('a.pptx'), 'slides')
})

test('picks draft worktree URL before trunk viewer', () => {
  assert.equal(pickUniverOfficeViewerUrl({
    viewerUrl: 'http://127.0.0.1:9080/?file=trunk',
    worktrees: [{
      status: 'draft',
      worktreeUrl: 'http://127.0.0.1:9080/?file=draft&mode=embedded',
      units: [{ unitId: 'u1' }],
    }],
  }), 'http://127.0.0.1:9080/?file=draft&mode=embedded')
})

test('missing official service returns null', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-uv-none-'))
  const path = join(cwd, 'a.xlsx')
  writeFileSync(path, 'x')
  assert.equal(await openUniverOfficePreview(null, cwd, path), null)
  assert.equal(await resolveUniverOfficeService(undefined, 1, 1), null)
})

test('opens an existing .univer through fileState only', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-uv-file-'))
  const path = join(cwd, 'book.univer')
  writeFileSync(path, 'container')
  const calls: string[] = []
  const opened = await openUniverOfficePreview({
    fileState: async (request) => {
      calls.push('state:' + request.file)
      return { viewerUrl: 'http://127.0.0.1:9080/?file=book' }
    },
  }, cwd, path)
  assert.equal(opened?.viewerUrl, 'http://127.0.0.1:9080/?file=book')
  assert.equal(opened?.file, path)
  assert.deepEqual(calls, ['state:' + path])
})

test('imports xlsx into a hidden sidecar then returns the draft viewer', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-uv-xlsx-'))
  const path = join(cwd, '施工资源.xlsx')
  writeFileSync(path, 'xlsx')
  const sidecar = univerPreviewSidecarPath(cwd, path)
  const calls: string[] = []
  let units: unknown[] = []
  const opened = await openUniverOfficePreview({
    newFile: async (request) => {
      calls.push('new')
      writeFileSync(request.file, 'sidecar')
    },
    worktree: async () => {
      calls.push('worktree')
      return { result: { worktreeId: 'wt-1' } }
    },
    importUnitContent: async (request) => {
      calls.push('import:' + request.source + ':' + request.worktreeId)
      units = [{ unitId: 'sheet-1' }]
    },
    fileState: async () => ({
      viewerUrl: 'http://127.0.0.1:9080/?file=sidecar',
      worktrees: units.length
        ? [{ status: 'draft', worktreeId: 'wt-1', worktreeUrl: 'http://127.0.0.1:9080/?file=sidecar&worktree=wt-1&mode=embedded', units }]
        : [],
    }),
  }, cwd, path)
  assert.ok(opened)
  assert.equal(opened.viewerUrl, 'http://127.0.0.1:9080/?file=sidecar&worktree=wt-1&mode=embedded')
  assert.ok(opened.file.endsWith('.univer'))
  assert.ok(opened.file.includes('.agent-pi'))
  assert.ok(existsSync(opened.file))
  assert.ok(existsSync(opened.file + '.stamp'))
  assert.equal(calls[0], 'new')
  assert.equal(calls[1], 'worktree')
  assert.match(calls[2], /^import:.+:wt-1$/)
  assert.ok(sidecar.includes('univer-preview'))
})

test('reuses a stamped sidecar without importing again', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-uv-reuse-'))
  const path = join(cwd, 'a.xlsx')
  writeFileSync(path, 'xlsx')
  const workspace = realpathSync(cwd)
  const source = realpathSync(path)
  const sidecar = univerPreviewSidecarPath(workspace, source)
  mkdirSync(dirname(sidecar), { recursive: true })
  writeFileSync(sidecar, 'sidecar')
  writeFileSync(sidecar + '.stamp', `${statSync(source).size}:${Math.trunc(statSync(source).mtimeMs)}`)
  const calls: string[] = []
  const opened = await openUniverOfficePreview({
    newFile: async () => { calls.push('new') },
    worktree: async () => { calls.push('worktree'); return { result: { worktreeId: 'wt-2' } } },
    importUnitContent: async () => { calls.push('import') },
    fileState: async () => ({
      viewerUrl: 'http://127.0.0.1:9080/?file=old',
      worktrees: [{
        status: 'draft',
        worktreeId: 'wt-1',
        worktreeUrl: 'http://127.0.0.1:9080/?file=old&worktree=wt-1&mode=embedded',
        units: [{ unitId: 'u1' }],
      }],
    }),
  }, cwd, path)
  assert.equal(opened?.viewerUrl, 'http://127.0.0.1:9080/?file=old&worktree=wt-1&mode=embedded')
  assert.deepEqual(calls, [])
})

test('imports docx and pptx through the same sidecar path', async () => {
  for (const name of ['说明.docx', '汇报.pptx']) {
    const cwd = mkdtempSync(join(tmpdir(), 'ap-uv-office-'))
    const path = join(cwd, name)
    writeFileSync(path, name)
    const calls: string[] = []
    let units: unknown[] = []
    const opened = await openUniverOfficePreview({
      newFile: async (request) => {
        calls.push('new')
        writeFileSync(request.file, 'sidecar')
      },
      worktree: async () => {
        calls.push('worktree')
        return { result: { worktreeId: 'wt-doc' } }
      },
      importUnitContent: async (request) => {
        calls.push(request.name)
        units = [{ unitId: 'u1' }]
      },
      fileState: async () => ({
        viewerUrl: 'http://127.0.0.1:9080/?file=sidecar',
        worktrees: units.length
          ? [{ status: 'draft', worktreeId: 'wt-doc', worktreeUrl: 'http://127.0.0.1:9080/?file=sidecar&worktree=wt-doc&mode=embedded', units }]
          : [],
      }),
    }, cwd, path)
    assert.ok(opened?.viewerUrl.includes('mode=embedded'))
    assert.deepEqual(calls, ['new', 'worktree', name.replace(/\.(docx|pptx)$/i, '')])
  }
})
