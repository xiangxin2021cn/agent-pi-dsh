import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KB_CHAT_IMPORT_SAY, MODULE_CREATE_PROMPTS, archiveSessionRows, archivedWorkspaceGroups, groupArchiveRows, groupKbEntries, kbCategoryHint, kbCategoryLabel, kbChatImportCopy, kbFidelityLabel, kbIngestKind, kbIngestLabel, kbLandingCardVisible, looksLikeKbPackName, looksLikeKbTransferName, looksLikeUserTemplateName, mergeKbEntries, moduleCreateCopy, normalizePickedPaths, resolveWorkspaceByTitle, restoreOpenPath, sortKbCategories, uniqueIds, visibleArchivedSessionIds, workspaceActionTitle } from '../lib/pick-paths.js'
import { clientSource } from './client-source.ts'

test('normalizePickedPaths keeps a real path list', () => {
  assert.deepEqual(
    normalizePickedPaths(['C:\\docs\\规范.pdf', 'D:/a.md']),
    ['C:\\docs\\规范.pdf', 'D:/a.md'],
  )
})

test('normalizePickedPaths unwraps Electron dialog payloads', () => {
  assert.deepEqual(
    normalizePickedPaths({ canceled: false, filePaths: ['C:\\docs\\a.pdf'] }),
    ['C:\\docs\\a.pdf'],
  )
  assert.deepEqual(normalizePickedPaths('C:\\docs\\a.pdf'), ['C:\\docs\\a.pdf'])
})

test('normalizePickedPaths treats cancel or unknown payloads as empty', () => {
  assert.deepEqual(normalizePickedPaths({ canceled: true, filePaths: [] }), [])
  assert.deepEqual(normalizePickedPaths({}), [])
  assert.deepEqual(normalizePickedPaths(null), [])
})

test('mergeKbEntries keeps local placeholders until the server row arrives', () => {
  const merged = mergeKbEntries(
    [{ slug: 'ready-1', name: '旧规范.md', parseStatus: 'ready' }],
    [{ slug: 'local:新规范.pdf', name: '新规范.pdf', parseStatus: 'staged' }],
  )
  assert.equal(merged.some((entry) => entry.slug === 'local:新规范.pdf'), true)
  assert.equal(merged.some((entry) => entry.slug === 'ready-1'), true)
})

test('kbLandingCardVisible hides once the same file is ready or staged', () => {
  const label = '本次选择：CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf'
  assert.equal(kbLandingCardVisible(label, []), true)
  assert.equal(kbLandingCardVisible(label, [{
    name: 'CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf',
    parseStatus: 'ready',
  }]), false)
  assert.equal(kbLandingCardVisible(label, [{
    name: 'CHAPTER 1-GENERAL - DS VERSION OCT 2020.pdf',
    parseStatus: 'staged',
  }]), false)
})

test('kbFidelityLabel shows clause count and coverage, not raw windows', () => {
  assert.equal(kbFidelityLabel({ chunkCount: 154 }), '154 块')
  assert.equal(kbFidelityLabel({ chunkCount: 258, clauseCount: 240, coverage: 0.971 }), '条款 240 · 覆盖 97%')
  assert.equal(kbFidelityLabel({ chunkCount: 12, clauseCount: 12, coverage: 1 }), '条款 12 · 覆盖 100%')
  assert.equal(kbFidelityLabel({ chunkCount: 20, clauseCount: 18, tableCount: 12, coverage: 0.97 }), '条款 18 · 表 12 · 覆盖 97%')
  assert.equal(kbFidelityLabel({ chunkCount: 154 }, 'en'), '154 chunks')
  assert.equal(kbFidelityLabel({ chunkCount: 20, clauseCount: 18, tableCount: 12, coverage: 0.97 }, 'en'), 'Clauses 18 · tables 12 · coverage 97%')
})

test('kbIngestLabel distinguishes MinerU markdown from local PDF text', () => {
  assert.equal(kbIngestKind({ ingest: 'direct', originalName: 'a.pdf' }), 'local')
  assert.equal(kbIngestLabel({ ingest: 'mineru', name: 'a.pdf' }), 'MinerU 解析稿')
  assert.equal(kbIngestLabel({ ingest: 'direct', originalName: 'a.pdf' }), '本机文本层')
  assert.equal(kbIngestLabel({ ingest: 'direct', name: 'note.md' }), '原文入库')
  assert.equal(kbIngestLabel({ ingest: 'pack', name: 'manuscript.md' }), '知识包')
  assert.equal(kbIngestLabel({ ingest: 'mineru', name: 'a.pdf' }, 'en'), 'MinerU manuscript')
  assert.equal(kbIngestLabel({ ingest: 'direct', originalName: 'a.pdf' }, 'en'), 'Local text layer')
  assert.equal(kbIngestLabel({ ingest: 'pack', name: 'manuscript.md' }, 'en'), 'Knowledge pack')
})

