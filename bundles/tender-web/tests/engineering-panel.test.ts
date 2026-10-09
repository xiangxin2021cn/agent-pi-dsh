import assert from 'node:assert/strict'
import test from 'node:test'
import { createEngineeringPanel, latestEngineeringRuns } from '../src/client/engineering-panel.js'

const nodes = (tree: any): any[] => typeof tree !== 'object' || !tree ? [] : [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)]
const text = (tree: any): string => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : (tree?.children || []).flat(Infinity).map(text).join(' ')
function fixture(status = 'visual_ready', legacy = false) {
  const opened: unknown[] = [], source = { sha256: 'a'.repeat(64), derivedSha256: 'b'.repeat(64) }
  const embedded = { sourceRecordId: 'source-record:1', handle: 'F1', status, imagePath: status === 'visual_ready' ? 'C:/project/preview.png' : undefined, reason: status === 'raw_only' ? '未能解码，原始内容已保留' : undefined, placements: { items: [{}], total: 3, nextOffset: 1 } }
  const run = { id: 'read', providerId: 'reader.cad', providerVersion: '3.8.2', title: 'CAD 图纸读取', recordKind: 'observation', input: { action: 'embedded:source-record:1' }, dependencies: [{ kind: 'source', id: 'drawing' }], createdAt: '2026-10-09T00:00:00Z', providerAvailable: true, output: { summary: '内嵌内容待视觉复核', issues: [{ message: '3DSOLID 57→0，导出缺口待复核' }], details: { inventory: [], observedIds: [], details: { source, storage: { mode: 'disk' }, conversion: { bundledModelQuality: { valid: true } }, inventory: { expansionComplete: false }, embedded: { items: [embedded] } } } } }
  const state = { project: { id: 'session:main', objects: [], sources: [], quantities: [], ruleAdoptions: [], coverage: [] }, runs: [run], providers: [] }
  if (legacy) run.output.details.details = { professionalReview: 'pending' } as any
  let hook = 0
  const React = { Fragment: 'fragment', createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }), useState: (value: unknown) => [hook++ === 0 ? state : value, () => {}], useEffect() {} }
  const Panel = createEngineeringPanel({ React, api() {}, language: () => 'zh', onOpenFile: (path: string, cwd: string) => opened.push({ path, cwd }) })
  return { state, run, opened, tree: Panel({ sessionId: 'main', cwd: 'C:/project' }) }
}

test('CAD panel shows source lineage, verified relations, unresolved export/expansion and a working image preview entry', () => {
  const f = fixture(), rendered = text(f.tree)
  assert.match(rendered, /aaaaaaaaaaaaaaaa/); assert.match(rendered, /bbbbbbbbbbbbbbbb/)
  assert.match(rendered, /原始内嵌内容保留/); assert.match(rendered, /块与图层引用校核：通过/)
  assert.match(rendered, /实例尚未全部展开/); assert.match(rendered, /3DSOLID 57→0/)
  assert.match(rendered, /内容待视觉复核/); assert.match(rendered, /1 \/ 3；仍有下一页/)
  const button = nodes(f.tree).find(node => node.type === 'button' && text(node) === '查看内嵌图像')
  assert.ok(button); button.props.onClick()
  assert.deepEqual(f.opened, [{ path: 'C:/project/preview.png', cwd: 'C:/project' }])
})

test('opaque embedded objects show the retained-content gap without offering a nonexistent image', () => {
  const f = fixture('raw_only')
  assert.match(text(f.tree), /原始内容已保留，图像不可用/); assert.match(text(f.tree), /未能解码/)
  assert.equal(nodes(f.tree).some(node => node.type === 'button' && text(node) === '查看内嵌图像'), false)
})

test('latest panel reads preserve inventory and separate embedded objects without a card per page', () => {
  const { run } = fixture()
  const reads = ['inventory', 'embedded:source-record:1', 'embedded:source-record:2', 'query', 'query'].map((action, index) => ({ ...run, id: String(index), input: { action } }))
  assert.deepEqual(latestEngineeringRuns(reads).map(row => row.id), ['0', '1', '2', '4'])
})

test('older minimal CAD observations remain visible without requiring newly added detail fields', () => {
  const f = fixture('visual_ready', true)
  assert.match(text(f.tree), /CAD 图纸读取/)
  assert.match(text(f.tree), /3DSOLID 57→0/)
  assert.equal(nodes(f.tree).some(node => node.type === 'button' && text(node) === '查看内嵌图像'), false)
})
