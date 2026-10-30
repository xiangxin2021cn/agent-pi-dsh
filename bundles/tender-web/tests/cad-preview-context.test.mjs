import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveCadPreviewContext } from '../src/client/cad-preview-context.js'

const active = { cwd: 'C:\\Projects\\Office', sessionId: 'office' }
const workspaces = { items: [{ path: 'C:\\Projects\\Tender', sessionIds: ['old', 'tender'] }], archivedSessionIds: ['old'] }
const sessions = { byId: { office: { cwd: active.cwd }, old: { cwd: 'C:\\Projects\\Tender' }, tender: { cwd: 'C:\\Projects\\Tender' } } }

test('workbench drawing links retain their registered source workspace and existing live session', () => {
  assert.deepEqual(resolveCadPreviewContext({ cwd: 'c:/projects/tender/', path: 'C:\\Projects\\Tender\\总图.DWG' }, active, workspaces, sessions), {
    cwd: 'C:\\Projects\\Tender', sessionId: 'tender', readOnly: false,
  })
})

test('conversation source links validate the source session membership and cwd', () => {
  const source = { cwd: 'C:\\Projects\\Tender', path: 'drawing.dxf', sessionId: 'tender' }
  assert.equal(resolveCadPreviewContext(source, active, workspaces, sessions).sessionId, 'tender')
  assert.equal(resolveCadPreviewContext({ ...source, sessionId: 'office' }, active, workspaces, sessions), null)
  assert.equal(resolveCadPreviewContext(source, active, workspaces, { byId: { tender: { cwd: active.cwd } } }), null)
})

test('unregistered directories, sibling roots and parent/subfolder approximations are refused', () => {
  for (const cwd of ['C:\\Secret', 'C:\\Projects', 'C:\\Projects\\Tender2', 'C:\\Projects\\Tender\\sub', 'C:\\Projects\\Tender\\..\\Office']) {
    assert.equal(resolveCadPreviewContext({ cwd, path: cwd + '\\plan.dwg' }, active, workspaces, sessions), null)
  }
})

test('a registered source with no live matching session remains read only without creating or borrowing one', () => {
  assert.deepEqual(resolveCadPreviewContext({ cwd: 'C:\\Projects\\Tender', path: 'plan.dwg' }, active, workspaces, { byId: {} }), {
    cwd: 'C:\\Projects\\Tender', sessionId: '', readOnly: true,
  })
  assert.equal(resolveCadPreviewContext({ cwd: 'C:\\Projects\\Tender', path: 'plan.dwg', sessionId: 'old' }, active, workspaces, sessions), null)
})

test('same-project drawing links keep the active conversation without changing other preview formats', () => {
  for (const detail of [{ path: 'plan.dwg' }, { cwd: 'c:/projects/office/', path: 'plan.dxf' }]) {
    assert.deepEqual(resolveCadPreviewContext(detail, active, workspaces, sessions), { ...active, readOnly: false })
  }
  assert.equal(resolveCadPreviewContext({ cwd: 'C:\\Projects\\Tender', path: 'report.docx' }, active, workspaces, sessions), undefined)
})

test('Linux workspace paths remain case sensitive', () => {
  assert.equal(resolveCadPreviewContext({ cwd: '/work/tender', path: 'a.dwg' }, { cwd: '/work/office', sessionId: 'office' }, { items: [{ path: '/work/Tender', sessionIds: [] }] }, { byId: {} }), null)
})
