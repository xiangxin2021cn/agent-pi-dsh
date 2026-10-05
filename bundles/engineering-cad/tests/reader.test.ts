import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cadFixture } from '../../../packages/engineering-cad/tests/fixture.ts'
import { executeCadRead, readCadDrawing, scopedCadPath } from '../src/reader.ts'
import { registerCad } from '../src/plugin.ts'

function workspace() {
  const directory = mkdtempSync(join(tmpdir(), 'engineering-cad-')), root = join(directory, 'workspace')
  mkdirSync(root); writeFileSync(join(root, 'drawing.dxf'), cadFixture())
  return { directory, root, cleanup: () => rmSync(directory, { recursive: true, force: true }) }
}

test('file reader returns real file hash, complete inventory, missing XREF and version-locked pages', async () => {
  const w = workspace()
  try {
    const drawing = await readCadDrawing(w.root, 'drawing.dxf')
    assert.equal(drawing.references[0].status, 'missing')
    const result = await executeCadRead({ action: 'query', path: 'drawing.dxf', sourceHash: drawing.source.sha256, query: { limit: 1 } }, w.root)
    if (!('page' in result)) throw new Error('query page missing')
    assert.equal(result.page.items.length, 1); assert.ok(result.page.total > 1)
    assert.equal(result.observation.inventory.length, 3)
    assert.equal(result.observation.kind, 'cad')
    writeFileSync(join(w.root, 'drawing.dxf'), cadFixture().toString().replace('600', '650'))
    await assert.rejects(readCadDrawing(w.root, 'drawing.dxf', { sourceHash: drawing.source.sha256 }), /版本已变化/)
  } finally { w.cleanup() }
})

test('workspace check refuses traversal and symlink escapes for both reading and DWG conversion output', async () => {
  const w = workspace(), outside = join(w.directory, 'outside')
  try {
    mkdirSync(outside); writeFileSync(join(outside, 'drawing.dxf'), cadFixture())
    assert.throws(() => scopedCadPath(w.root, '../outside/drawing.dxf'), /工作目录内/)
    symlinkSync(outside, join(w.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => scopedCadPath(w.root, 'linked/drawing.dxf'), /符号链接/)
    symlinkSync(outside, join(w.root, '.agent-pi'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(() => scopedCadPath(w.root, '.agent-pi/cad-converted', false), /符号链接/)
    writeFileSync(join(w.root, 'drawing.dwg'), 'AC1032 fake test DWG')
    let called = false
    await assert.rejects(readCadDrawing(w.root, 'drawing.dwg', { convert: async () => { called = true; throw new Error('must not execute') } }), /符号链接/)
    assert.equal(called, false)
  } finally { w.cleanup() }
})

test('real tool uses execution session cwd, registers professional capability, and records structural observation', async () => {
  const w = workspace(), tools: any[] = [], observed: any[] = [], capabilities: any[] = []
  try {
    const ctx = { tools: { register: (tool: any) => tools.push(tool) }, systemPrompt: { section() {} },
      get: () => ({ recordObservation: (id: string, data: unknown) => observed.push({ id, data }) }),
      inject: (_keys: string[], callback: (scope: any) => void) => callback({ effect: (fn: () => unknown) => fn(), professionalCapabilities: { register: (capability: any) => capabilities.push(capability) } }),
    }
    registerCad(ctx, value => value)
    assert.equal(tools[0].name, 'cad_read'); assert.equal(capabilities[0].tools[0], 'cad_read')
    const result = await tools[0].execute({ action: 'inventory', path: 'drawing.dxf' }, { agent: { session: { id: 'session-a', header: { cwd: w.root } } } })
    assert.equal(result.synchronization.status, 'recorded')
    assert.equal(observed[0].id, 'session-a'); assert.equal(observed[0].data.kind, 'cad')
    assert.ok(observed[0].data.inventory.every((row: any) => row.reason))
    assert.equal('observation' in result, false)
    await assert.rejects(tools[0].execute({ action: 'inventory', path: 'drawing.dxf' }, { agent: { session: { header: {} } } }), /实际会话/)
  } finally { w.cleanup() }
})

test('host synchronization failure does not masquerade as successful task registration', async () => {
  const w = workspace(), tools: any[] = []
  try {
    registerCad({ tools: { register: (t: any) => tools.push(t) }, systemPrompt: { section() {} }, get: () => ({ recordObservation() { throw new Error('revision conflict') } }) }, v => v)
    const result = await tools[0].execute({ action: 'inventory', path: 'drawing.dxf' }, { agent: { session: { id: 's', header: { cwd: w.root } } } })
    assert.equal(result.synchronization.status, 'failed'); assert.match(result.synchronization.message, /revision conflict/)
    assert.equal(result.inventory.records, 10)
  } finally { w.cleanup() }
})