test('looksLikeKbPackName only accepts pack files or pack-named folders', () => {
  assert.equal(looksLikeKbPackName({ name: 'pack.json', type: 'file' }), true)
  assert.equal(looksLikeKbPackName({ name: 'manuscript.md', type: 'file' }), true)
  assert.equal(looksLikeKbPackName({ name: 'COTO-知识包', type: 'directory' }), true)
  assert.equal(looksLikeKbPackName({ name: 'spec-kb-pack', type: 'directory' }), true)
  assert.equal(looksLikeKbPackName({ name: '图纸', type: 'directory' }), false)
  assert.equal(looksLikeKbPackName({ name: '规范.pdf', type: 'file' }), false)
})

test('looksLikeUserTemplateName matches a writing template file, not a random spec', () => {
  assert.equal(looksLikeUserTemplateName('施工组织设计模板.docx'), true)
  assert.equal(looksLikeUserTemplateName('用户模版-投标函.md'), true)
  assert.equal(looksLikeUserTemplateName('method-statement-template.pdf'), true)
  assert.equal(looksLikeUserTemplateName('模板工程技术规范.pdf'), false)
  assert.equal(looksLikeUserTemplateName('规范.pdf'), false)
})

test('sortKbCategories keeps 用户模板 with the presets', () => {
  assert.deepEqual(
    sortKbCategories(['自定义', '用户模板', '规范', '范文']),
    ['规范', '范文', '用户模板', '自定义'],
  )
  assert.equal(kbCategoryHint('用户模板').includes('复刻'), true)
  assert.equal(kbCategoryHint('规范'), '')
  assert.equal(kbCategoryLabel('规范'), '规范')
  assert.equal(kbCategoryLabel('规范', 'en'), 'Specs')
  assert.equal(kbCategoryLabel('用户模板', 'en'), 'User templates')
  assert.equal(kbCategoryLabel('COTO 2020', 'en'), 'COTO 2020')
  assert.match(kbCategoryHint('用户模板', 'en'), /format, outline, and depth/)
})

test('groupKbEntries nests files under COTO 2020 and keeps leftovers loose', () => {
  const grouped = groupKbEntries([
    { slug: 'ch1', category: '规范', folderId: 'coto-2020' },
    { slug: 'note', category: '规范' },
  ], [{ id: 'coto-2020', name: 'COTO 2020', category: '规范' }], '规范')
  assert.equal(grouped.folders[0]?.folder.name, 'COTO 2020')
  assert.deepEqual(grouped.folders[0]?.entries.map((entry) => entry.slug), ['ch1'])
  assert.deepEqual(grouped.loose.map((entry) => entry.slug), ['note'])
})

test('kbChatImportCopy tells the user the exact chat line, not just tool names', () => {
  const copy = kbChatImportCopy()
  assert.equal(copy.say, KB_CHAT_IMPORT_SAY)
  assert.match(copy.warn, /不说话，不会进知识库/)
  assert.match(copy.say, /准确整理完整内容/)
  assert.match(copy.say, /知识包再入库/)
  assert.match(copy.after, /一键导入知识包/)
  assert.equal(copy.after.includes('kb_prepare_document'), false)
  const page = clientSource
  assert.equal(page.includes(KB_CHAT_IMPORT_SAY), true)
  assert.equal(page.includes('路径二 · 对话导入知识库'), true)
  assert.equal(page.includes('新增子目录'), true)
  assert.equal(page.includes('归入'), true)
  assert.equal(page.includes('data-ap-kb-folder-dialog'), true)
  assert.equal(page.includes('data-ap-kb-confirm-dialog'), true)
  assert.equal(page.includes("'kb.folderOk': '新建'"), true)
  assert.equal(page.includes("window.prompt(tAp('kb.folderPrompt'))"), false)
  assert.equal(page.includes("window.prompt(tAp('kb.newFolderPrompt'))"), false)
  assert.equal(page.includes("window.confirm(tAp('kb.deleteFolderConfirm'"), false)
  assert.equal(page.includes("window.confirm(tAp('kb.deleteEntryConfirm'"), false)
  assert.equal(page.includes('导入传递包'), true)
  assert.equal(page.includes('导出此目录'), true)
  assert.equal(page.includes('本机技能'), true)
  assert.equal(page.includes('data-ap-kb-skills'), true)
  assert.equal(page.includes('.ap-kb-skill{'), true)
  assert.equal(page.includes("className: 'ap-kb-skill'"), true)
  assert.equal(page.includes("data.skills.map((skill) => h('div', { key: skill.slug, className: 'ap-task'"), false)
  assert.equal(page.includes('.apkb'), true)
  const enCopy = kbChatImportCopy('en')
  assert.equal(enCopy.say, KB_CHAT_IMPORT_SAY)
  assert.equal(enCopy.title, 'Path 2 · Import from chat')
  assert.match(enCopy.warn, /without a message/)
  assert.equal(page.includes("'kb.title': 'Local knowledge base'"), true)
  assert.equal(page.includes("'kb.importPack': 'Import transfer pack'"), true)
})

