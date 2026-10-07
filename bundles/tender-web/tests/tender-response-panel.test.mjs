import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderTenderResponseCoverage } from '../src/client/tender-response-panel.js'

const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) })
const text = node => node == null || node === false ? '' : typeof node !== 'object' ? String(node) : node.children.map(text).join('')
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(nodes)]
const fixture = () => ({
  projectId: 'municipal', revision: 4, sourceCoverage: { complete: null, gaps: ['尚未确认补遗齐全'] },
  summary: { requirements: 1, criteria: 1, planned: 1, drafted: 1, evidenced: 0, reviewed: 0, stale: 1, blocked: 0 },
  rows: [{ id: 'criterion-traffic', kind: 'criterion', title: '交通导改针对性 <script>alert(1)</script>', mandatory: false, method: 'weighted', weight: 10,
    source: { title: '评标办法', path: 'tender.pdf', locator: 'page 8' }, status: 'stale', gaps: ['补遗已变更，需复核当前方案'],
    responses: [{ id: 'chapter-traffic', title: '交通导改方案', section: '第三章', path: 'technical.docx', status: 'stale', generationMode: 'generate',
      evidence: [{ title: '施工区域图', path: 'drawing.pdf', locator: 'page 2', status: 'needs_review', reason: '图纸版本已变化' }],
      checks: [{ kind: 'artifact', status: 'passed', message: '当前文件存在' }, { kind: 'source', status: 'review', message: '当前来源待复核' }],
    }],
  }],
})

test('response panel preserves separate source, evidence and current-draft states', () => {
  const value = fixture(), before = JSON.stringify(value), opened = []
  const tree = renderTenderResponseCoverage(h, value, { onOpenFile: (path, locator) => opened.push({ path, locator }) })
  const output = text(tree)
  assert.match(output, /响应计划 1/)
  assert.match(output, /已有成稿 1/)
  assert.match(output, /依据登记就绪 0/)
  assert.match(output, /当前稿已记录复核 0/)
  assert.match(output, /资料完整性尚未确认/)
  assert.match(output, /尚未确认补遗齐全/)
  assert.match(output, /补遗已变更/)
  assert.match(output, /当前文件存在/)
  assert.equal(nodes(tree).filter(node => node.props.dangerouslySetInnerHTML).length, 0)
  for (const label of ['评标办法', '查看当前成果', '施工区域图']) nodes(tree).find(node => node.type === 'button' && text(node) === label).props.onClick()
  assert.deepEqual(opened, [{ path: 'tender.pdf', locator: 'page 8' }, { path: 'technical.docx', locator: undefined }, { path: 'drawing.pdf', locator: 'page 2' }])
  assert.equal(JSON.stringify(value), before)
})

test('compact coverage only shows a bounded set of gaps and opens task without side effects', () => {
  const value = fixture(), visited = []
  value.rows.push(...[2, 3, 4].map(index => ({ ...value.rows[0], id: 'criterion-' + index, title: '待处理' + index })))
  const tree = renderTenderResponseCoverage(h, value, { compact: true, onOpenTask: () => visited.push('task') })
  assert.equal(nodes(tree).filter(node => node.type === 'table').length, 0)
  assert.match(text(tree), /另有 2 项待处理/)
  assert.doesNotMatch(text(tree), /待处理3|待处理4/)
  nodes(tree).find(node => node.type === 'button').props.onClick()
  assert.deepEqual(visited, ['task'])
})

test('old projects without response plans and empty projects never imply full coverage', () => {
  const value = fixture()
  value.rows[0].responses = []; value.rows[0].status = 'unplanned'
  assert.match(text(renderTenderResponseCoverage(h, value)), /尚无响应计划/)
  const empty = renderTenderResponseCoverage(h, { projectId: 'empty', revision: 1, rows: [], summary: {}, sourceCoverage: { complete: null, gaps: [] } })
  assert.match(text(empty), /尚未登记项目要求/)
  assert.doesNotMatch(text(empty), /100%|全部完成/)
  assert.equal(renderTenderResponseCoverage(h, null), null)
  const failed = renderTenderResponseCoverage(h, { projectId: 'broken', error: 'Response ledger is invalid' })
  assert.match(text(failed), /Response ledger is invalid/)
  assert.equal(nodes(failed).filter(node => node.props.role === 'alert').length, 1)
  assert.doesNotMatch(text(failed), /尚未登记项目要求/)
  assert.match(text(renderTenderResponseCoverage(h, value, { locale: 'en' })), /Source completeness is unconfirmed/)
})
