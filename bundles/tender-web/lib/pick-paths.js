/**
 * Electron 43 dialogs may echo the raw { canceled, filePaths } object
 * instead of a path array. The picker must treat that as a list, not ignore it.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePickedPaths(value) {
  if (value == null) return []
  if (typeof value === 'string') {
    const path = value.trim()
    return path ? [path] : []
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'object' && Array.isArray(value.filePaths)) {
    return normalizePickedPaths(value.filePaths)
  }
  if (typeof value === 'object' && typeof value.length === 'number') {
    return Array.from(value).map((item) => String(item || '').trim()).filter(Boolean)
  }
  return []
}

/**
 * Keep unfinished local placeholders when a later overview refresh
 * would otherwise replace the whole entry list.
 *
 * @param {Array<{ slug?: string, name?: string, originalName?: string }>} server
 * @param {Array<{ slug?: string, name?: string, originalName?: string }>} local
 * @returns {Array<{ slug?: string, name?: string, originalName?: string }>}
 */
export function mergeKbEntries(server, local) {
  const serverList = Array.isArray(server) ? server.slice() : []
  const localList = Array.isArray(local) ? local : []
  const serverSlugs = new Set(serverList.map((entry) => entry && entry.slug).filter(Boolean))
  const serverNames = new Set(serverList.map((entry) => String((entry && (entry.name || entry.originalName)) || '')).filter(Boolean))
  const kept = localList.filter((entry) => {
    if (!entry || !entry.slug || serverSlugs.has(entry.slug)) return false
    if (String(entry.slug).indexOf('local:') === 0) {
      const name = String(entry.name || entry.originalName || entry.slug.slice('local:'.length))
      if (name && serverNames.has(name)) return false
    }
    return true
  })
  return kept.concat(serverList)
}

/**
 * Hide the temporary "landing" card once the same file is already staged or ready.
 *
 * @param {string} label
 * @param {Array<{ name?: string, originalName?: string, parseStatus?: string }>} entries
 * @returns {boolean}
 */
export function kbLandingCardVisible(label, entries) {
  const shown = String(label || '').trim()
  if (!shown) return false
  return !(Array.isArray(entries) ? entries : []).some((entry) => {
    const name = String((entry && (entry.name || entry.originalName)) || '')
    if (!name || shown.indexOf(name) < 0) return false
    const status = entry && entry.parseStatus
    return status === 'ready' || status === 'staged' || status === 'parsing' || status === 'failed'
  })
}

/**
 * @param {string} [lang]
 * @returns {'zh' | 'en'}
 */
export function apLangOf(lang) {
  const id = String(lang || '').toLowerCase()
  return id === 'en' || id.startsWith('en-') ? 'en' : 'zh'
}

/**
 * Ready-row chip: structured units show clause count, tables, and coverage.
 *
 * @param {{ chunkCount?: number, clauseCount?: number, tableCount?: number, coverage?: number }} entry
 * @param {string} [lang]
 * @returns {string}
 */
export function kbFidelityLabel(entry, lang) {
  const en = apLangOf(lang) === 'en'
  const clauseCount = Number(entry && entry.clauseCount)
  const coverage = Number(entry && entry.coverage)
  const tableCount = Number(entry && entry.tableCount)
  if (Number.isFinite(clauseCount) && clauseCount > 0 && Number.isFinite(coverage)) {
    const tables = Number.isFinite(tableCount) && tableCount > 0
      ? (en ? ` · tables ${tableCount}` : ` · 表 ${tableCount}`)
      : ''
    return en
      ? `Clauses ${clauseCount}${tables} · coverage ${Math.round(coverage * 100)}%`
      : `条款 ${clauseCount}${tables} · 覆盖 ${Math.round(coverage * 100)}%`
  }
  const chunkCount = Number(entry && entry.chunkCount)
  if (Number.isFinite(chunkCount) && chunkCount > 0) return en ? `${chunkCount} chunks` : `${chunkCount} 块`
  return ''
}

/**
 * @param {{ ingest?: string, originalName?: string, name?: string }} entry
 * @returns {'' | 'pack' | 'mineru' | 'local' | 'raw'}
 */
export function kbIngestKind(entry) {
  if (!entry) return ''
  if (entry.ingest === 'pack') return 'pack'
  if (entry.ingest === 'mineru') return 'mineru'
  const name = String(entry.originalName || entry.name || '')
  if (/\.(pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp)$/i.test(name)) return 'local'
  return 'raw'
}