test('looksLikeKbTransferName only accepts the app transfer extension', () => {
  assert.equal(looksLikeKbTransferName('COTO 2020.apkb'), true)
  assert.equal(looksLikeKbTransferName('技能-method.APKB'), true)
  assert.equal(looksLikeKbTransferName('pack.json'), false)
  assert.equal(looksLikeKbTransferName('规范.pdf'), false)
})

test('moduleCreateCopy leads with conversation, not JSON import', () => {
  const copy = moduleCreateCopy()
  assert.equal(copy.title, '模块创造模式')
  assert.match(copy.lead, /不要先导入 JSON/)
  assert.match(copy.lead, /完整模块包/)
  assert.match(copy.warn, /Agent 预设/)
  assert.equal(copy.cards.length, 3)
  assert.equal(copy.cards[0].id, 'distill')
  assert.match(MODULE_CREATE_PROMPTS['custom-steps'], /workbench-domain-builder/)
  assert.match(MODULE_CREATE_PROMPTS['custom-steps'], /不要写 cordis\.yml/)
  assert.equal(MODULE_CREATE_PROMPTS.distill.includes('schemaVersion'), false)
  const page = clientSource
  assert.equal(page.includes('模块创造模式'), true)
  assert.equal(page.includes('去对话里创造'), true)
  assert.equal(page.includes('完整模块包，不是一段 JSON'), true)
  assert.equal(page.includes('高级 · 粘贴模块定义（开发者）'), true)
  assert.equal(page.includes('导入定义 JSON'), false)
  assert.equal(page.includes('按我们的做法来建'), false)
  const enCreate = moduleCreateCopy('en')
  assert.equal(enCreate.title, 'Module create mode')
  assert.match(enCreate.lead, /Do not start by importing JSON/)
  assert.equal(enCreate.cards.length, 3)
  assert.equal(page.includes("'mm.title': 'Modules'"), true)
  assert.equal(page.includes("'mm.design': 'Create in chat'"), true)
})

test('mergeKbEntries drops a local placeholder once the server has the same name', () => {
  const merged = mergeKbEntries(
    [{ slug: 'staged-1', name: '新规范.pdf', parseStatus: 'staged' }],
    [{ slug: 'local:新规范.pdf', name: '新规范.pdf', parseStatus: 'staged' }],
  )
  assert.equal(merged.filter((entry) => entry.name === '新规范.pdf').length, 1)
  assert.equal(merged[0].slug, 'staged-1')
})

test('visibleArchivedSessionIds hides forgotten deletes and keeps archive order', () => {
  assert.deepEqual(uniqueIds([' a ', '', 'a', 'b']), ['a', 'b'])
  assert.deepEqual(visibleArchivedSessionIds(['s-1', 's-2', 's-3'], ['s-2', 's-9']), ['s-1', 's-3'])
  assert.deepEqual(visibleArchivedSessionIds(null, ['s-1']), [])
})

test('archiveSessionRows groups newest first and falls back to 未分组', () => {
  const rows = archiveSessionRows({
    archivedSessionIds: ['gone', 'live', 'orphan'],
    forgottenSessionIds: ['gone'],
    sessionsById: {
      live: { displayTitle: '组价核对', updatedAt: 20 },
      orphan: { title: '早先一轮', updatedAt: 10 },
    },
    workspaces: [{ workspaceId: 'w1', title: 'COTO 标段', sessionIds: ['live'] }],
  })
  assert.deepEqual(rows.map((row) => row.sessionId), ['live', 'orphan'])
  assert.equal(rows[0].workspaceTitle, 'COTO 标段')
  assert.equal(rows[1].workspaceTitle, '未分组')
  const groups = groupArchiveRows(rows)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].title, 'COTO 标段')
  assert.equal(groups[1].title, '未分组')
})

test('workspaceActionTitle reads official zh and en workspace-row aria labels', () => {
  assert.equal(workspaceActionTitle('工作区“COTO 标段”的操作'), 'COTO 标段')
  assert.equal(workspaceActionTitle('Workspace actions for COTO'), 'COTO')
  assert.equal(workspaceActionTitle('会话“组价核对”的操作'), '')
})

