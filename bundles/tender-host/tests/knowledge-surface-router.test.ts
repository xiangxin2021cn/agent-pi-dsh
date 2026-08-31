import assert from 'node:assert/strict'
import { test } from 'node:test'
import { routeKnowledgeSurfaces } from '../src/knowledge-surface-router.ts'

test('routes exact BOQ questions to table and never permits document-summary calculation fallback', () => {
  const route = routeKnowledgeSurfaces({
    question: 'BOQ Sheet C2 中第 18 行的 quantity、unit 和 formula 是什么？',
    available: { table: false, document: true },
  })
  assert.deepEqual(route.surfaces, [])
  assert.equal(route.blocked[0]?.surface, 'table')
  assert.match(route.prohibitions.join(' '), /不得使用文档摘要推算 BOQ/)
})

test('routes clause lookup to exact-clause-first document path', () => {
  const route = routeKnowledgeSurfaces({ question: 'Clause A1.2.3.4 对 rainfall 有什么要求？' })
  assert.equal(route.exactClauseFirst, true)
  assert.deepEqual(route.surfaces, ['document'])
})

test('returns a combined route for addendum effects on pricing rows', () => {
  const route = routeKnowledgeSurfaces({ question: 'Addendum 3 supersedes 哪个版本，并影响哪些 BOQ quantity？' })
  assert.deepEqual(new Set(route.surfaces), new Set(['table', 'graph']))
  assert.match(route.reason.join(' '), /跨知识面/)
})