/**
 * @param {{ ingest?: string, originalName?: string, name?: string }} entry
 * @param {string} [lang]
 * @returns {string}
 */
export function kbIngestLabel(entry, lang) {
  const kind = kbIngestKind(entry)
  if (!kind) return ''
  const en = apLangOf(lang) === 'en'
  if (kind === 'pack') return en ? 'Knowledge pack' : '知识包'
  if (kind === 'mineru') return en ? 'MinerU manuscript' : 'MinerU 解析稿'
  if (kind === 'local') return en ? 'Local text layer' : '本机文本层'
  return en ? 'Source ingest' : '原文入库'
}

/**
 * Right-click import: only pack.json, manuscript.md, or a folder whose name
 * looks like a knowledge pack. Arbitrary folders stay out (MinerU artifact dirs).
 *
 * @param {{ name?: string, type?: string }} file
 * @returns {boolean}
 */
export const KB_PRESET_CATEGORIES = ['规范', '合同', '范文', '方法标准', '用户模板']

/**
 * File name that should land in 用户模板 when the caller omitted a category.
 * Matches 施工方案模板 / 用户模版-投标函 / method-statement-template, not 模板工程技术规范.
 *
 * @param {string} [name]
 * @returns {boolean}
 */
export function looksLikeUserTemplateName(name) {
  const base = String(name || '').replace(/^.*[\\/]/, '')
  if (!base) return false
  const stem = base.replace(/\.[^.]+$/, '')
  if (/(用户模板|用户模版)/.test(stem)) return true
  if (/(模板|模版)$/.test(stem)) return true
  if (/(^|[^a-z0-9])template([^a-z0-9]|$)/i.test(stem)) return true
  return false
}

const KB_CATEGORY_LABELS = {
  zh: {
    '规范': '规范',
    '合同': '合同',
    '范文': '范文',
    '方法标准': '方法标准',
    '用户模板': '用户模板',
    '用户模版': '用户模板',
    '自定义': '自定义',
    '未分类': '未分类',
  },
  en: {
    '规范': 'Specs',
    '合同': 'Contracts',
    '范文': 'Exemplars',
    '方法标准': 'Method standards',
    '用户模板': 'User templates',
    '用户模版': 'User templates',
    '自定义': 'Custom',
    '未分类': 'Uncategorized',
  },
}

/**
 * Display label for a stored category key. Unknown names stay as stored.
 *
 * @param {string} [category]
 * @param {string} [lang]
 * @returns {string}
 */
export function kbCategoryLabel(category, lang) {
  const name = String(category || '')
  return (KB_CATEGORY_LABELS[apLangOf(lang)] || KB_CATEGORY_LABELS.zh)[name] || name
}

/**
 * @param {string} [category]
 * @param {string} [lang]
 * @returns {string}
 */
export function kbCategoryHint(category, lang) {
  if (category !== '用户模板' && category !== '用户模版') return ''
  return apLangOf(lang) === 'en'
    ? 'When checked, this round copies its format, outline, and depth'
    : '勾选后，本轮写作复刻其格式、大纲与内容深度'
}

/**
 * @param {string[]} names
 * @returns {string[]}
 */
export function sortKbCategories(names) {
  return (Array.isArray(names) ? names : []).slice().sort((a, b) => {
    const ia = KB_PRESET_CATEGORIES.indexOf(a)
    const ib = KB_PRESET_CATEGORIES.indexOf(b)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return String(a).localeCompare(String(b), 'zh')
  })
}

/**
 * Nest entries under named collections in one category. Empty folders stay visible.
 *
 * @param {Array<{ category?: string, folderId?: string }>} entries
 * @param {Array<{ id: string, name: string, category: string }>} folders
 * @param {string} category
 * @returns {{ folders: Array<{ folder: { id: string, name: string, category: string }, entries: object[] }>, loose: object[] }}
 */
export function groupKbEntries(entries, folders, category) {
  const list = (Array.isArray(entries) ? entries : []).filter((entry) => !category || entry.category === category)
  const inCat = (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder && folder.category === category)
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
  const buckets = new Map(inCat.map((folder) => [folder.id, []]))
  const loose = []
  for (const entry of list) {
    const bucket = entry.folderId ? buckets.get(entry.folderId) : undefined
    if (bucket) bucket.push(entry)
    else loose.push(entry)
  }
  return {
    folders: inCat.map((folder) => ({ folder, entries: buckets.get(folder.id) || [] })),
    loose,
  }
}

export function looksLikeKbTransferName(name) {
  return /\.apkb$/i.test(String(name || ''))
}

