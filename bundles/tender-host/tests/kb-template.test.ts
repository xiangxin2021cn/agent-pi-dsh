import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbContent, formatSelectedKbContext, setKbTaskSlugs } from '../src/kb.ts'
import {
  isUserTemplateCategory,
  KB_USER_TEMPLATE_CATEGORY,
  looksLikeUserTemplateName,
  resolveKbCategory,
} from '../src/kb-template.ts'

const SAMPLE = `# 1 工程概况

本工程概况写清工程范围、工期与主要工程量，不少于两段。

# 2 施工部署

写组织机构、总体顺序与资源计划。
`

function withKbRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-template-'))
  process.env.AGENT_PI_KB_ROOT = root
  return root
}

test('looksLikeUserTemplateName matches suffix 模板 / template, not 模板工程', () => {
  assert.equal(looksLikeUserTemplateName('施工组织设计模板.docx'), true)
  assert.equal(looksLikeUserTemplateName('用户模版-投标函.md'), true)
  assert.equal(looksLikeUserTemplateName('method-statement-template.pdf'), true)
  assert.equal(looksLikeUserTemplateName('C:\\docs\\施工方案模板.pdf'), true)
  assert.equal(looksLikeUserTemplateName('模板工程技术规范.pdf'), false)
  assert.equal(looksLikeUserTemplateName('规范.pdf'), false)
  assert.equal(looksLikeUserTemplateName('COTO Chapter 1.pdf'), false)
})

test('resolveKbCategory canonicalizes 用户模版 and infers from the file name', () => {
  assert.equal(isUserTemplateCategory('用户模版'), true)
  assert.equal(resolveKbCategory('用户模版'), KB_USER_TEMPLATE_CATEGORY)
  assert.equal(resolveKbCategory(undefined, '施工方案模板.md'), KB_USER_TEMPLATE_CATEGORY)
  assert.equal(resolveKbCategory('未分类', '施工方案模板.md'), KB_USER_TEMPLATE_CATEGORY)
  assert.equal(resolveKbCategory('规范', '施工方案模板.md'), '规范')
  assert.equal(resolveKbCategory(undefined, '规范.pdf'), '未分类')
})

test('addKbContent stores 用户模板 and selected context requires cloning form', () => {
  const root = withKbRoot()
  try {
    const added = addKbContent({
      fileName: '施工组织设计模板.md',
      text: SAMPLE,
      name: '施工组织设计模板',
      category: '用户模版',
      slug: 'user-toc-template',
    })
    assert.equal(added.entry.category, KB_USER_TEMPLATE_CATEGORY)
    setKbTaskSlugs('sess-tpl', ['user-toc-template'])
    const text = formatSelectedKbContext('sess-tpl')
    assert.match(text, /用户模板/)
    assert.match(text, /kb-user-template/)
    assert.match(text, /clone their format/)
    assert.match(text, /user-toc-template/)
    assert.match(text, /Do not copy names/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('file name ending in 模板 infers 用户模板; explicit 规范 is kept', () => {
  const root = withKbRoot()
  try {
    const inferred = addKbContent({
      fileName: '施工方案模板.md',
      text: SAMPLE,
      name: '施工方案模板',
      slug: 'inferred-tpl',
    })
    assert.equal(inferred.entry.category, KB_USER_TEMPLATE_CATEGORY)
    const kept = addKbContent({
      fileName: '施工方案模板-误名.md',
      text: `${SAMPLE}\n\n# 3 附录\n\n本项目附录单独成篇。\n`,
      name: '施工方案模板',
      category: '规范',
      slug: 'named-spec',
    })
    assert.equal(inferred.entry.slug, 'inferred-tpl')
    assert.equal(kept.entry.slug, 'named-spec')
    assert.equal(kept.entry.category, '规范')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('selecting only 规范 does not inject the clone-form instruction', () => {
  const root = withKbRoot()
  try {
    addKbContent({
      fileName: 'coto.md',
      text: SAMPLE,
      name: 'COTO excerpt',
      category: '规范',
      slug: 'coto-only',
    })
    setKbTaskSlugs('sess-spec', ['coto-only'])
    const text = formatSelectedKbContext('sess-spec')
    assert.match(text, /\[规范\]/)
    assert.doesNotMatch(text, /kb-user-template/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
