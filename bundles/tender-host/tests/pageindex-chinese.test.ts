import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPageIndexTree, searchPageIndexShadow, type PageIndexShadowTree } from '../src/pageindex-shadow.ts'

test('Chinese natural-language questions match short Chinese headings', () => {
  const markdown = '# 招标文件\n## 投标保函\n投标保函有效期应超过投标有效期二十八天。\n## 付款条件\n按月支付。\n'
  const tree: PageIndexShadowTree = {
    schemaVersion: 1,
    kind: 'agent-pi-pageindex-shadow',
    mode: 'shadow',
    source: { id: 'cn', manuscript: 'cn.md', sourceHash: '0'.repeat(64) },
    parser: { name: 'agent-pi-pageindex-md', version: 'test', upstreamRepository: '', upstreamCommit: '', upstreamLicense: 'MIT' },
    model: null,
    generatedAt: '',
    lineCount: 5,
    nodes: buildPageIndexTree(markdown),
  }
  assert.equal(searchPageIndexShadow(tree, '这个项目的保函要求和有效期是什么？', 1)[0]?.title, '投标保函')
})