export function looksLikeKbPackName(file) {
  const name = String((file && file.name) || '')
  const base = name.replace(/^.*[\\/]/, '').toLowerCase()
  if (base === 'pack.json' || base === 'manuscript.md') return true
  if ((file && file.type) === 'directory' && /(kb-pack|knowledge-pack|知识包)/i.test(name)) return true
  return false
}

/** Copy-paste line that loads kb-vision-pack and starts the chat import. */
export const KB_CHAT_IMPORT_SAY = '把这个 PDF 准确整理完整内容，做成知识包再入库。'

export const KB_CHAT_IMPORT_TRIGGERS = ['知识库', '入库', '知识包', '准确整理', '完整内容', '全文转录']

/**
 * Knowledge Base page, path 2: what to say in the main chat after attaching a PDF.
 * `say` stays Chinese — that is the model-facing trigger line.
 *
 * @param {string} [lang]
 * @returns {{ title: string, warn: string, say: string, after: string }}
 */
export function kbChatImportCopy(lang) {
  if (apLangOf(lang) === 'en') {
    return {
      title: 'Path 2 · Import from chat',
      warn: 'Dropping a PDF into the main chat without a message does not add it to the knowledge base. After attaching the file, send this line:',
      say: KB_CHAT_IMPORT_SAY,
      after: 'You can also say: ' + KB_CHAT_IMPORT_TRIGGERS.join(', ') + '. After the model writes a “…-知识包” folder, right-click that folder or pack.json in the files rail and choose Import knowledge pack. It is searchable immediately. Ordinary files can still use Import to knowledge base — the same parser as this page.',
    }
  }
  return {
    title: '路径二 · 对话导入知识库',
    warn: '只把 PDF 丢进主对话、不说话，不会进知识库。贴上文件后发送下面这句：',
    say: KB_CHAT_IMPORT_SAY,
    after: '也能说：' + KB_CHAT_IMPORT_TRIGGERS.join('、') + '。模型写好「…-知识包」文件夹后，右侧对该文件夹或 pack.json 右键「一键导入知识包」，立刻可检索。普通文件仍可右键「一键导入知识库」，和本页是同一套解析。',
  }
}

const MODULE_CREATE_GUARD = '请先读 skill workbench-domain-builder。这是本应用专业化工作台的模块创造对话，不是 Agent 预设里的「创造模式」，不要写 cordis.yml 或改插件组装。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 评审）、配套方法 skill、能挂的知识库。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。'

/** Composer drafts that open the workbench module-creation conversation. */
export const MODULE_CREATE_PROMPTS = {
  distill: MODULE_CREATE_GUARD + '我想把这次对话里已经做完、我认可的成果，整理成以后同类工作的标准。范文或用户模板进知识库，做法记成 skill，模块保存后用中文告诉我顶栏新标签叫什么、下次怎么开项目。最多确认一句中文名称和分几步。',
  'copy-pack': MODULE_CREATE_GUARD + '我们步骤和「投标全流程」一样（资料登记 → 解析 → 组价 → 出稿），但要用我们自己的规范、组价表或投标函。请拷贝内置投标为自建模块（workbench_module_copy），不要改四阶段 id。拷完用中文问我模块叫什么、规范或范文在哪（可以让我上传），挂到规范包。建好告诉我顶栏新标签和下次怎么用。',
  'custom-steps': MODULE_CREATE_GUARD + '我们这类工作和「投标全流程」步骤不一样。请用一条消息、用大白话问清：这个领域叫什么、实际工作分哪几步（3到6步）、开工有什么资料、最后交什么、有没有规范或范文。问完后建成完整模块包。保存后告诉我顶栏新标签叫什么、下次怎么开项目。',
}

/**
 * Drop blanks and duplicates while keeping first-seen order.
 *
 * @param {unknown} ids
 * @returns {string[]}
 */