test('resolveWorkspaceByTitle uses same-title index when names collide', () => {
  const items = [
    { workspaceId: 'w-a', title: '同名', sessionIds: ['s-1'] },
    { workspaceId: 'w-b', title: '同名', sessionIds: ['s-2'] },
  ]
  assert.equal(resolveWorkspaceByTitle(items, '同名', 0)?.workspaceId, 'w-a')
  assert.equal(resolveWorkspaceByTitle(items, '同名', 1)?.workspaceId, 'w-b')
  assert.equal(resolveWorkspaceByTitle(items, '没有', 0), null)
})

test('archivedWorkspaceGroups keeps empty archived workspaces and splits leftover sessions', () => {
  const groups = archivedWorkspaceGroups({
    archivedWorkspaceIds: ['w-empty', 'w-full'],
    archivedSessionIds: ['s-1', 's-2'],
    forgottenSessionIds: [],
    sessionsById: {
      's-1': { displayTitle: '组价', updatedAt: 20 },
      's-2': { displayTitle: '早先', updatedAt: 10 },
    },
    workspaces: [
      { workspaceId: 'w-live', title: '进行中', sessionIds: [] },
      { workspaceId: 'w-empty', title: '空归档', sessionIds: [] },
      { workspaceId: 'w-full', title: 'COTO', sessionIds: ['s-1'] },
    ],
  })
  assert.deepEqual(groups.map((group) => [group.kind, group.workspaceId, group.sessions.length]), [
    ['workspace', 'w-empty', 0],
    ['workspace', 'w-full', 1],
    ['ungrouped', '', 1],
  ])
  assert.equal(groups[1].sessions[0].sessionId, 's-1')
  assert.equal(groups[2].sessions[0].sessionId, 's-2')
})

test('restoreOpenPath prefers the first-stage manuscript over the original PDF', () => {
  const source = 'C:\\docs\\N.003-010-2017-3R Book 1 of Volume 3.pdf'
  const manuscript = 'C:\\ws\\Agent Pi Outputs\\n3\\setup\\Book 1-解析稿\\manuscript.md'
  assert.equal(restoreOpenPath(source, [{
    sourcePath: source,
    originalName: 'N.003-010-2017-3R Book 1 of Volume 3.pdf',
    manuscriptPath: manuscript,
  }]), manuscript)
  assert.equal(restoreOpenPath(source, [{
    sourcePath: 'D:\\other\\Book 1 of Volume 3.pdf',
    originalName: 'N.003-010-2017-3R Book 1 of Volume 3.pdf',
    manuscriptPath: manuscript,
  }]), manuscript)
  assert.equal(restoreOpenPath(source, []), source)
  const page = clientSource
  assert.equal(page.includes('/api/agent-pi/projects/restore'), true)
  assert.equal(page.includes('已保存并同步解析 JSON'), true)
  assert.equal(page.includes('已保存并同步知识库检索'), true)
  assert.equal(page.includes('.then((body) => {'), true)
  assert.equal(page.includes('对齐原稿'), true)
  assert.equal(page.includes("setupId && stage.id === setupId"), true)
  assert.equal(page.includes("restoreSources(project, { force: true })"), true)
  assert.equal(page.includes('restoreSources(project).then(() => runStage(project, setupId, \'complete\''), true)
})

test('English chrome copy is wired next to the Chinese product strings', () => {
  const page = clientSource
  assert.equal(page.includes("'nav.kb': 'Knowledge base'"), true)
  assert.equal(page.includes("'wb.back': 'Back to chat'"), true)
  assert.equal(page.includes("'module.tender': 'Tender process'"), true)
  assert.equal(page.includes("'wb.create': 'New project'"), true)
  assert.equal(page.includes('tAp(\'nav.kb\')'), true)
  assert.equal(page.includes('tAp(\'wb.back\')'), true)
  assert.equal(page.includes('setApLang(next)'), true)
})

test('archive page copy is wired into the self-contained client bundle', () => {
  const page = clientSource
  assert.equal(page.includes('function ArchiveNav'), true)
  assert.equal(page.includes('function ArchivePanel'), true)
  assert.equal(page.includes('function archivedWorkspaceGroups'), true)
  assert.equal(page.includes('ap-mount-archive'), true)
  assert.equal(page.includes('data-ap-archive-workspace'), true)
  assert.equal(page.includes('data-ap-archived-workspace'), true)
  assert.equal(page.includes('paintSessionDeleteLabels'), false)
  assert.equal(page.includes('完整对话记录'), true)
  assert.equal(page.includes('从侧栏和归档中移除'), true)
  assert.equal(page.includes('归档工作区'), true)
  assert.equal(page.includes('归档全部对话'), false)
  assert.equal(page.includes('el.textContent = tAp(\'session.delete\')'), false)
})