export function uniqueIds(ids) {
  const out = []
  const seen = new Set()
  for (const value of Array.isArray(ids) ? ids : []) {
    const id = String(value || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/**
 * Official archived ids minus product-forgotten deletes.
 *
 * @param {unknown} archivedIds
 * @param {unknown} forgottenIds
 * @returns {string[]}
 */
export function visibleArchivedSessionIds(archivedIds, forgottenIds) {
  const forgotten = new Set(uniqueIds(forgottenIds))
  return uniqueIds(archivedIds).filter((id) => !forgotten.has(id))
}

/**
 * Archive page rows: title, workspace, newest first.
 *
 * @param {{
 *   archivedSessionIds?: unknown,
 *   forgottenSessionIds?: unknown,
 *   sessionsById?: Record<string, { displayTitle?: string, title?: string, blank?: boolean, updatedAt?: number }>,
 *   workspaces?: Array<{ workspaceId?: string, title?: string, path?: string, sessionIds?: unknown }>,
 * }} input
 * @returns {Array<{ sessionId: string, title: string, blank: boolean, updatedAt: number, workspaceId: string, workspaceTitle: string }>}
 */
export function archiveSessionRows(input) {
  const payload = input && typeof input === 'object' ? input : {}
  const archived = visibleArchivedSessionIds(payload.archivedSessionIds, payload.forgottenSessionIds)
  const byId = payload.sessionsById && typeof payload.sessionsById === 'object' ? payload.sessionsById : {}
  const workspaceOf = {}
  for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
    if (!workspace) continue
    const title = String(workspace.title || workspace.path || '工作区')
    for (const sessionId of uniqueIds(workspace.sessionIds)) {
      workspaceOf[sessionId] = { id: String(workspace.workspaceId || ''), title }
    }
  }
  return archived.map((sessionId) => {
    const session = byId[sessionId] || {}
    const workspace = workspaceOf[sessionId]
    return {
      sessionId,
      title: String(session.displayTitle || session.title || '未命名对话'),
      blank: !!session.blank,
      updatedAt: Number(session.updatedAt) || 0,
      workspaceId: workspace ? workspace.id : '',
      workspaceTitle: workspace ? workspace.title : '未分组',
    }
  }).sort((left, right) => (right.updatedAt - left.updatedAt) || left.title.localeCompare(right.title, 'zh'))
}

/**
 * Group archive rows by workspace for the sidebar archive page.
 *
 * @param {Array<{ workspaceId?: string, workspaceTitle?: string }>} rows
 * @returns {Array<{ workspaceId: string, title: string, sessions: typeof rows }>}
 */
export function groupArchiveRows(rows) {
  const groups = []
  const index = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String((row && row.workspaceId) || '')
    if (!index.has(key)) {
      const group = { workspaceId: key, title: (row && row.workspaceTitle) || '未分组', sessions: [] }
      index.set(key, group)
      groups.push(group)
    }
    index.get(key).sessions.push(row)
  }
  return groups
}

/**
 * Official workspace-row aria-label → title. Empty when the button is not a workspace menu.
 *
 * @param {unknown} label
 * @returns {string}
 */
export function workspaceActionTitle(label) {
  const text = String(label || '').trim()
  const zh = text.match(/^工作区[“"](.+)[”"]的操作$/)
  if (zh) return zh[1]
  const en = text.match(/^Workspace actions for (.+)$/)
  if (en) return en[1]
  return ''
}

/**
 * Match a sidebar workspace row when titles collide: same-title items stay in list order.
 *
 * @param {unknown} items
 * @param {unknown} title
 * @param {unknown} index
 * @returns {{ workspaceId: string, title: string, path: string, sessionIds: string[] } | null}
 */
export function resolveWorkspaceByTitle(items, title, index) {
  const name = String(title || '').trim()
  if (!name) return null
  const matches = []
  for (const workspace of Array.isArray(items) ? items : []) {
    if (!workspace) continue
    const label = String(workspace.title || workspace.path || '').trim()
    if (label !== name) continue
    matches.push({
      workspaceId: String(workspace.workspaceId || ''),
      title: label,
      path: String(workspace.path || ''),
      sessionIds: uniqueIds(workspace.sessionIds),
    })
  }
  if (!matches.length) return null
  const at = Number(index)
  if (Number.isInteger(at) && at >= 0 && at < matches.length) return matches[at]
  return matches[0]
}

/**
 * Archive page groups: archived workspaces first (empty ones stay), then leftover session archives.
 *
 * @param {{
 *   archivedWorkspaceIds?: unknown,
 *   archivedSessionIds?: unknown,
 *   forgottenSessionIds?: unknown,
 *   sessionsById?: Record<string, { displayTitle?: string, title?: string, blank?: boolean, updatedAt?: number }>,
 *   workspaces?: Array<{ workspaceId?: string, title?: string, path?: string, sessionIds?: unknown }>,
 * }} input
 * @returns {Array<{ workspaceId: string, title: string, path: string, kind: 'workspace' | 'sessions' | 'ungrouped', sessions: ReturnType<typeof archiveSessionRows> }>}
 */
export function archivedWorkspaceGroups(input) {
  const payload = input && typeof input === 'object' ? input : {}
  const archivedWs = new Set(uniqueIds(payload.archivedWorkspaceIds))
  const rows = archiveSessionRows(payload)
  const sessionGroups = groupArchiveRows(rows)
  const byId = new Map(sessionGroups.map((group) => [group.workspaceId, group]))
  const out = []
  const seen = new Set()
  for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
    if (!workspace) continue
    const id = String(workspace.workspaceId || '')
    if (!id || !archivedWs.has(id)) continue
    const existing = byId.get(id)
    out.push({
      workspaceId: id,
      title: String(workspace.title || workspace.path || '工作区'),
      path: String(workspace.path || ''),
      kind: 'workspace',
      sessions: existing ? existing.sessions : [],
    })
    seen.add(id)
  }
  for (const group of sessionGroups) {
    if (group.workspaceId && seen.has(group.workspaceId)) continue
    out.push({
      workspaceId: group.workspaceId,
      title: group.title,
      path: '',
      kind: group.workspaceId ? 'sessions' : 'ungrouped',
      sessions: group.sessions,
    })
  }
  return out
}

/**
 * Module manager: conversation-first creation, not JSON import.
 *
 * @param {string} [lang]
 * @returns {{ title: string, lead: string, warn: string, advanced: string, cards: Array<{ id: string, title: string, body: string }> }}
 */
export function moduleCreateCopy(lang) {
  if (apLangOf(lang) === 'en') {
    return {
      title: 'Module create mode',
      lead: 'Do not start by importing JSON. Pick a path below and continue in chat. What you get is a complete module pack at the same level as Tender process: top bar, stage monitor, source registration, workflow gates, matching methods, and a knowledge base. After save, this app draws it with the same workbench.',
      warn: 'Do not switch to Create mode in the Agent preset — that edits plugin assembly. Module creation only goes through this page into chat.',
      advanced: 'Paste here only when you already have a module definition this app has validated. Everyday use should go through the create conversation above.',
      cards: [
        { id: 'distill', title: 'We finished one job — use this as the standard', body: 'Turn the accepted results from this chat into the standard for later work of the same kind. Exemplars go to the knowledge base; the method is written down.' },
        { id: 'copy-pack', title: 'Same steps as Tender process, different rules', body: 'Still register → analyze → price → draft. Copy one and attach your scoring rules, rate tables, or letters. The stage bar stays four steps.' },
        { id: 'custom-steps', title: 'The steps are different', body: 'For example qualification, then technical, then commercial — no pricing. Say the steps in plain language. The new tab and monitor bar follow those steps.' },
      ],
    }
  }
  return {
    title: '模块创造模式',
    lead: '不要先导入 JSON。点下面一条路，回到对话用人机交互。生成的是和「投标全流程」同等级的完整模块包：顶栏、阶段监控、资料登记、流程控制、配套方法和知识库。保存后本应用按同一套专业化工作台画出来。',
    warn: '不要切到 Agent 预设里的「创造模式」——那是改插件组装的。模块创造只走本页进对话这条路。',
    advanced: '只有已经拿到本应用校验过的模块定义时，才在这里粘贴。普通使用请走上面的创造对话。',
    cards: [
      { id: 'distill', title: '做过一单，照这个来', body: '把这次对话里已经认可的成果，整理成以后同类工作的标准。范文进知识库，做法记下来。' },
      { id: 'copy-pack', title: '步骤和投标全流程一样，规矩不同', body: '还是登记 → 解析 → 组价 → 出稿。拷贝一份，挂上你们的评分办法、组价表或投标函。阶段条还是四步。' },
      { id: 'custom-steps', title: '步骤就不一样', body: '例如先资格再技术再商务、没有组价。用中文说清几步，新标签和监控条按这几步画。' },
    ],
  }
}

/**
 * Open the first-stage aligned manuscript when present, otherwise the original file.
 *
 * @param {string} sourcePath
 * @param {Array<{ sourcePath?: string, originalName?: string, manuscriptPath?: string }>} restores
 * @returns {string}
 */
export function restoreOpenPath(sourcePath, restores) {
  const path = String(sourcePath || '')
  const name = path.split(/[\\/]/).pop() || path
  const list = Array.isArray(restores) ? restores : []
  const hit = list.find((item) => {
    if (!item) return false
    const left = String(item.sourcePath || '').replace(/\\/g, '/').toLowerCase()
    const right = path.replace(/\\/g, '/').toLowerCase()
    return left === right || item.originalName === name
  })
  return (hit && hit.manuscriptPath) || path
}
