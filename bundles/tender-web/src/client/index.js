import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { createAgentPiApiClient } from './api-client.js'
import { createFilePreviewOverlay } from './file-preview-overlay.js'
import { createKnowledgeBasePanel } from './knowledge-base-panel.js'
import { createWorkbenchSessionMonitor } from './session-monitor.js'
import { createWorkbenchView } from './workbench-view.js'
import { clientCss } from './styles.js'
import { buildCodexTurnDelegation } from '../codex-turn.ts'
import { fileIconClass, fileIconMeta, fileIconName } from '../file-icons.ts'
import {
  PREVIEW_HEAD_CHARS,
  PREVIEW_TABLE_ROW_CAP,
  isInsideApDoc,
  previewIsHeavy,
  restoreCappedTables,
  slicePreviewMarkdown,
} from '../md-preview.ts'
import { buildPreviewSelectionFollowup } from '../selection-rewrite.ts'
import { createSessionTransactionRegistry } from '../session-transaction.ts'
import {
  isWorkbenchWakeText,
  lastChildReturn,
  nodeText,
  parentSessionTarget,
  queuedMessages,
  sessionActivity,
  sessionNodes,
  snapshotIsBusy,
  snapshotIsRunning,
} from '../session-wake.ts'

const h = React.createElement

    const { api, apiBlob, downloadBlob, rawFileUrl } = createAgentPiApiClient()
    const MARKUP_RE = /[`*!\[]/
    const HTML_SPECIAL_RE = /[&<>"]/

    const css = clientCss
    if (typeof document !== 'undefined') {
      const existing = document.querySelector('style[data-plugin-css="dsh-tender-web"]')
      if (existing) existing.remove()
      const tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-tender-web'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const ICONS = {
      settings: [
        ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }],
        ['circle', { cx: 12, cy: 12, r: 3 }],
      ],
      clipboardCheck: [
        ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
        ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
        ['path', { d: 'm9 14 2 2 4-4' }],
      ],
      clipboardList: [
        ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
        ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
        ['path', { d: 'M12 11h4' }],
        ['path', { d: 'M12 16h4' }],
        ['path', { d: 'M8 11h.01' }],
        ['path', { d: 'M8 16h.01' }],
      ],
      book: [
        ['path', { d: 'M12 7v14' }],
        ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
      ],
      landmark: [
        ['line', { x1: 3, x2: 21, y1: 22, y2: 22 }],
        ['line', { x1: 6, x2: 6, y1: 18, y2: 11 }],
        ['line', { x1: 10, x2: 10, y1: 18, y2: 11 }],
        ['line', { x1: 14, x2: 14, y1: 18, y2: 11 }],
        ['line', { x1: 18, x2: 18, y1: 18, y2: 11 }],
        ['polygon', { points: '12 2 20 7 4 7' }],
      ],
      plus: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'M12 5v14' }],
      ],
      refresh: [
        ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
        ['path', { d: 'M21 3v5h-5' }],
        ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
        ['path', { d: 'M8 16H3v5' }],
      ],
      folder: [
        ['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' }],
      ],
      message: [
        ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
      ],
      layout: [
        ['rect', { width: 7, height: 18, x: 3, y: 3, rx: 1 }],
        ['rect', { width: 7, height: 8, x: 14, y: 3, rx: 1 }],
        ['rect', { width: 7, height: 8, x: 14, y: 13, rx: 1 }],
      ],
      list: [
        ['path', { d: 'M8 6h13' }],
        ['path', { d: 'M8 12h13' }],
        ['path', { d: 'M8 18h13' }],
        ['path', { d: 'M3 6h.01' }],
        ['path', { d: 'M3 12h.01' }],
        ['path', { d: 'M3 18h.01' }],
      ],
      unlock: [
        ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
      ],
      arrow: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'm12 5 7 7-7 7' }],
      ],
      filePlus: [
        ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
        ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
        ['path', { d: 'M9 15h6' }],
        ['path', { d: 'M12 18v-6' }],
      ],
      play: [
        ['circle', { cx: 12, cy: 12, r: 10 }],
        ['polygon', { points: '10 8 16 12 10 16' }],
      ],
      search: [
        ['circle', { cx: 11, cy: 11, r: 8 }],
        ['path', { d: 'm21 21-4.3-4.3' }],
      ],
      lock: [
        ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
      ],
      square: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ],
      plusSquare: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
        ['path', { d: 'M8 12h8' }],
        ['path', { d: 'M12 8v8' }],
      ],
      sparkles: [
        ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
        ['path', { d: 'M20 2v4' }],
        ['path', { d: 'M22 4h-4' }],
        ['circle', { cx: 4, cy: 20, r: 2 }],
      ],
      paperclip: [
        ['path', { d: 'M13.234 20.252 21 12.3' }],
        ['path', { d: 'm16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486' }],
      ],
      file: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M8 9h8M8 13h6', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileText: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M7 8h10M7 12h10M7 16h7', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileMd: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M7.5 16V8l4.5 6 4.5-6v8', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileSheet: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['rect', { x: 6.5, y: 6.5, width: 11, height: 3.4, rx: 0.4, fill: '#fff', stroke: 'none' }],
        ['path', { d: 'M7 13h10M7 16.5h10M10.5 10v7M14.5 10v7', stroke: '#fff', fill: 'none', strokeWidth: 1.6 }],
      ],
      fileWord: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'm7.4 8 2.3 9 2.3-5.6 2.3 5.6 2.3-9', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      filePpt: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['polygon', { points: '9,8 17,12 9,16', fill: '#fff', stroke: 'none' }],
      ],
      filePdf: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M8 17V8h4.4a2.7 2.7 0 0 1 0 5.4H8', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileHtml: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'm9 8-3.2 4L9 16M15 8l3.2 4L15 16', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileJson: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M10 7c-2 0-2 2-2 3s0 2-1.6 2C8 12 8 13 8 14s0 3 2 3M14 7c2 0 2 2 2 3s0 2 1.6 2C16 12 16 13 16 14s0 3-2 3', stroke: '#fff', fill: 'none', strokeWidth: 1.7 }],
      ],
      chevron: [
        ['path', { d: 'm9 18 6-6-6-6' }],
      ],
      panelRight: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
        ['path', { d: 'M15 3v18' }],
      ],
      x: [
        ['path', { d: 'M18 6 6 18' }],
        ['path', { d: 'm6 6 12 12' }],
      ],
      pencil: [
        ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
        ['path', { d: 'm15 5 4 4' }],
      ],
      eye: [
        ['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }],
        ['circle', { cx: 12, cy: 12, r: 3 }],
      ],
      image: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 9, cy: 9, r: 1.7, fill: '#fff', stroke: 'none' }],
        ['path', { d: 'm6.5 17 3.4-3.6 2.6 2.4 2.4-2.2 2.6 3.4', stroke: '#fff', fill: 'none', strokeWidth: 1.6 }],
      ],
      copy: [
        ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
        ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
      ],
      trash: [
        ['path', { d: 'M3 6h18' }],
        ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
        ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
      ],
      archive: [
        ['rect', { width: 20, height: 5, x: 2, y: 3, rx: 1 }],
        ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
        ['path', { d: 'M10 12h4' }],
      ],
      save: [
        ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
        ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
        ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }],
      ],
      download: [
        ['path', { d: 'M12 17V3' }],
        ['path', { d: 'm6 11 6 6 6-6' }],
        ['path', { d: 'M19 21H5' }],
      ],
      export: [
        ['path', { d: 'M7 7h10v10' }],
        ['path', { d: 'M7 17 17 7' }],
      ],
    }

    function Icon(name, size, className) {
      const nodes = ICONS[name] || []
      return h('svg', {
        className: ['ap-icon', className].filter(Boolean).join(' '),
        width: size || 16,
        height: size || 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, nodes.map((node, i) => h(node[0], Object.assign({ key: i }, node[1]))))
    }

    const WORKBENCH_LABEL = '专业化工作台'
    const AP_I18N = {
      zh: {
        'workbench.title': '专业化工作台',
        'files.openExplorer': '在资源管理器中打开',
        'files.opening': '正在打开资源管理器…',
        'files.openFailed': '无法打开文件夹',
        'files.noCwd': '还没有工作区路径',
        'files.uploadFiles': '上传文件到对话',
        'files.uploadFolder': '上传文件夹',
        'files.title': '资源文件',
        'files.official': '工作成果',
        'files.officialName': 'Official Outputs',
        'files.officialEmpty': '还没有正式产出。会话里改过的报告、地图等会自动落到这里。',
        'files.officialHint': '这里展示会话与工作台的正式产出，不依赖模型自己选目录。',
        'files.workspace': '工作区',
        'files.uploads': '上传资料',
        'files.pickWorkspace': '先选择工作区',
        'files.collapse': '收起资源文件',
        'files.expand': '展开资源文件',
        'files.refresh': '刷新',
        'files.addFolder': '加入文件夹地址（不上传文件）',
        'files.resize': '拖动调整宽度',
        'nav.kb': '知识库',
        'nav.kbTitle': '本地知识库：规范、合同、范文与用户模板，按文档结构精确索引',
        'wb.back': '返回对话',
        'wb.noCwd': '未选择工作区 · 聊天仍是默认路径，工作台只加速阶段准备',
        'wb.kb': '知识库',
        'wb.kbTitle': '跨项目共享的规范、合同、范文与用户模板；勾选用户模板后本轮复刻其格式与深度',
        'wb.modules': '模块管理',
        'wb.modulesTitle': '看已上线模块；新模块走创造对话，不要先导入 JSON',
        'wb.refresh': '刷新',
        'wb.adopt': '升级当前工作',
        'wb.adoptTitle': '把当前会话工作区登记为所选模块的专业项目，不另建目录',
        'wb.create': '新建项目',
        'wb.upgrade': '将当前工作升级',
        'wb.landing': '这就是这个流程的步骤。先开一个项目，或把当前工作升级上来，监控条才会出现并跟着走。',
        'wb.projects': '项目',
        'wb.pickProject': '选择一个项目',
        'wb.moduleErrors': '有 {n} 个模块定义文件加载失败（见模块管理）。',
        'module.tender': '投标全流程',
        'module.delivery': '实施控制',
        'module.investment': '投资尽调',
        'create.close': '关闭',
        'create.titleAdopt': '将当前工作升级为专业项目',
        'create.titleNew': '新建{name}项目',
        'create.hintAdopt': '沿用当前会话工作区和已有正式成果，只补一张专业盘面。可选投标、实施、尽调或任意自建模块。',
        'create.hintNew': '使用现有对话执行内核，建立独立项目目录、明确资料边界并按专业流程推进。登记资料时可附企业工效表，有则优先于网络调研。',
        'create.whichModule': '升级到哪个专业模块？不会改写已有正式成果。',
        'create.step.module': '选择模块',
        'create.step.info': '项目信息',
        'create.step.folder': '项目文件夹',
        'create.step.files': '依据资料',
        'create.step.confirmAdopt': '确认升级',
        'create.step.confirmNew': '流程确认',
        'session.archive': '归档对话',
        'session.archiveTitle': '归档当前对话。完整记录在左侧「归档」里查看，归档后也可删除。',
        'session.archiveFailed': '归档失败',
        'session.delete': '删除对话',
        'session.deleteConfirm': '从侧栏和归档中移除？完整记录不再列出（本机日志仍保留）。',
        'session.deleteFailed': '删除失败',
        'archive.title': '归档',
        'archive.lead': '完成的工作区先归档，不占进行中列表。点开仍是完整对话记录；归档的工作区和对话都可以删除。',
        'archive.empty': '还没有归档。侧栏工作区菜单选「归档工作区」，或对单条会话选「归档会话」。',
        'archive.open': '打开完整记录',
        'archive.delete': '删除',
        'archive.ungrouped': '未分组',
        'archive.workspace': '归档工作区',
        'archive.workspaceConfirm': '归档后，这个工作区和里面的对话会从进行中列表移到「归档」。完整记录仍可打开，归档后也可以删除。',
        'archive.workspaceFailed': '工作区归档失败',
        'archive.workspaceLive': '工作区仍在进行中',
        'archive.workspaceEmpty': '这个工作区没有对话。',
        'archive.deleteWorkspace': '删除工作区',
        'archive.deleteWorkspaceConfirm': '删除这个工作区登记？目录和已归档对话还在。',
        'kb.title': '本地知识库',
        'kb.refresh': '刷新',
        'kb.reindexAll': '全部重建',
        'kb.reindexing': '重建中…',
        'kb.reindexTitle': '按原路径（若仍存在）重新切块并更新索引',
        'kb.import': '导入',
        'kb.tokenOk': 'Token 有效',
        'kb.tokenBad': 'Token 无效',
        'kb.mineruSaved': 'MinerU 已保存',
        'kb.mineruMissing': 'MinerU 未配置',
        'kb.mineruNeedRestart': 'MinerU 需重启宿主',
        'kb.path1Title': '路径一 · 本页导入',
        'kb.path1Body': '用「选择文件」或多选拖入。文件先落入下方原始文档区，不会自动解析。有文本层的 PDF 本机抽文本（快）；扫描件和复杂版式再点「解析入库」走 MinerU。MinerU 的 HTML 表会收成 Markdown 表；已入库的点「全部重建」即可。索引按文档自己的章/节/条/Clause 切。',
        'kb.path2Title': '路径二 · 对话导入知识库',
        'kb.path2Warn': '只把 PDF 丢进主对话、不说话，不会进知识库。贴上文件后发送下面这句：',
        'kb.path2After': '也能说：知识库、入库、知识包、准确整理、完整内容、全文转录。模型写好「…-知识包」文件夹后，右侧对该文件夹或 pack.json 右键「一键导入知识包」，立刻可检索。普通文件仍可右键「一键导入知识库」，和本页是同一套解析。',
        'kb.tplTitle': '用户模板 · 复刻版式',
        'kb.tplBody': '把你已经编好的较好文档入库为「用户模板」，再勾选「本次任务选用」。本轮业务稿复刻它的格式、大纲、章节顺序和内容深度；项目事实仍走规范、合同和本项目资料，不从模板抄数字、地名或合同号。文件名以「模板」结尾时，右侧一键入库会自动归入此类。',
        'kb.packTitle': '传递包 · 仅本应用',
        'kb.packBody': '每条知识库文件、用户模板、本机技能后面都可以「导出」成 .apkb。这是本应用密封的传递包，用 zip / Office / 记事本打不开。对方在本页点「导入传递包」，条目会回到原来的分类和子目录（例如规范 → COTO 2020）。',
        'kb.pickTitle': '选择文件后立刻出现在下方，不会自动解析',
        'kb.picking': '正在落入存储区…',
        'kb.pickFiles': '选择文件',
        'kb.importPackTitle': '导入 Agent Pi 传递包（.apkb），其他工具无法解析',
        'kb.importing': '导入中…',
        'kb.importPack': '导入传递包',
        'kb.parseTitle': '对已落入原始文档区的文件做解析并写入知识库',
        'kb.parsing': '解析中…',
        'kb.parseIn': '解析入库',
        'kb.category': '分类',
        'kb.customCategory': '自定义分类…',
        'kb.customCategoryPh': '自定义分类名',
        'kb.customNamePh': '自定义名称（可选，默认用文件名）',
        'kb.thisPick': '本次选择：{name}',
        'kb.multiHint': '支持多选。选完先落入原始文档区，不会自动解析。',
        'kb.parseFailed': '解析失败',
        'kb.stagedWait': '已落入原始文档区，等待解析入库',
        'kb.progress': '进度 {n}%',
        'kb.parsingChip': '解析中',
        'kb.failedChip': '失败',
        'kb.pendingChip': '待解析',
        'kb.retry': '重试',
        'kb.remove': '移除',
        'kb.landing': '已选中，正在落入原始文档区…',
        'kb.landingProgress': '正在落入原始文档区…',
        'kb.mineruSummary': 'MinerU Token（大文件 / 精度抽取）',
        'kb.mineruCurrent': '当前：{hint}。不回显全文。',
        'kb.mineruSavedHint': '已保存',
        'kb.mineruUnconfigured': '未配置。小于 10MB 可走免登录轻量接口；更大文件需要 Token。申请：https://mineru.net/apiManage/token',
        'kb.mineruOldHost': '当前窗口还是旧宿主，粘贴后点保存也不会落盘。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。',
        'kb.mineruTokenPh': '粘贴 MinerU Token 后点保存',
        'kb.saving': '保存中…',
        'kb.saveToken': '保存 Token',
        'kb.probeTitle': '向 MinerU 探测鉴权，不提交解析任务',
        'kb.probing': '验证中…',
        'kb.probe': '验证是否有效',
        'kb.clear': '清除',
        'kb.mineruOcr': '有文本层的 PDF 会关闭 OCR；扫描件才开 OCR。超过官方页数或体积上限时自动拆段、串行解析、合并成一条。',
        'kb.pastePath': '或粘贴已有文件路径',
        'kb.pastePathPh': '原文件路径、知识包文件夹，或 MinerU 产物文件夹',
        'kb.staging': '落入中…',
        'kb.stage': '落入存储区',
        'kb.searchPreview': '检索预览',
        'kb.searchPh': '关键词 / 条款号 / 表头（与模型 kb_search 相同的 MiniSearch BM25）',
        'kb.search': '检索',
        'kb.noHits': '无命中。',
        'kb.score': '分值 {n}',
        'kb.entries': '条目（{n} 个）',
        'kb.entriesLead': '每行是一份原文档。点名称用右侧同一套文件预览打开解析稿 Markdown（可改，保存后重建切片）。分类下可建子目录归类（例如规范 → COTO 2020）；入库时能认出 COTO / COLTO / FIDIC 章节名会自动归入。每行「归入」可改挂到哪个节点。MinerU 表若仍露出 HTML 标签，点「全部重建」收成 Markdown 表。预览若是整页一段、词中空格，那是抽文本墙：回主对话贴上 PDF，发送「{say}」，或点「MinerU 重解析」。打勾「本次任务选用」即时生效。已选用 {n} 条。',
        'kb.empty': '知识库为空。预置方法标准与范文会在首次使用时自动入库；也可以在上方导入规范、范文，或把你编好的文档导入为用户模板。',
        'kb.taskSelect': '本次任务选用',
        'kb.openPreview': '打开解析稿预览',
        'kb.ready': '已入知识库',
        'kb.fidelityTitle': '索引只存条款地址；阅读时从解析稿按偏移切片',
        'kb.inTask': '本次任务',
        'kb.seeded': '预置',
        'kb.home': '归入',
        'kb.homeTitle': '归入子目录',
        'kb.unfiled': '未归类',
        'kb.newFolder': '新建子目录…',
        'kb.reparseMineru': 'MinerU 重解析',
        'kb.reparseTitle': '跳过本机文本层，用 MinerU 重做排版稿并重建切片',
        'kb.export': '导出',
        'kb.exportTitle': '导出为本应用传递包（.apkb），其他工具无法打开',
        'kb.delete': '删除',
        'kb.count': '{n} 个',
        'kb.addFolder': '新增子目录',
        'kb.addFolderTitle': '在此分类下新建子目录，用来归类入库文件',
        'kb.folderOk': '新建',
        'kb.folderCancel': '取消',
        'kb.confirmOk': '确定',
        'kb.exportFolder': '导出此目录',
        'kb.exportFolderTitle': '把此子目录下已入库文件打成一个传递包',
        'kb.deleteFolder': '删除子目录',
        'kb.deleteFolderTitle': '删除子目录，文件留在本分类下',
        'kb.emptyFolder': '空目录。用文件行的「归入」挂进来。',
        'kb.skills': '本机技能（{n} 个）',
        'kb.skillsLead': '这里是你装在本机技能目录里的方法（$DSH_HOME/skills），不是出厂捆绑技能。导出同样打成 .apkb，对方导入后热加载，不用重装应用。',
        'kb.skillsEmpty': '还没有本机技能。把方法沉淀成技能后会出现在这里。',
        'kb.exportSkillTitle': '导出为本应用传递包',
        'kb.oldHostMineru': '当前窗口还是旧宿主：MinerU Token 保存不会落盘。请关掉 Agent Pi DSH 再打开（刷新不够）。',
        'kb.ingestedOk': '知识库入库成功：{names}',
        'kb.transferEntries': '{n} 个知识条目',
        'kb.transferSkills': '{n} 个技能',
        'kb.transferEmpty': '空',
        'kb.transferImported': '已导入传递包：{parts}{detail}',
        'kb.transferSaved': '传递包已写入本机。只可用 Agent Pi DSH 打开 .apkb。',
        'kb.stagedNotice': '已落入原始文档区：{name}。点「解析入库」开始处理。',
        'kb.skipUnchanged': '内容未变化，已选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.replacedTask': '已重建并选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.ingestedTask': '已入库并选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.needFile': '请先选择要入库的文件',
        'kb.badTypes': '请选择 PDF、Word、Excel、PPT、图片、.md / .txt / .json，或本应用传递包 .apkb。',
        'kb.skippedTypes': '已跳过不支持的格式：{names}',
        'kb.needToken': '请填写 MinerU Token',
        'kb.saveNoDisk': '保存没有写到本机。刷新不够，当前窗口还是旧宿主。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。',
        'kb.oldHostSave': '当前窗口还是旧宿主，Token 接口还不存在。请关掉 Agent Pi DSH 再打开后再保存（刷新不够）。',
        'kb.needTokenOrSave': '请先粘贴 Token，或先保存后再验证',
        'kb.probeMissing': '验证接口还不存在。请关掉 Agent Pi DSH 再打开后再试（刷新不够）。',
        'kb.cleared': '已清除本机 MinerU Token',
        'kb.clearFailed': '清除失败。当前窗口还是旧宿主，请关掉 Agent Pi DSH 再打开。',
        'kb.parseRetry': '解析失败，请重新选择该文件入库',
        'kb.deleteEntryConfirm': '删除知识库条目「{name}」？索引与托管副本会一起删除{seeded}。',
        'kb.deleteSeeded': '；预置条目删除后不会自动恢复',
        'kb.deleted': '已删除 {slug}',
        'kb.reindexed': '已重建 {n} 个条目{missing}',
        'kb.missingSrc': '；缺源：{list}',
        'kb.folderPrompt': '子目录名称，例如 COTO 2020',
        'kb.folderCreated': '已新增子目录「{name}」',
        'kb.deleteFolderConfirm': '删除子目录「{name}」？文件仍留在「{category}」下，不会删文件。',
        'kb.folderDeleted': '已删除子目录「{name}」',
        'kb.exported': '已导出传递包 {name}。只可用本应用导入，其他工具打不开。',
        'kb.newFolderPrompt': '新建子目录，例如 COTO 2020',
        'kb.parseStarted': '已开始解析 {n} 个文件。MinerU 可能较久，请看下方进度。',
        'kb.parseNone': '没有新的解析任务。',
        'kb.cat.规范': '规范',
        'kb.cat.合同': '合同',
        'kb.cat.范文': '范文',
        'kb.cat.方法标准': '方法标准',
        'kb.cat.用户模板': '用户模板',
        'kb.cat.用户模版': '用户模板',
        'kb.cat.自定义': '自定义',
        'kb.cat.未分类': '未分类',
        'kb.hint.用户模板': '勾选后，本轮写作复刻其格式、大纲与内容深度',
        'mm.title': '模块管理',
        'mm.lead': '本页用来看已上线的模块、开关和拷贝。新模块不要在这里填字段，到下面的创造模式进对话。',
        'mm.lead2': '内置投标不会被改写。进行中的老项目不会自动改盘面。',
        'mm.designTitle': '回到对话，用人机交互生成完整工作台模块包',
        'mm.design': '去对话里创造',
        'mm.createTitle': '模块创造模式',
        'mm.createLead': '不要先导入 JSON。点下面一条路，本应用会进入 DSH 原生「创造模式」，用对话把这次做成的成果和修订经验沉淀为完整业务模块包：顶栏、阶段监控、资料登记、流程控制、配套方法和知识库。',
        'mm.createWarn': '原生创造模式只是创作驾驶舱，最终保存的是专业工作台业务模块，不会改 DSH 官方预设。当前对话为空时原地切换；已有历史时会新建创造模式对话。',
        'mm.createAdvanced': '只有已经拿到本应用校验过的模块定义时，才在这里粘贴。普通使用请走上面的创造对话。',
        'mm.packNotJson': '完整模块包，不是一段 JSON',
        'mm.pickKind': '选你们属于哪一种。选完回到对话，用大白话问一两句；模型直接装上，你不用粘贴定义。',
        'mm.card.distill': '做过一单，照这个来',
        'mm.card.distillBody': '把这次对话里已经认可的成果，整理成以后同类工作的标准。范文进知识库，做法记下来。',
        'mm.card.copy': '步骤和投标全流程一样，规矩不同',
        'mm.card.copyBody': '沿用当前投标流程的阶段和人工确认门禁，拷贝一份，再挂上你们的评分办法、组价表或投标函。',
        'mm.card.custom': '步骤就不一样',
        'mm.card.customBody': '例如先资格再技术再商务、没有组价。用中文说清几步，新标签和监控条按这几步画。',
        'mm.advanced': '高级 · 粘贴模块定义（开发者）',
        'mm.installing': '安装中…',
        'mm.install': '校验并安装',
        'mm.copyTitle': '拷贝为自建模块',
        'mm.copyLead': '从「{name}」复制阶段、技能和总报告门槛。内置投标不会被改写；副本保存后立刻出现在顶栏，并可继续改阶段。',
        'mm.labelZh': '中文名',
        'mm.moduleId': '模块 id（小写英文，不能用 tender / delivery / investment）',
        'mm.cancel': '取消',
        'mm.copying': '拷贝中…',
        'mm.copyOpen': '拷贝并打开编辑器',
        'mm.copyLive': '拷贝并上线',
        'mm.editTitle': '编辑模块 · {name}',
        'mm.editLead': '可增删改阶段、调整顺序和总报告门槛。保存即覆盖这份自建定义。进行中项目不会自动迁盘面。',
        'mm.labelEn': '英文名（可选）',
        'mm.setupStage': '开工阶段',
        'mm.kbPack': '规范包',
        'mm.kbPackLead': '挂你们公司的规范、组价表、投标函范文。不改阶段结构。勾选后阶段稿只点名这些知识库条目，不再带出厂范文的磁盘路径。',
        'mm.kbOwnOnly': '只用勾选的知识库（不带出厂范文）',
        'mm.kbEmpty': '知识库还是空的。先到「知识库」页导入规范或范文，再回到这里勾选。',
        'mm.area.analysis': '解析 / 资料阶段',
        'mm.area.pricing': '组价阶段',
        'mm.area.planning': '策划出稿阶段',
        'mm.stageN': '阶段 {n}',
        'mm.moveUp': '上移',
        'mm.moveDown': '下移',
        'mm.deleteStage': '删除阶段',
        'mm.stageId': '阶段 id（小写英文）',
        'mm.stageZh': '阶段中文名',
        'mm.stageHint': '一句话提示',
        'mm.stagePrompt': '阶段要求（写给模型看）',
        'mm.skillSlugs': '技能 slug（逗号分隔）',
        'mm.reviewSlugs': '评审技能 slug（逗号分隔，可空）',
        'mm.reviewPolicy': '审查范围',
        'mm.reviewRisk': '按风险 / 变更 / 抽样审查',
        'mm.reviewAll': '逐文件全部审查',
        'mm.approvalGate': '本阶段需要人工确认后才能继续',
        'mm.approvalPrompt': '确认事项（显示给用户）',
        'mm.approveLabel': '确认按钮文字',
        'mm.rejectLabel': '暂停 / 退回按钮文字（可空）',
        'mm.binding': '知识库绑定',
        'mm.bindNone': '不绑定',
        'mm.bindAnalysis': '解析 analysis',
        'mm.bindPricing': '组价 pricing',
        'mm.bindPlanning': '策划 planning',
        'mm.listsSources': '按册/同名打包任务（pdf+docx 算一份）',
        'mm.summaryFile': '总报告文件名（空=不设门槛）',
        'mm.summaryOutline': '总报告大纲（一行一条）',
        'mm.addStage': '新增阶段',
        'mm.saving': '保存中…',
        'mm.saveLive': '保存并上线',
        'mm.list': '模块（{n}）',
        'mm.builtin': '内置',
        'mm.custom': '自建',
        'mm.stageCount': '{n} 个阶段',
        'mm.collapse': '收起阶段',
        'mm.expand': '查看阶段',
        'mm.copyThenEdit': '拷贝后编辑',
        'mm.editStages': '编辑阶段',
        'mm.copyAsCustom': '拷贝为自建',
        'mm.defFile': '定义文件',
        'mm.defFileTitle': '在文件管理器中查看定义文件',
        'mm.delete': '删除',
        'mm.enable': '启用',
        'mm.disable': '停用',
        'mm.noStages': '此模块没有阶段定义',
        'mm.loadFailed': '加载失败的定义文件',
        'mm.enabled': '已启用 {name}',
        'mm.disabled': '已停用 {name}',
        'mm.deleteConfirm': '删除自建模块「{name}」？该模块下已有项目会失去流程定义（数据保留）。',
        'mm.deleted': '已删除 {id}',
        'mm.jsonFail': 'JSON 解析失败：{err}',
        'mm.installed': '已安装模块 {id}',
        'mm.copySuffix': '（副本）',
        'mm.copied': '已拷贝为自建模块 {id}，顶栏现已可见',
        'mm.builtinLocked': '内置模块不能直接改。先拷贝一份自建模块，再改副本的阶段。进行中项目不会自动迁过去。',
        'mm.saveConfirm': '保存后立即生效。改阶段 id 不会自动迁移进行中项目的盘面。',
        'mm.saved': '已保存模块 {id}',
        'mm.markLists': '按册/同名打包任务',
        'mm.markSummary': '总报告：{name}',
        'mm.markSkills': '技能 {list}',
        'mm.markReview': '评审 {list}',
        'lang.zh': '中文',
        'lang.en': 'English',
        'lang.title': '语言',
        'lang.switchFailed': '语言切换失败，请重试',
      },
      en: {
        'workbench.title': 'Workbench',
        'files.openExplorer': 'Open in File Explorer',
        'files.opening': 'Opening File Explorer…',
        'files.openFailed': 'Could not open folder',
        'files.noCwd': 'No workspace path yet',
        'files.uploadFiles': 'Upload files',
        'files.uploadFolder': 'Upload folder',
        'files.title': 'Files',
        'files.official': 'Work results',
        'files.officialName': 'Official Outputs',
        'files.officialEmpty': 'No official outputs yet. Edited reports and maps from this session are copied here automatically.',
        'files.officialHint': 'Official outputs from the session and workbench appear here. The model does not pick this folder.',
        'files.workspace': 'Workspace',
        'files.uploads': 'Uploads',
        'files.pickWorkspace': 'Choose a workspace first',
        'files.collapse': 'Collapse files',
        'files.expand': 'Expand files',
        'files.refresh': 'Refresh',
        'files.addFolder': 'Add a folder path (do not upload the files)',
        'files.resize': 'Drag to resize',
        'nav.kb': 'Knowledge base',
        'nav.kbTitle': 'Local knowledge base: specs, contracts, exemplars, and user templates, indexed by document structure',
        'wb.back': 'Back to chat',
        'wb.noCwd': 'No workspace selected. Chat still uses the default path; the workbench only speeds up stage prep.',
        'wb.kb': 'Knowledge base',
        'wb.kbTitle': 'Shared specs, contracts, exemplars, and user templates. Checked user templates set this round’s format and depth.',
        'wb.modules': 'Modules',
        'wb.modulesTitle': 'Review live modules. Create new ones in chat; do not start by importing JSON.',
        'wb.refresh': 'Refresh',
        'wb.adopt': 'Upgrade current work',
        'wb.adoptTitle': 'Register this session workspace as a project in the selected module. No new folder is created.',
        'wb.create': 'New project',
        'wb.upgrade': 'Upgrade current work',
        'wb.landing': 'These are the steps for this workflow. Start a project or upgrade the current work so the monitor bar appears and stays in sync.',
        'wb.projects': 'Projects',
        'wb.pickProject': 'Select a project',
        'wb.moduleErrors': '{n} module definition file(s) failed to load. See Modules.',
        'module.tender': 'Tender process',
        'module.delivery': 'Delivery control',
        'module.investment': 'Investment review',
        'create.close': 'Close',
        'create.titleAdopt': 'Upgrade current work to a professional project',
        'create.titleNew': 'New {name} project',
        'create.hintAdopt': 'Keep this session workspace and existing official outputs. Add a professional board only. Choose tender, delivery, investment review, or any custom module.',
        'create.hintNew': 'Use the current chat runtime. Create a separate project folder, set the source boundary, and follow the professional workflow. You may attach an enterprise productivity file; it outranks web research.',
        'create.whichModule': 'Which module should this work join? Existing official outputs stay as they are.',
        'create.step.module': 'Choose module',
        'create.step.info': 'Project info',
        'create.step.folder': 'Project folder',
        'create.step.files': 'Source files',
        'create.step.confirmAdopt': 'Confirm upgrade',
        'create.step.confirmNew': 'Confirm workflow',
        'session.archive': 'Archive conversation',
        'session.archiveTitle': 'Archive this conversation. Open the full record from Archive in the sidebar. You can still delete it after archiving.',
        'session.archiveFailed': 'Could not archive',
        'session.delete': 'Delete conversation',
        'session.deleteConfirm': 'Remove it from the sidebar and Archive? The log stays on disk but will no longer be listed.',
        'session.deleteFailed': 'Could not delete',
        'archive.title': 'Archive',
        'archive.lead': 'Archive finished workspaces so they leave the live list. Open a row to read the full conversation. You can still delete archived workspaces and chats.',
        'archive.empty': 'Nothing archived yet. Choose Archive workspace in the sidebar menu, or Archive session on a single chat.',
        'archive.open': 'Open full record',
        'archive.delete': 'Delete',
        'archive.ungrouped': 'Ungrouped',
        'archive.workspace': 'Archive workspace',
        'archive.workspaceConfirm': 'Archive this workspace? It and its conversations will move from the live list to Archive. You can still open the full records or delete them later.',
        'archive.workspaceFailed': 'Could not archive the workspace',
        'archive.workspaceLive': 'Workspace is still active',
        'archive.workspaceEmpty': 'This workspace has no conversations.',
        'archive.deleteWorkspace': 'Delete workspace',
        'archive.deleteWorkspaceConfirm': 'Remove this workspace from the list? The folder and archived conversations stay on disk.',
        'kb.title': 'Local knowledge base',
        'kb.refresh': 'Refresh',
        'kb.reindexAll': 'Rebuild all',
        'kb.reindexing': 'Rebuilding…',
        'kb.reindexTitle': 'Recut chunks from the original path (if it still exists) and refresh the index',
        'kb.import': 'Import',
        'kb.tokenOk': 'Token valid',
        'kb.tokenBad': 'Token invalid',
        'kb.mineruSaved': 'MinerU saved',
        'kb.mineruMissing': 'MinerU not configured',
        'kb.mineruNeedRestart': 'Restart the host to use MinerU',
        'kb.path1Title': 'Path 1 · Import on this page',
        'kb.path1Body': 'Use Choose files or drop several files here. They land in the staging area below and are not parsed yet. PDFs with a text layer are extracted locally (fast). Scans and complex layouts wait for Parse into library, which uses MinerU. MinerU HTML tables become Markdown tables; already imported entries only need Rebuild all. The index cuts on the document’s own chapters, sections, and clauses.',
        'kb.path2Title': 'Path 2 · Import from chat',
        'kb.path2Warn': 'Dropping a PDF into the main chat without a message does not add it to the knowledge base. After attaching the file, send this line:',
        'kb.path2After': 'You can also say: 知识库, 入库, 知识包, 准确整理, 完整内容, 全文转录. After the model writes a “…-知识包” folder, right-click that folder or pack.json in the files rail and choose Import knowledge pack. It is searchable immediately. Ordinary files can still use Import to knowledge base — the same parser as this page.',
        'kb.tplTitle': 'User templates · Match the layout',
        'kb.tplBody': 'Import a document you already wrote well as a User template, then check Use in this task. This round’s draft copies its format, outline, section order, and depth. Project facts still come from specs, contracts, and this project’s files — do not copy numbers, place names, or contract numbers from the template. A file name ending in “模板” or “template” is filed here automatically from the files rail.',
        'kb.packTitle': 'Transfer pack · This app only',
        'kb.packBody': 'Every knowledge file, user template, and local skill can Export to .apkb. That is a sealed pack for this app; zip, Office, and Notepad cannot open it. The other person chooses Import transfer pack on this page, and entries return to their original category and folder (for example Specs → COTO 2020).',
        'kb.pickTitle': 'Chosen files appear below immediately and are not parsed yet',
        'kb.picking': 'Saving to storage…',
        'kb.pickFiles': 'Choose files',
        'kb.importPackTitle': 'Import an Agent Pi transfer pack (.apkb). Other tools cannot read it.',
        'kb.importing': 'Importing…',
        'kb.importPack': 'Import transfer pack',
        'kb.parseTitle': 'Parse files already in the staging area and write them into the knowledge base',
        'kb.parsing': 'Parsing…',
        'kb.parseIn': 'Parse into library',
        'kb.category': 'Category',
        'kb.customCategory': 'Custom category…',
        'kb.customCategoryPh': 'Custom category name',
        'kb.customNamePh': 'Custom name (optional; defaults to the file name)',
        'kb.thisPick': 'This selection: {name}',
        'kb.multiHint': 'Multiple files are allowed. They land in the staging area first and are not parsed yet.',
        'kb.parseFailed': 'Parse failed',
        'kb.stagedWait': 'In the staging area, waiting to be parsed',
        'kb.progress': 'Progress {n}%',
        'kb.parsingChip': 'Parsing',
        'kb.failedChip': 'Failed',
        'kb.pendingChip': 'Pending',
        'kb.retry': 'Retry',
        'kb.remove': 'Remove',
        'kb.landing': 'Selected, saving to the staging area…',
        'kb.landingProgress': 'Saving to the staging area…',
        'kb.mineruSummary': 'MinerU token (large files / high-accuracy extract)',
        'kb.mineruCurrent': 'Current: {hint}. The full token is not shown again.',
        'kb.mineruSavedHint': 'Saved',
        'kb.mineruUnconfigured': 'Not configured. Files under 10MB can use the anonymous light API; larger files need a token. Apply at https://mineru.net/apiManage/token',
        'kb.mineruOldHost': 'This window is still the old host. Saving a token here will not persist. Quit Agent Pi DSH completely, open it again, then paste and save.',
        'kb.mineruTokenPh': 'Paste the MinerU token, then save',
        'kb.saving': 'Saving…',
        'kb.saveToken': 'Save token',
        'kb.probeTitle': 'Check MinerU authentication. This does not start a parse job.',
        'kb.probing': 'Checking…',
        'kb.probe': 'Check token',
        'kb.clear': 'Clear',
        'kb.mineruOcr': 'PDFs with a text layer skip OCR; scanned pages turn OCR on. Files over the official page or size limit are split, parsed in series, and merged into one entry.',
        'kb.pastePath': 'Or paste an existing file path',
        'kb.pastePathPh': 'Original file path, knowledge-pack folder, or MinerU output folder',
        'kb.staging': 'Saving…',
        'kb.stage': 'Save to storage',
        'kb.searchPreview': 'Search preview',
        'kb.searchPh': 'Keyword / clause number / table header (same MiniSearch BM25 as kb_search)',
        'kb.search': 'Search',
        'kb.noHits': 'No hits.',
        'kb.score': 'Score {n}',
        'kb.entries': 'Entries ({n})',
        'kb.entriesLead': 'Each row is one source document. Click the name to open the parsed Markdown in the same files preview on the right (you can edit it; save rebuilds the chunks). Categories can have folders (for example Specs → COTO 2020). Import can file COTO / COLTO / FIDIC chapter names automatically. Use File under on a row to change the folder. If MinerU tables still show HTML tags, choose Rebuild all to turn them into Markdown tables. If the preview is one wall of text with spaces inside words, that is a raw text extract: attach the PDF in the main chat and send “{say}”, or choose Reparse with MinerU. Checking Use in this task takes effect immediately. {n} selected.',
        'kb.empty': 'The knowledge base is empty. Preset method standards and exemplars are imported on first use. You can also import specs or exemplars above, or import a document you already wrote as a user template.',
        'kb.taskSelect': 'Use in this task',
        'kb.openPreview': 'Open the parsed markdown preview',
        'kb.ready': 'In library',
        'kb.fidelityTitle': 'The index stores clause addresses only. Reading slices the parsed manuscript by offset.',
        'kb.inTask': 'This task',
        'kb.seeded': 'Preset',
        'kb.home': 'File under',
        'kb.homeTitle': 'Move into a folder',
        'kb.unfiled': 'Unfiled',
        'kb.newFolder': 'New folder…',
        'kb.reparseMineru': 'Reparse with MinerU',
        'kb.reparseTitle': 'Skip the local text layer. Rebuild the layout manuscript and chunks with MinerU.',
        'kb.export': 'Export',
        'kb.exportTitle': 'Export as an app transfer pack (.apkb). Other tools cannot open it.',
        'kb.delete': 'Delete',
        'kb.count': '{n}',
        'kb.addFolder': 'Add folder',
        'kb.addFolderTitle': 'Create a folder in this category to group imported files',
        'kb.folderOk': 'Create',
        'kb.folderCancel': 'Cancel',
        'kb.confirmOk': 'OK',
        'kb.exportFolder': 'Export this folder',
        'kb.exportFolderTitle': 'Pack the imported files in this folder into one transfer pack',
        'kb.deleteFolder': 'Delete folder',
        'kb.deleteFolderTitle': 'Delete the folder. Files stay in this category.',
        'kb.emptyFolder': 'Empty folder. Use File under on a file row to move it here.',
        'kb.skills': 'Local skills ({n})',
        'kb.skillsLead': 'These are methods in your local skills folder ($DSH_HOME/skills), not factory-bundled skills. Export also writes .apkb. The other person can import and hot-load them without reinstalling the app.',
        'kb.skillsEmpty': 'No local skills yet. Methods saved as skills appear here.',
        'kb.exportSkillTitle': 'Export as an app transfer pack',
        'kb.oldHostMineru': 'This window is still the old host: saving a MinerU token will not persist. Quit Agent Pi DSH completely and open it again (refresh is not enough).',
        'kb.ingestedOk': 'Imported into the knowledge base: {names}',
        'kb.transferEntries': '{n} knowledge entries',
        'kb.transferSkills': '{n} skills',
        'kb.transferEmpty': 'empty',
        'kb.transferImported': 'Imported transfer pack: {parts}{detail}',
        'kb.transferSaved': 'The transfer pack is on this machine. Only Agent Pi DSH can open .apkb files.',
        'kb.stagedNotice': 'Saved to the staging area: {name}. Choose Parse into library to start.',
        'kb.skipUnchanged': 'Content unchanged. Selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.replacedTask': 'Rebuilt and selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.ingestedTask': 'Imported and selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.needFile': 'Choose a file to import first',
        'kb.badTypes': 'Choose a PDF, Word, Excel, PowerPoint, image, .md / .txt / .json, or an .apkb transfer pack.',
        'kb.skippedTypes': 'Skipped unsupported formats: {names}',
        'kb.needToken': 'Enter a MinerU token',
        'kb.saveNoDisk': 'The save did not reach disk. Refresh is not enough; this window is still the old host. Quit Agent Pi DSH, open it again, then paste and save.',
        'kb.oldHostSave': 'This window is still the old host, so the token API is missing. Quit Agent Pi DSH, open it again, then save (refresh is not enough).',
        'kb.needTokenOrSave': 'Paste a token first, or save it before checking',
        'kb.probeMissing': 'The check API is missing. Quit Agent Pi DSH, open it again, then retry (refresh is not enough).',
        'kb.cleared': 'Cleared the local MinerU token',
        'kb.clearFailed': 'Could not clear. This window is still the old host. Quit Agent Pi DSH and open it again.',
        'kb.parseRetry': 'Parse failed. Choose the file again to import.',
        'kb.deleteEntryConfirm': 'Delete knowledge entry “{name}”? The index and hosted copy are removed{seeded}.',
        'kb.deleteSeeded': '; a preset entry will not come back automatically',
        'kb.deleted': 'Deleted {slug}',
        'kb.reindexed': 'Rebuilt {n} entries{missing}',
        'kb.missingSrc': '; missing source: {list}',
        'kb.folderPrompt': 'Folder name, for example COTO 2020',
        'kb.folderCreated': 'Created folder “{name}”',
        'kb.deleteFolderConfirm': 'Delete folder “{name}”? Files stay under “{category}”. Files are not deleted.',
        'kb.folderDeleted': 'Deleted folder “{name}”',
        'kb.exported': 'Exported transfer pack {name}. Only this app can import it.',
        'kb.newFolderPrompt': 'New folder name, for example COTO 2020',
        'kb.parseStarted': 'Started parsing {n} file(s). MinerU can take a while; watch the progress below.',
        'kb.parseNone': 'No new parse jobs.',
        'kb.cat.规范': 'Specs',
        'kb.cat.合同': 'Contracts',
        'kb.cat.范文': 'Exemplars',
        'kb.cat.方法标准': 'Method standards',
        'kb.cat.用户模板': 'User templates',
        'kb.cat.用户模版': 'User templates',
        'kb.cat.自定义': 'Custom',
        'kb.cat.未分类': 'Uncategorized',
        'kb.hint.用户模板': 'When checked, this round copies its format, outline, and depth',
        'mm.title': 'Modules',
        'mm.lead': 'Review live modules, toggle them, and copy them. Do not fill fields here for a new module. Use Create mode below to continue in chat.',
        'mm.lead2': 'Built-in tender is not rewritten. Live projects do not migrate their boards automatically.',
        'mm.designTitle': 'Return to chat and generate a complete workbench module pack through conversation',
        'mm.design': 'Create in chat',
        'mm.createTitle': 'Module create mode',
        'mm.createLead': 'Do not start by importing JSON. Pick a path below and this app opens DSH native Create mode, where conversation distils accepted outputs and revision experience into a complete business module pack: top bar, stage monitor, source registration, workflow gates, methods, and knowledge.',
        'mm.createWarn': 'Native Create mode is the authoring cockpit; the saved product is a professional-workbench business module and never edits a shipped DSH preset. A blank chat switches in place; a chat with history opens a new Create-mode session.',
        'mm.createAdvanced': 'Paste here only when you already have a module definition this app has validated. Everyday use should go through the create conversation above.',
        'mm.packNotJson': 'A complete module pack, not a JSON snippet',
        'mm.pickKind': 'Pick the case that matches you. Then return to chat and ask in plain language. The model installs it; you do not paste a definition.',
        'mm.card.distill': 'We finished one job — use this as the standard',
        'mm.card.distillBody': 'Turn the accepted results from this chat into the standard for later work of the same kind. Exemplars go to the knowledge base; the method is written down.',
        'mm.card.copy': 'Same steps as Tender process, different rules',
        'mm.card.copyBody': 'Keep the current tender stages and human-approval gates, then attach your scoring rules, rate tables, or letters to a copy.',
        'mm.card.custom': 'The steps are different',
        'mm.card.customBody': 'For example qualification, then technical, then commercial — no pricing. Say the steps in plain language. The new tab and monitor bar follow those steps.',
        'mm.advanced': 'Advanced · Paste a module definition (developers)',
        'mm.installing': 'Installing…',
        'mm.install': 'Validate and install',
        'mm.copyTitle': 'Copy as a custom module',
        'mm.copyLead': 'Copy stages, skills, and summary-report gates from “{name}”. Built-in tender is not rewritten. The copy appears in the top bar as soon as it is saved, and you can keep editing stages.',
        'mm.labelZh': 'Chinese name',
        'mm.moduleId': 'Module id (lowercase English; cannot be tender, delivery, or investment)',
        'mm.cancel': 'Cancel',
        'mm.copying': 'Copying…',
        'mm.copyOpen': 'Copy and open editor',
        'mm.copyLive': 'Copy and go live',
        'mm.editTitle': 'Edit module · {name}',
        'mm.editLead': 'Add, remove, or edit stages, reorder them, and set summary-report gates. Saving overwrites this custom definition. Live projects do not migrate their boards.',
        'mm.labelEn': 'English name (optional)',
        'mm.setupStage': 'Kickoff stage',
        'mm.kbPack': 'Spec pack',
        'mm.kbPackLead': 'Attach your company specs, rate tables, and letter exemplars. Stage structure stays the same. When checked, stage drafts name only these knowledge entries and no longer carry factory exemplar disk paths.',
        'mm.kbOwnOnly': 'Use only the checked knowledge entries (no factory exemplars)',
        'mm.kbEmpty': 'The knowledge base is still empty. Import specs or exemplars on the Knowledge base page, then come back and check them.',
        'mm.area.analysis': 'Analysis / source stage',
        'mm.area.pricing': 'Pricing stage',
        'mm.area.planning': 'Planning / drafting stage',
        'mm.stageN': 'Stage {n}',
        'mm.moveUp': 'Move up',
        'mm.moveDown': 'Move down',
        'mm.deleteStage': 'Delete stage',
        'mm.stageId': 'Stage id (lowercase English)',
        'mm.stageZh': 'Stage Chinese name',
        'mm.stageHint': 'One-line hint',
        'mm.stagePrompt': 'Stage requirements (for the model)',
        'mm.skillSlugs': 'Skill slugs (comma-separated)',
        'mm.reviewSlugs': 'Review skill slugs (comma-separated, optional)',
        'mm.reviewPolicy': 'Review scope',
        'mm.reviewRisk': 'Risk / change / sample review',
        'mm.reviewAll': 'Review every file',
        'mm.approvalGate': 'Require human approval before the next stage',
        'mm.approvalPrompt': 'Decision prompt shown to the user',
        'mm.approveLabel': 'Approve button label',
        'mm.rejectLabel': 'Pause / reject button label (optional)',
        'mm.binding': 'Knowledge binding',
        'mm.bindNone': 'None',
        'mm.bindAnalysis': 'Analysis',
        'mm.bindPricing': 'Pricing',
        'mm.bindPlanning': 'Planning',
        'mm.listsSources': 'Pack tasks by volume / same name (pdf+docx count as one)',
        'mm.summaryFile': 'Summary report file name (empty = no gate)',
        'mm.summaryOutline': 'Summary outline (one item per line)',
        'mm.addStage': 'Add stage',
        'mm.saving': 'Saving…',
        'mm.saveLive': 'Save and go live',
        'mm.list': 'Modules ({n})',
        'mm.builtin': 'Built-in',
        'mm.custom': 'Custom',
        'mm.stageCount': '{n} stages',
        'mm.collapse': 'Hide stages',
        'mm.expand': 'View stages',
        'mm.copyThenEdit': 'Copy then edit',
        'mm.editStages': 'Edit stages',
        'mm.copyAsCustom': 'Copy as custom',
        'mm.defFile': 'Definition file',
        'mm.defFileTitle': 'Reveal the definition file in File Explorer',
        'mm.delete': 'Delete',
        'mm.enable': 'Enable',
        'mm.disable': 'Disable',
        'mm.noStages': 'This module has no stages',
        'mm.loadFailed': 'Definition files that failed to load',
        'mm.enabled': 'Enabled {name}',
        'mm.disabled': 'Disabled {name}',
        'mm.deleteConfirm': 'Delete custom module “{name}”? Existing projects under it lose the workflow definition. Data is kept.',
        'mm.deleted': 'Deleted {id}',
        'mm.jsonFail': 'JSON parse failed: {err}',
        'mm.installed': 'Installed module {id}',
        'mm.copySuffix': ' (copy)',
        'mm.copied': 'Copied as custom module {id}. It is now in the top bar.',
        'mm.builtinLocked': 'Built-in modules cannot be edited directly. Copy one as a custom module, then edit the copy. Live projects do not migrate automatically.',
        'mm.saveConfirm': 'Saving takes effect immediately. Changing a stage id does not migrate live project boards.',
        'mm.saved': 'Saved module {id}',
        'mm.markLists': 'Pack tasks by volume / same name',
        'mm.markSummary': 'Summary: {name}',
        'mm.markSkills': 'Skills {list}',
        'mm.markReview': 'Review {list}',
        'lang.zh': '中文',
        'lang.en': 'English',
        'lang.title': 'Language',
        'lang.switchFailed': 'Could not switch language. Please try again.',
      },
    }
    const AP_LANGUAGE_DEFINITIONS = [
      { id: 'zh', label: '中文', documentLang: 'zh-CN', fallback: 'en' },
      { id: 'en', label: 'English', documentLang: 'en', fallback: 'en' },
      { id: 'es', label: 'Español', documentLang: 'es', fallback: 'en' },
      { id: 'fr', label: 'Français', documentLang: 'fr', fallback: 'en' },
      { id: 'de', label: 'Deutsch', documentLang: 'de', fallback: 'en' },
      { id: 'ja', label: '日本語', documentLang: 'ja', fallback: 'en' },
      { id: 'ko', label: '한국어', documentLang: 'ko', fallback: 'en' },
      { id: 'pt', label: 'Português', documentLang: 'pt', fallback: 'en' },
      { id: 'ru', label: 'Русский', documentLang: 'ru', fallback: 'en' },
      { id: 'ar', label: 'العربية', documentLang: 'ar', fallback: 'en', rtl: true },
    ]
    Object.assign(AP_I18N.zh, { 'codex.title': 'Codex 智能体' })
    Object.assign(AP_I18N.en, { 'codex.title': 'Codex Agent' })
    Object.assign(AP_I18N, {
      es: {
        'workbench.title': 'Espacio de trabajo', 'files.title': 'Archivos', 'files.official': 'Resultados',
        'files.workspace': 'Área de trabajo', 'files.uploads': 'Cargas', 'files.refresh': 'Actualizar',
        'files.collapse': 'Contraer archivos', 'files.expand': 'Expandir archivos', 'nav.kb': 'Base de conocimiento',
        'wb.back': 'Volver al chat', 'wb.kb': 'Base de conocimiento', 'wb.modules': 'Módulos', 'wb.refresh': 'Actualizar',
        'wb.adopt': 'Convertir trabajo actual', 'wb.create': 'Nuevo proyecto', 'wb.projects': 'Proyectos',
        'module.tender': 'Proceso de licitación', 'module.delivery': 'Control de ejecución', 'module.investment': 'Análisis de inversión',
        'create.close': 'Cerrar', 'session.archive': 'Archivar conversación', 'session.delete': 'Eliminar conversación',
        'archive.title': 'Archivo', 'archive.open': 'Abrir registro', 'archive.delete': 'Eliminar',
        'kb.title': 'Base de conocimiento local', 'kb.refresh': 'Actualizar', 'kb.import': 'Importar', 'kb.search': 'Buscar',
        'mm.title': 'Módulos', 'codex.title': 'Agente Codex', 'lang.title': 'Idioma',
      },
      fr: {
        'workbench.title': 'Espace de travail', 'files.title': 'Fichiers', 'files.official': 'Résultats',
        'files.workspace': 'Espace de travail', 'files.uploads': 'Téléversements', 'files.refresh': 'Actualiser',
        'files.collapse': 'Réduire les fichiers', 'files.expand': 'Développer les fichiers', 'nav.kb': 'Base de connaissances',
        'wb.back': 'Retour au chat', 'wb.kb': 'Base de connaissances', 'wb.modules': 'Modules', 'wb.refresh': 'Actualiser',
        'wb.adopt': 'Convertir le travail actuel', 'wb.create': 'Nouveau projet', 'wb.projects': 'Projets',
        'module.tender': "Processus d'appel d'offres", 'module.delivery': "Contrôle d'exécution", 'module.investment': "Analyse d'investissement",
        'create.close': 'Fermer', 'session.archive': 'Archiver la conversation', 'session.delete': 'Supprimer la conversation',
        'archive.title': 'Archives', 'archive.open': 'Ouvrir le dossier', 'archive.delete': 'Supprimer',
        'kb.title': 'Base de connaissances locale', 'kb.refresh': 'Actualiser', 'kb.import': 'Importer', 'kb.search': 'Rechercher',
        'mm.title': 'Modules', 'codex.title': 'Agent Codex', 'lang.title': 'Langue',
      },
      de: {
        'workbench.title': 'Arbeitsbereich', 'files.title': 'Dateien', 'files.official': 'Ergebnisse',
        'files.workspace': 'Arbeitsbereich', 'files.uploads': 'Uploads', 'files.refresh': 'Aktualisieren',
        'files.collapse': 'Dateien einklappen', 'files.expand': 'Dateien ausklappen', 'nav.kb': 'Wissensbasis',
        'wb.back': 'Zurück zum Chat', 'wb.kb': 'Wissensbasis', 'wb.modules': 'Module', 'wb.refresh': 'Aktualisieren',
        'wb.adopt': 'Aktuelle Arbeit übernehmen', 'wb.create': 'Neues Projekt', 'wb.projects': 'Projekte',
        'module.tender': 'Ausschreibungsprozess', 'module.delivery': 'Ausführungskontrolle', 'module.investment': 'Investitionsprüfung',
        'create.close': 'Schließen', 'session.archive': 'Unterhaltung archivieren', 'session.delete': 'Unterhaltung löschen',
        'archive.title': 'Archiv', 'archive.open': 'Datensatz öffnen', 'archive.delete': 'Löschen',
        'kb.title': 'Lokale Wissensbasis', 'kb.refresh': 'Aktualisieren', 'kb.import': 'Importieren', 'kb.search': 'Suchen',
        'mm.title': 'Module', 'codex.title': 'Codex-Agent', 'lang.title': 'Sprache',
      },
      ja: {
        'workbench.title': '専門ワークベンチ', 'files.title': 'ファイル', 'files.official': '成果物',
        'files.workspace': 'ワークスペース', 'files.uploads': 'アップロード', 'files.refresh': '更新',
        'files.collapse': 'ファイルを閉じる', 'files.expand': 'ファイルを開く', 'nav.kb': 'ナレッジベース',
        'wb.back': 'チャットに戻る', 'wb.kb': 'ナレッジベース', 'wb.modules': 'モジュール', 'wb.refresh': '更新',
        'wb.adopt': '現在の作業を登録', 'wb.create': '新規プロジェクト', 'wb.projects': 'プロジェクト',
        'module.tender': '入札プロセス', 'module.delivery': '施工管理', 'module.investment': '投資調査',
        'create.close': '閉じる', 'session.archive': '会話をアーカイブ', 'session.delete': '会話を削除',
        'archive.title': 'アーカイブ', 'archive.open': '記録を開く', 'archive.delete': '削除',
        'kb.title': 'ローカルナレッジベース', 'kb.refresh': '更新', 'kb.import': 'インポート', 'kb.search': '検索',
        'mm.title': 'モジュール', 'codex.title': 'Codex エージェント', 'lang.title': '言語',
      },
      ko: {
        'workbench.title': '전문 워크벤치', 'files.title': '파일', 'files.official': '작업 결과',
        'files.workspace': '작업 공간', 'files.uploads': '업로드', 'files.refresh': '새로 고침',
        'files.collapse': '파일 접기', 'files.expand': '파일 펼치기', 'nav.kb': '지식 베이스',
        'wb.back': '채팅으로 돌아가기', 'wb.kb': '지식 베이스', 'wb.modules': '모듈', 'wb.refresh': '새로 고침',
        'wb.adopt': '현재 작업 등록', 'wb.create': '새 프로젝트', 'wb.projects': '프로젝트',
        'module.tender': '입찰 프로세스', 'module.delivery': '시공 관리', 'module.investment': '투자 검토',
        'create.close': '닫기', 'session.archive': '대화 보관', 'session.delete': '대화 삭제',
        'archive.title': '보관함', 'archive.open': '기록 열기', 'archive.delete': '삭제',
        'kb.title': '로컬 지식 베이스', 'kb.refresh': '새로 고침', 'kb.import': '가져오기', 'kb.search': '검색',
        'mm.title': '모듈', 'codex.title': 'Codex 에이전트', 'lang.title': '언어',
      },
      pt: {
        'workbench.title': 'Área de trabalho', 'files.title': 'Arquivos', 'files.official': 'Resultados',
        'files.workspace': 'Área de trabalho', 'files.uploads': 'Envios', 'files.refresh': 'Atualizar',
        'files.collapse': 'Recolher arquivos', 'files.expand': 'Expandir arquivos', 'nav.kb': 'Base de conhecimento',
        'wb.back': 'Voltar ao chat', 'wb.kb': 'Base de conhecimento', 'wb.modules': 'Módulos', 'wb.refresh': 'Atualizar',
        'wb.adopt': 'Converter trabalho atual', 'wb.create': 'Novo projeto', 'wb.projects': 'Projetos',
        'module.tender': 'Processo de licitação', 'module.delivery': 'Controle de execução', 'module.investment': 'Análise de investimento',
        'create.close': 'Fechar', 'session.archive': 'Arquivar conversa', 'session.delete': 'Excluir conversa',
        'archive.title': 'Arquivo', 'archive.open': 'Abrir registro', 'archive.delete': 'Excluir',
        'kb.title': 'Base de conhecimento local', 'kb.refresh': 'Atualizar', 'kb.import': 'Importar', 'kb.search': 'Pesquisar',
        'mm.title': 'Módulos', 'codex.title': 'Agente Codex', 'lang.title': 'Idioma',
      },
      ru: {
        'workbench.title': 'Рабочая панель', 'files.title': 'Файлы', 'files.official': 'Результаты',
        'files.workspace': 'Рабочая область', 'files.uploads': 'Загрузки', 'files.refresh': 'Обновить',
        'files.collapse': 'Свернуть файлы', 'files.expand': 'Развернуть файлы', 'nav.kb': 'База знаний',
        'wb.back': 'Назад к чату', 'wb.kb': 'База знаний', 'wb.modules': 'Модули', 'wb.refresh': 'Обновить',
        'wb.adopt': 'Подключить текущую работу', 'wb.create': 'Новый проект', 'wb.projects': 'Проекты',
        'module.tender': 'Тендерный процесс', 'module.delivery': 'Контроль исполнения', 'module.investment': 'Инвестиционный анализ',
        'create.close': 'Закрыть', 'session.archive': 'Архивировать беседу', 'session.delete': 'Удалить беседу',
        'archive.title': 'Архив', 'archive.open': 'Открыть запись', 'archive.delete': 'Удалить',
        'kb.title': 'Локальная база знаний', 'kb.refresh': 'Обновить', 'kb.import': 'Импорт', 'kb.search': 'Поиск',
        'mm.title': 'Модули', 'codex.title': 'Агент Codex', 'lang.title': 'Язык',
      },
      ar: {
        'workbench.title': 'مساحة العمل', 'files.title': 'الملفات', 'files.official': 'النتائج',
        'files.workspace': 'مساحة العمل', 'files.uploads': 'التحميلات', 'files.refresh': 'تحديث',
        'files.collapse': 'طي الملفات', 'files.expand': 'توسيع الملفات', 'nav.kb': 'قاعدة المعرفة',
        'wb.back': 'العودة إلى المحادثة', 'wb.kb': 'قاعدة المعرفة', 'wb.modules': 'الوحدات', 'wb.refresh': 'تحديث',
        'wb.adopt': 'اعتماد العمل الحالي', 'wb.create': 'مشروع جديد', 'wb.projects': 'المشاريع',
        'module.tender': 'عملية المناقصة', 'module.delivery': 'مراقبة التنفيذ', 'module.investment': 'تحليل الاستثمار',
        'create.close': 'إغلاق', 'session.archive': 'أرشفة المحادثة', 'session.delete': 'حذف المحادثة',
        'archive.title': 'الأرشيف', 'archive.open': 'فتح السجل', 'archive.delete': 'حذف',
        'kb.title': 'قاعدة المعرفة المحلية', 'kb.refresh': 'تحديث', 'kb.import': 'استيراد', 'kb.search': 'بحث',
        'mm.title': 'الوحدات', 'codex.title': 'وكيل Codex', 'lang.title': 'اللغة',
      },
    })
    function localeIdOf(value) {
      const id = String(value || '').toLowerCase()
      const primary = id.split('-')[0]
      return AP_LANGUAGE_DEFINITIONS.some((language) => language.id === primary) ? primary : 'zh'
    }
    function initialApLang() {
      try {
        const stored = localStorage.getItem('agent-pi:language:v1')
        if (stored) return localeIdOf(stored)
      } catch {}
      try { return localeIdOf(navigator.language) } catch { return 'zh' }
    }
    const langState = { lang: initialApLang(), listeners: new Set() }
    function applyDocumentLanguage(next) {
      if (typeof document === 'undefined') return
      const language = AP_LANGUAGE_DEFINITIONS.find((entry) => entry.id === next) || AP_LANGUAGE_DEFINITIONS[0]
      document.documentElement.setAttribute('lang', language.documentLang)
      document.documentElement.setAttribute('dir', language.rtl ? 'rtl' : 'ltr')
    }
    function setApLang(lang) {
      const next = localeIdOf(lang)
      applyDocumentLanguage(next)
      try { localStorage.setItem('agent-pi:language:v1', next) } catch {}
      if (langState.lang === next) return
      langState.lang = next
      langState.listeners.forEach((fn) => fn(next))
    }
    applyDocumentLanguage(langState.lang)
    function tAp(key, vars) {
      const dict = AP_I18N[langState.lang] || AP_I18N.en
      const fallback = langState.lang === 'zh' ? AP_I18N.zh : AP_I18N.en
      let text = dict[key] || fallback[key] || key
      if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach((name) => {
          text = text.split('{' + name + '}').join(String(vars[name]))
        })
      }
      return text
    }
    function useApLang() {
      const [lang, setLang] = React.useState(langState.lang)
      React.useEffect(() => {
        langState.listeners.add(setLang)
        return () => langState.listeners.delete(setLang)
      }, [])
      return lang
    }
    // Built-in fallback only: the live module list (built-ins + user-created domains)
    // comes from the workbench snapshot / GET /api/agent-pi/modules.
    const MODULES = {
      tender: { id: 'tender', labelZh: '投标工作台', icon: 'clipboardCheck', builtin: true, disabled: false },
      delivery: { id: 'delivery', labelZh: '项目实施控制', icon: 'clipboardList', builtin: true, disabled: false },
      investment: { id: 'investment', labelZh: '资源投资研究', icon: 'landmark', builtin: true, disabled: false },
    }

    function moduleLabel(info) {
      if (!info) return ''
      if (info.id && AP_I18N.zh['module.' + info.id]) return tAp('module.' + info.id)
      if (langState.lang !== 'zh' && info.labelEn) return info.labelEn
      return info.labelZh || info.label || info.id || ''
    }

    function moduleIconNode(info, size) {
      const name = info && info.icon
      if (name && ICONS[name]) return Icon(name, size)
      if (name && /[^\x00-\x7F]/.test(name)) {
        return h('span', { className: 'ap-mod-emoji', style: { fontSize: (size || 15) + 'px' } }, name)
      }
      return Icon('clipboardCheck', size)
    }

    function moduleList(data) {
      const rows = data && Array.isArray(data.modules) && data.modules.length
        ? data.modules
        : Object.values(MODULES)
      return rows.filter((item) => !item.disabled)
    }

    function normPath(value) {
      return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '')
    }

    function pathMatches(sessionCwd, rootPath) {
      const a = normPath(sessionCwd)
      const b = normPath(rootPath)
      if (!a || !b) return false
      return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
    }

    function sessionHint(props) {
      return (props && (props.sessionId || (props.session && props.session.sessionId))) || ''
    }

    const codexTurnControllers = window.__apCodexTurnControllers || (window.__apCodexTurnControllers = new Map())
    const codexTurnListeners = window.__apCodexTurnListeners || (window.__apCodexTurnListeners = new Set())
    const attachmentTurnControllers = window.__apAttachmentTurnControllers || (window.__apAttachmentTurnControllers = new Map())
    function codexTurnKey(props) {
      return sessionHint(props) || runtime.sessionId || 'active'
    }
    function notifyCodexTurn() {
      codexTurnListeners.forEach((listener) => {
        try { listener() } catch { /* stale composer */ }
      })
    }
    function createCodexTurnController(latestProps) {
      return {
        phase: 'idle',
        latestProps: latestProps || null,
        attemptToken: null,
        originalDraft: '',
        framedDraft: '',
        capturedAttachmentIds: [],
        capturedAttachments: [],
        preSubmitUserNodeWatermark: -1,
        preSubmitPromptErrorRef: null,
        preSubmitPromptErrorToken: 'null',
        promptErrorBaselineCleared: false,
        lastInputPhase: null,
        lastInputDraftRev: null,
        sawSubmitting: false,
        acceptedDraft: null,
        acceptedDraftRev: null,
        cwd: '',
        inputStore: null,
        unsubscribeSession: null,
        unsubscribeInput: null,
      }
    }
    function codexTurnController(props, create) {
      const key = codexTurnKey(props)
      let controller = codexTurnControllers.get(key)
      if (!controller && create) {
        controller = createCodexTurnController(props)
        codexTurnControllers.set(key, controller)
      }
      return controller || null
    }
    function trackCodexTurnProps(props) {
      const controller = codexTurnControllers.get(codexTurnKey(props))
      if (controller && controller.phase !== 'disposed') controller.latestProps = props
    }
    function codexTurnPhase(props) {
      const controller = codexTurnController(props, false)
      return controller ? controller.phase : 'idle'
    }
    function codexTurnArmed(props) {
      const phase = codexTurnPhase(props)
      return phase === 'armed' || phase === 'preparing' || phase === 'submitting'
    }
    function setCodexTurnArmed(props, armed) {
      const key = codexTurnKey(props)
      if (armed && attachmentTurnControllers.has(key)) {
        showToast('当前会话已有附件发送事务，请等待完成后再切换 Codex 执行')
        return
      }
      const controller = codexTurnController(props, armed)
      if (!controller) return
      controller.latestProps = props
      if (armed && controller.phase === 'idle') {
        controller.phase = 'armed'
        watchCodexTurnSession(key, controller)
      }
      else if (!armed && controller.phase === 'armed') {
        resetCodexTurnAttempt(key, controller)
        disposeCodexTurnSessionSubscription(controller)
        controller.phase = 'idle'
      } else return
      notifyCodexTurn()
    }
    function disposeCodexTurnInputSubscription(controller) {
      const unsubscribeInput = controller.unsubscribeInput
      controller.unsubscribeInput = null
      if (typeof unsubscribeInput === 'function') {
        try { unsubscribeInput() } catch {}
      }
    }
    function disposeCodexTurnSessionSubscription(controller) {
      const unsubscribeSession = controller.unsubscribeSession
      controller.unsubscribeSession = null
      if (typeof unsubscribeSession === 'function') {
        try { unsubscribeSession() } catch {}
      }
    }
    function resetCodexTurnAttempt(key, controller) {
      cancelAttachmentTurnHost(key, controller)
      clearAttachmentTurnStatus(controller.attemptToken)
      disposeCodexTurnInputSubscription(controller)
      controller.attemptToken = null
      controller.originalDraft = ''
      controller.framedDraft = ''
      controller.capturedAttachmentIds = []
      controller.capturedAttachments = []
      controller.preSubmitUserNodeWatermark = -1
      controller.preSubmitPromptErrorRef = null
      controller.preSubmitPromptErrorToken = 'null'
      controller.promptErrorBaselineCleared = false
      controller.lastInputPhase = null
      controller.lastInputDraftRev = null
      controller.sawSubmitting = false
      controller.acceptedDraft = null
      controller.acceptedDraftRev = null
      controller.cwd = ''
      controller.inputStore = null
    }
    function rearmCodexTurn(key, controller) {
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
      resetCodexTurnAttempt(key, controller)
      controller.phase = 'armed'
      notifyCodexTurn()
    }
    function disposeCodexTurn(key, controller) {
      if (codexTurnControllers.get(key) !== controller) return
      resetCodexTurnAttempt(key, controller)
      disposeCodexTurnSessionSubscription(controller)
      controller.phase = 'disposed'
      codexTurnControllers.delete(key)
      attachState.bySession.delete(key)
      if (activeSessionId() === key) {
        attachState.items = []
        attachState.last = []
        notifyAttach()
      }
      notifyCodexTurn()
    }
    function codexTurnAuthorities(sessionId) {
      const sessions = runtime.sessions
      const conversation = runtime.conversation
      if (!sessions || !conversation || !conversation.input || typeof sessions.scope !== 'function' || typeof conversation.input.for !== 'function') throw new Error('Codex public stores unavailable')
      const scope = sessions.scope(sessionId)
      if (!scope) return null
      const binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : null
      const session = typeof sessions.sessionOf === 'function' ? sessions.sessionOf(scope) : binding && binding.session
      const input = conversation.input.for(scope)
      return { scope, session, inputStore: input && input.state }
    }
    function chatSourceById(sessionId) {
      const sessions = runtime.sessions
      const uiConversation = runtime.uiConversation
      if (!sessionId || !sessions || !uiConversation || typeof sessions.binding !== 'function' || typeof uiConversation.binding !== 'function') return null
      try {
        const binding = sessions.binding(sessionId)
        return binding ? uiConversation.binding(binding).target('chat') : null
      } catch {
        return null
      }
    }
    function sessionSnapshotWithChat(sessionId, session) {
      const snapshot = session && typeof session.getSnapshot === 'function' ? session.getSnapshot() : null
      const source = chatSourceById(sessionId)
      const chat = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : null
      return chat ? { ...(snapshot || {}), chat } : snapshot
    }
    function subscribeSessionWithChat(sessionId, session, listener) {
      const unsubscribers = []
      try {
        const sessionUnsubscribe = session && typeof session.subscribe === 'function' ? session.subscribe(listener) : null
        if (typeof sessionUnsubscribe === 'function') unsubscribers.push(sessionUnsubscribe)
        const source = chatSourceById(sessionId)
        const chatUnsubscribe = source && typeof source.subscribe === 'function' ? source.subscribe(listener) : null
        if (typeof chatUnsubscribe === 'function') unsubscribers.push(chatUnsubscribe)
      } catch (error) {
        unsubscribers.splice(0).forEach((unsubscribe) => {
          try { unsubscribe() } catch {}
        })
        throw error
      }
      if (!unsubscribers.length) return null
      return () => unsubscribers.splice(0).forEach((unsubscribe) => {
        try { unsubscribe() } catch {}
      })
    }
    function watchCodexTurnSession(key, controller) {
      if (typeof controller.unsubscribeSession === 'function') return true
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        return false
      }
      const session = authorities && authorities.session
      if (!session || typeof session.getSnapshot !== 'function' || typeof session.subscribe !== 'function') return false
      const onSession = () => {
        if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
        let snapshot
        try {
          snapshot = sessionSnapshotWithChat(key, session)
        } catch {
          return
        }
        if (snapshot && snapshot.removed === true) {
          disposeCodexTurn(key, controller)
          return
        }
        const token = controller.attemptToken
        if (controller.phase !== 'submitting' || !token) return
        if (!token.settlementReady) token.settlementQueued = true
        else settleCodexTurn(key, token)
      }
      let unsubscribe
      try {
        unsubscribe = subscribeSessionWithChat(key, session, onSession)
      } catch {
        return false
      }
      if (typeof unsubscribe !== 'function') return false
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') {
        try { unsubscribe() } catch {}
        return false
      }
      controller.unsubscribeSession = unsubscribe
      return true
    }
    function codexUserNode(snapshot, controller) {
      const nodes = sessionNodes(snapshot)
      for (const node of nodes) {
        if (!node || node.kind !== 'user' || typeof node.seq !== 'number' || node.seq <= controller.preSubmitUserNodeWatermark) continue
        const text = (node.content || []).filter((part) => part && part.type === 'text').map((part) => part.text).join('')
        if (text === controller.framedDraft) return true
      }
      return false
    }
    function codexUserNodeWatermark(snapshot) {
      let watermark = -1
      for (const node of sessionNodes(snapshot)) {
        if (node && node.kind === 'user' && typeof node.seq === 'number') watermark = Math.max(watermark, node.seq)
      }
      return watermark
    }
    function codexAttachmentIds(items) {
      return (items || []).map(codexAttachmentToken)
    }
    function sameCodexAttachmentIds(left, right) {
      if (left.length !== right.length) return false
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
      return true
    }
    function preparingCodexTurn(key, token) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return null
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        rearmCodexTurn(key, controller)
        return null
      }
      if (!authorities) {
        rearmCodexTurn(key, controller)
        return null
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      if (!session || typeof session.getSnapshot !== 'function' || !inputStore || typeof inputStore.getSnapshot !== 'function') {
        rearmCodexTurn(key, controller)
        return null
      }
      let sessionSnapshot
      let inputSnapshot
      try {
        sessionSnapshot = sessionSnapshotWithChat(key, session)
        inputSnapshot = inputStore.getSnapshot()
      } catch {
        rearmCodexTurn(key, controller)
        return null
      }
      if (sessionSnapshot && sessionSnapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return null
      }
      const live = controller.latestProps
      const attachmentIds = codexAttachmentIds(codexAttachItems(key))
      if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== 'plain' || typeof inputSnapshot.draft !== 'string'
        || inputSnapshot.draft !== controller.originalDraft || !live || codexTurnKey(live) !== key
        || !sameCodexAttachmentIds(attachmentIds, controller.capturedAttachmentIds)) {
        rearmCodexTurn(key, controller)
        return null
      }
      return { controller, live, session, sessionSnapshot, inputStore, inputSnapshot }
    }
    function failCodexTurn(key, controller, inputStore) {
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
      let ownsFramedDraft = false
      const authoritativeInputStore = inputStore || controller.inputStore
      try {
        const input = authoritativeInputStore && authoritativeInputStore.getSnapshot()
        ownsFramedDraft = submissionOwnsDraft(controller, input)
      } catch {}
      const originalDraft = controller.originalDraft
      const live = controller.latestProps
      rearmCodexTurn(key, controller)
      if (ownsFramedDraft) {
        try { setComposerDraft(live, originalDraft) } catch {}
      }
    }
    function clearCodexTurnAfterSubmit(key, controller) {
      if (codexTurnControllers.get(key) !== controller || controller.phase !== 'submitting') return
      const capturedIds = controller.capturedAttachmentIds.slice()
      const remainingIds = capturedIds.slice()
      const remaining = codexAttachItems(key).filter((item) => {
        const index = remainingIds.indexOf(codexAttachmentToken(item))
        if (index < 0) return true
        remainingIds.splice(index, 1)
        return false
      })
      resetCodexTurnAttempt(key, controller)
      disposeCodexTurnSessionSubscription(controller)
      controller.phase = 'idle'
      if (capturedIds.length) setCodexAttachItems(key, remaining)
      notifyCodexTurn()
    }
    function settleCodexTurn(key, token) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'submitting' || controller.attemptToken !== token) return
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        failCodexTurn(key, controller, null)
        return
      }
      if (!authorities) {
        failCodexTurn(key, controller, null)
        return
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      let snapshot
      let inputSnapshot
      try {
        snapshot = sessionSnapshotWithChat(key, session)
        inputSnapshot = inputStore && typeof inputStore.getSnapshot === 'function' ? inputStore.getSnapshot() : null
      } catch {
        failCodexTurn(key, controller, inputStore)
        return
      }
      if (!snapshot || !inputSnapshot) {
        failCodexTurn(key, controller, inputStore)
        return
      }
      if (snapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return
      }
      if (codexUserNode(snapshot, controller)) {
        if (!token.hostRequested) clearCodexTurnAfterSubmit(key, controller)
        return
      }
      const previousInputPhase = controller.lastInputPhase
      const previousInputDraftRev = controller.lastInputDraftRev
      const inputPhase = inputSnapshot.phase
      const inputDraftRev = typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
      if (inputPhase === 'submitting') controller.sawSubmitting = true
      controller.lastInputPhase = inputPhase
      controller.lastInputDraftRev = inputDraftRev
      if (inputPhase === 'submitting') return
      if (submissionHasNewPromptError(snapshot, controller)) {
        failCodexTurn(key, controller, inputStore)
        return
      }
      if (controller.sawSubmitting && previousInputPhase === 'submitting' && inputPhase === 'plain'
        && inputDraftRev !== null && previousInputDraftRev !== null) {
        if (inputDraftRev === previousInputDraftRev) failCodexTurn(key, controller, inputStore)
        return
      }
    }

    const composerPropsRef = { current: null }
    const composerFace = {
      sessionId: '',
      cwd: '',
      draft: '',
      inputActions: null,
      input: null,
      session: null,
    }

    function snapshotComposer() {
      return {
        sessionId: composerFace.sessionId || runtime.sessionId || '',
        cwd: composerFace.cwd || runtime.cwd || '',
        input: composerFace.input || { draft: composerFace.draft || '' },
        inputActions: composerFace.inputActions,
        session: composerFace.session,
      }
    }

    function cwdFromWorkspaceItems(items, sessionId) {
      if (!sessionId) return ''
      const list = items || []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const ids = item && item.sessionIds
        if (item && item.path && ids && ids.indexOf(sessionId) >= 0) return item.path
      }
      return ''
    }

    // Render-only: may call useSessions / useWorkspaces / useInput.
    // Event handlers must use snapshotComposer() / workspaceCwd() / resolveSessionId().
    function captureComposerFace(props) {
      if (!props) return runtime.cwd || composerFace.cwd || ''
      const previousSessionId = runtime.sessionId || composerFace.sessionId || ''
      const hinted = sessionHint(props) || runtime.sessionId
      let sessionId = hinted
      let sessionCwd = ''
      if (typeof props.useSessions === 'function') {
        sessionId = props.useSessions((s) => hinted || (s && s.current) || '') || hinted
        sessionCwd = props.useSessions((s) => {
          const id = hinted || (s && s.current) || ''
          const row = id && s && s.byId ? s.byId[id] : null
          return row && row.cwd ? row.cwd : ''
        }) || ''
      }
      let workspacePath = ''
      if (typeof props.useWorkspaces === 'function') {
        workspacePath = props.useWorkspaces((w) => cwdFromWorkspaceItems(w && w.items, sessionId)) || ''
      }
      let draft = composerFace.draft || ''
      if (props.input && typeof props.input.draft === 'string') draft = props.input.draft
      else if (typeof props.useInput === 'function') {
        try { draft = props.useInput((s) => (s && s.draft) || '') || '' } catch {}
      }
      if (sessionId) {
        runtime.sessionId = sessionId
        composerFace.sessionId = sessionId
        if (sessionId !== previousSessionId) {
          const sessionItems = attachItemsOf(sessionId)
          attachState.items = sessionItems
          attachState.last = sessionItems
          Promise.resolve().then(() => {
            if (activeSessionId() === sessionId) notifyAttach()
          })
        }
      }
      const changedSession = Boolean(previousSessionId && sessionId && sessionId !== previousSessionId)
      const cwd = sessionCwd || workspacePath || (changedSession ? '' : runtime.cwd) || ''
      if (cwd) {
        runtime.cwd = cwd
        composerFace.cwd = cwd
      } else if (changedSession) {
        runtime.cwd = ''
        composerFace.cwd = ''
      }
      if (typeof draft === 'string') {
        composerFace.draft = draft
        composerFace.input = props.input && typeof props.input.draft === 'string' ? props.input : { draft: draft }
      }
      if (props.inputActions) composerFace.inputActions = props.inputActions
      if (props.session) composerFace.session = props.session
      composerPropsRef.current = snapshotComposer()
      ensureUserRequirementWatcher(sessionId)
      return cwd
    }

    function rememberComposerProps(props) {
      captureComposerFace(props)
    }

    function readWorkspaceCwd(props) {
      return captureComposerFace(props)
    }

    function workspaceCwd(props) {
      const direct = props && typeof props.cwd === 'string' ? props.cwd : ''
      if (direct) return direct
      const hinted = sessionHint(props)
      if (hinted && hinted !== activeSessionId()) return ''
      return runtime.cwd || composerFace.cwd || ''
    }

    function activeSessionId() {
      return runtime.sessionId || composerFace.sessionId || ''
    }

    function fillComposer(props, text) {
      if (!text) return
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        props.inputActions.setDraft(text)
        return
      }
      const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea, textarea')
      if (!ta) return
      const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      if (desc && desc.set) desc.set.call(ta, text)
      else ta.value = text
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.dispatchEvent(new Event('change', { bubbles: true }))
    }

    function sessionFace(props) {
      return sessionFaceById(resolveSessionId(props))
    }

    function sessionFaceById(sid) {
      if (runtime.sessions && typeof runtime.sessions.binding === 'function' && sid) {
        try {
          const binding = runtime.sessions.binding(sid)
          if (binding && binding.session && typeof binding.session.prompt === 'function') return binding.session
        } catch {}
      }
      return null
    }

    function observableSessionById(sid) {
      const sessions = runtime.sessions
      if (!sessions || !sid) return null
      if (typeof sessions.scope === 'function' && typeof sessions.sessionOf === 'function') {
        try {
          const scope = sessions.scope(sid)
          const session = scope ? sessions.sessionOf(scope) : null
          if (session) return session
        } catch {}
      }
      if (typeof sessions.binding === 'function') {
        try {
          const binding = sessions.binding(sid)
          if (binding && binding.session) return binding.session
        } catch {}
      }
      return null
    }

    function snapshotOf(sid) {
      const face = observableSessionById(sid) || sessionFaceById(sid)
      if (!face || typeof face.getSnapshot !== 'function') return null
      try {
        return sessionSnapshotWithChat(sid, face)
      } catch {
        return null
      }
    }

    function sessionIsBusy(props) {
      return snapshotIsBusy(snapshotOf(resolveSessionId(props)))
    }

    function pinParentSessionId() {
      const sid = activeSessionId()
      return parentSessionTarget(sid, snapshotOf(sid), readSessionListSnap())
    }

    function assistantBlocksText(node) {
      return nodeText(node)
    }

    function lastReviewVerdict(snap) {
      return lastChildReturn(snap)
    }

    function flushQueuedToParent(parentId) {
      const face = sessionFaceById(parentId)
      const items = queuedMessages(snapshotOf(parentId))
      if (!face || !items.length) return Promise.resolve(false)
      if (typeof face.updateQueue === 'function') {
        return items.reduce((prev, item) => prev.then(() => {
          return Promise.resolve(face.updateQueue(item.id, { kind: 'steer' })).then((result) => {
            if (result && result.ok === false) {
              const code = result.error && result.error.code
              if (code === 'steer-unavailable' || code === 'queue-item-not-found') return
              throw new Error((result.error && (result.error.message || result.error.code)) || 'updateQueue rejected')
            }
          })
        }), Promise.resolve()).then(() => true)
      }
      return dispatchToConversation({}, '【主对话插话】请立刻处理输入框已提交、但还没进入当前轮的指令，不要空等。', parentId)
    }

    function dispatchToConversation(props, text, sessionId) {
      if (!text) return Promise.resolve(false)
      const face = sessionId ? sessionFaceById(sessionId) : sessionFace(props)
      if (face && typeof face.prompt === 'function') {
        // Direct session write; do not touch the composer, or the draft would linger
        // there and invite an accidental duplicate send. A busy parent must be
        // steered — queue-only delivery waits out the current run_code and looks swallowed.
        const targetId = sessionId || resolveSessionId(props)
        const mode = snapshotIsRunning(snapshotOf(targetId)) ? 'steer' : 'queue'
        return face.prompt([{ type: 'text', text }], mode).then((result) => {
          if (result && result.ok === false) {
            throw new Error((result.error && (result.error.message || result.error.code)) || 'session.prompt rejected')
          }
          return true
        })
      }
      if (props && props.inputActions && typeof props.inputActions.submit === 'function') {
        fillComposer(props, text)
        props.inputActions.submit()
        return Promise.resolve(true)
      }
      return Promise.reject(new Error('当前没有可写入的主对话。请先打开或新建一个会话。'))
    }

    const WORKBENCH_TRANSACTION_STATE_KEY = 'ap-wb-session-transactions:v1'
    function loadWorkbenchTransactionState() {
      try {
        const value = JSON.parse(localStorage.getItem(WORKBENCH_TRANSACTION_STATE_KEY) || 'null')
        return {
          transactions: Array.isArray(value && value.transactions) ? value.transactions : [],
          paused: Array.isArray(value && value.paused) ? value.paused : [],
        }
      } catch {
        return { transactions: [], paused: [] }
      }
    }
    const restoredWorkbenchState = loadWorkbenchTransactionState()
    const workbenchTransactions = window.__apWorkbenchTransactions
      || (window.__apWorkbenchTransactions = createSessionTransactionRegistry(Date.now, restoredWorkbenchState.transactions))
    const workbenchPausedSessions = window.__apWorkbenchPausedSessions
      || (window.__apWorkbenchPausedSessions = new Set(restoredWorkbenchState.paused))
    function persistWorkbenchTransactionState() {
      const transactions = workbenchTransactions.committed()
      const activeIds = new Set(transactions.map((item) => item.sessionId))
      const paused = [...workbenchPausedSessions].filter((sessionId) => activeIds.has(sessionId))
      try {
        if (!transactions.length) localStorage.removeItem(WORKBENCH_TRANSACTION_STATE_KEY)
        else localStorage.setItem(WORKBENCH_TRANSACTION_STATE_KEY, JSON.stringify({ transactions, paused }))
      } catch {}
    }
    function setWorkbenchTransactionPaused(sessionId, paused) {
      const id = String(sessionId || '').trim()
      if (!id) return
      if (paused) workbenchPausedSessions.add(id)
      else workbenchPausedSessions.delete(id)
      persistWorkbenchTransactionState()
    }
    const workbenchSessionBindings = window.__apWorkbenchSessionBindings
      || (window.__apWorkbenchSessionBindings = new Map())
    const workbenchRequirementRecords = window.__apWorkbenchRequirementRecords
      || (window.__apWorkbenchRequirementRecords = new Map())
    const workbenchRequirementPending = window.__apWorkbenchRequirementPending
      || (window.__apWorkbenchRequirementPending = new Set())
    const workbenchRequirementWatchers = window.__apWorkbenchRequirementWatchers
      || (window.__apWorkbenchRequirementWatchers = new Map())
    function workbenchBindingKey(sessionId) {
      return 'ap-wb-session-binding:' + String(sessionId || '').trim()
    }
    function rememberWorkbenchBinding(sessionId, payload) {
      const id = String(sessionId || '').trim()
      if (!id || !payload || !payload.cwd || !payload.projectId) return null
      const binding = {
        sessionId: id,
        cwd: payload.cwd,
        module: payload.module || 'tender',
        projectId: payload.projectId,
      }
      workbenchSessionBindings.set(id, binding)
      try { localStorage.setItem(workbenchBindingKey(id), JSON.stringify(binding)) } catch {}
      return binding
    }
    function cachedWorkbenchBinding(sessionId, cwd) {
      const id = String(sessionId || '').trim()
      if (!id) return null
      let binding = workbenchSessionBindings.get(id) || null
      if (!binding) {
        try { binding = JSON.parse(localStorage.getItem(workbenchBindingKey(id)) || 'null') } catch { binding = null }
      }
      if (!binding || !binding.projectId || (cwd && binding.cwd && normPath(binding.cwd) !== normPath(cwd))) return null
      return rememberWorkbenchBinding(id, binding)
    }
    function resolveWorkbenchBinding(sessionId, cwd) {
      const cached = cachedWorkbenchBinding(sessionId, cwd)
      if (cached) return Promise.resolve(cached)
      if (!sessionId || !cwd) return Promise.resolve(null)
      return api('/api/agent-pi/session-project?sessionId=' + encodeURIComponent(sessionId), cwd, { method: 'GET' })
        .then((body) => body && body.binding ? rememberWorkbenchBinding(sessionId, body.binding) : null)
        .catch(() => null)
    }
    function projectRequirementText(text) {
      const clean = stripMentionArtifacts(String(text || '')).trim()
      if (!clean) return ''
      if (isWorkbenchWakeText(clean)) return ''
      if (/^【(?:Agent Pi\b|用户要求账本|用户验收口径已确认|阶段切换|阶段已收口|执行账本对齐|用户最新要求|恢复未递交成果|成果质检并整理|专业项目启动|主对话插话|主机已自动重启|补齐实际工程量清单|补齐投标分析底稿|补齐组价当地情报|补齐组价强制放行说明)/.test(clean)) return ''
      if (/^(?:继续|开始|暂停|停止|收到|好的?|谢谢|进度(?:如何|怎样|怎么样)?|到哪(?:里|儿)了|现在什么状态)[？?。.!！\s]*$/i.test(clean)) return ''
      const directive = /(?:请|需要|要求|必须|应当|应该|务必|优先|只要|只需|只修改|不要|不得|禁止|改成|改为|修改|调整|修正|纠正|替换|换成|补充|补齐|增加|新增|删除|移除|保留|采用|沿用|使用|重新|重做|改写|重写|更新|完善|优化|排序|合并|拆分|输出|生成|制作|编制|翻译|标注|核对|检查|审查|不对|有误|不符合|不满意|遗漏|缺少|please|must|should|need(?:\s+to)?|require|only|do\s+not|don't|revise|change|update|fix|correct|replace|add|remove|delete|keep|adopt|use\s+.+instead)/i
      return directive.test(clean) ? clean : ''
    }
    function recordWorkbenchUserRequirement(props, text, retainDedupe) {
      const clean = projectRequirementText(text)
      const sessionId = sessionHint(props) || runtime.sessionId || ''
      const cwd = workspaceCwd(props)
      if (!clean || !sessionId || !cwd) return Promise.resolve(null)
      const recordKey = sessionId + '\n' + clean
      const existing = workbenchRequirementRecords.get(recordKey)
      if (existing) return existing
      workbenchRequirementPending.add(recordKey)
      const pending = resolveWorkbenchBinding(sessionId, cwd).then((binding) => {
        if (!binding) return null
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action: 'record_requirement',
            module: binding.module,
            projectId: binding.projectId,
            sessionId,
            text: clean,
          }),
        }).then((result) => {
          window.dispatchEvent(new CustomEvent('agent-pi-user-requirement', { detail: result && result.requirement }))
          return result
        })
      }).catch((error) => {
        showToast('项目要求同步失败：' + String(error && error.message || error))
        return null
      })
      const tracked = pending.then((result) => {
        if (!result || !retainDedupe) workbenchRequirementRecords.delete(recordKey)
        return result
      }).finally(() => workbenchRequirementPending.delete(recordKey))
      workbenchRequirementRecords.set(recordKey, tracked)
      return tracked
    }
    function projectRequirementWritePending(sessionId) {
      const prefix = String(sessionId || '').trim() + '\n'
      if (prefix === '\n') return false
      for (const key of workbenchRequirementPending) {
        if (key.startsWith(prefix)) return true
      }
      return false
    }
    function userRequirementNodeText(node) {
      return (node && node.content || [])
        .filter((part) => part && part.type === 'text')
        .map((part) => part.text || '')
        .join('')
        .trim()
    }
    function ensureUserRequirementWatcher(sessionId) {
      const id = String(sessionId || '').trim()
      if (!id || workbenchRequirementWatchers.has(id)) return
      if (!cachedWorkbenchBinding(id, runtime.cwd || composerFace.cwd || '')) return
      const session = observableSessionById(id)
      if (!session || typeof session.getSnapshot !== 'function' || typeof session.subscribe !== 'function') return
      let initialSnapshot
      try { initialSnapshot = sessionSnapshotWithChat(id, session) } catch { return }
      let watermark = codexUserNodeWatermark(initialSnapshot)
      const seenSubmissions = new Set()
      const seenQueue = new Set()
      const submittedTexts = new Set()
      const onSession = () => {
        let snapshot
        try { snapshot = sessionSnapshotWithChat(id, session) } catch { return }
        if (snapshot && snapshot.removed === true) {
          const watcher = workbenchRequirementWatchers.get(id)
          if (watcher && typeof watcher.unsubscribe === 'function') {
            try { watcher.unsubscribe() } catch {}
          }
          workbenchRequirementWatchers.delete(id)
          return
        }
        for (const submission of snapshot && snapshot.pendingSubmissions || []) {
          const key = String(submission && submission.requestId || '')
          if (!key || seenSubmissions.has(key)) continue
          seenSubmissions.add(key)
          const text = projectRequirementText(submission.text)
          if (text) {
            submittedTexts.add(text)
            void recordWorkbenchUserRequirement({ sessionId: id }, text, true)
          }
        }
        for (const queued of snapshot && snapshot.queue || []) {
          const key = String(queued && (queued.rpcId || queued.messageId || queued.id) || '')
          if (!queued || !queued.rpcId || !key || seenQueue.has(key)) continue
          seenQueue.add(key)
          const text = projectRequirementText(queued.text)
          if (text) {
            submittedTexts.add(text)
            void recordWorkbenchUserRequirement({ sessionId: id }, text, true)
          }
        }
        for (const node of sessionNodes(snapshot)) {
          if (!node || node.kind !== 'user' || typeof node.seq !== 'number' || node.seq <= watermark) continue
          watermark = Math.max(watermark, node.seq)
          const text = projectRequirementText(userRequirementNodeText(node))
          if (!text) continue
          if (submittedTexts.delete(text)) {
            workbenchRequirementRecords.delete(id + '\n' + text)
            continue
          }
          void recordWorkbenchUserRequirement({ sessionId: id }, text, false)
        }
      }
      let unsubscribe
      try { unsubscribe = subscribeSessionWithChat(id, session, onSession) } catch { return }
      if (typeof unsubscribe !== 'function') return
      workbenchRequirementWatchers.set(id, { session, unsubscribe })
      onSession()
    }
    function prepareWorkbenchTransaction(sessionId, payload) {
      const id = String(sessionId || '').trim()
      if (!id) throw new Error('自动推进需要明确的主会话。')
      const previous = workbenchTransactions.get(id)
      if (previous && (previous.phase === 'prepared' || previous.phase === 'committed')) {
        if (previous.payload.cwd === payload.cwd
          && previous.payload.module === payload.module
          && previous.payload.projectId === payload.projectId) {
          rememberWorkbenchBinding(id, payload)
          ensureUserRequirementWatcher(id)
          return previous
        }
        throw new Error('当前会话已有另一项自动推进事务，请先暂停或结束。')
      }
      const transaction = workbenchTransactions.prepare(id, payload)
      rememberWorkbenchBinding(id, payload)
      ensureUserRequirementWatcher(id)
      return transaction
    }
    function commitWorkbenchTransaction(sessionId) {
      const transaction = workbenchTransactions.commit(sessionId)
      workbenchPausedSessions.delete(String(sessionId || '').trim())
      persistWorkbenchTransactionState()
      return transaction
    }
    function workbenchTransactionCanRun(sessionId) {
      return workbenchTransactions.canRun(sessionId)
    }
    function settleWorkbenchTransaction(sessionId, phase, error) {
      const transaction = workbenchTransactions.get(sessionId)
      if (!transaction) return
      if (phase === 'succeeded') workbenchTransactions.succeed(sessionId)
      else workbenchTransactions.fail(sessionId, error)
      workbenchPausedSessions.delete(String(sessionId || '').trim())
      persistWorkbenchTransactionState()
    }
    function destroyWorkbenchTransaction(sessionId) {
      workbenchSessionBindings.delete(String(sessionId || '').trim())
      try { localStorage.removeItem(workbenchBindingKey(sessionId)) } catch {}
      workbenchTransactions.destroy(sessionId)
      workbenchPausedSessions.delete(String(sessionId || '').trim())
      persistWorkbenchTransactionState()
    }

    // Auto-advance exists only inside an explicitly committed per-session
    // transaction. A committed transaction survives renderer/app restarts, but
    // remains bound to the exact session and project and never wakes unrelated sessions.
    const monitorEngine = createWorkbenchSessionMonitor({
      api,
      activeSessionId,
      dispatchToConversation,
      flushQueuedToParent,
      pinParentSessionId,
      readSessionListSnap,
      snapshotOf,
      prepareTransaction: prepareWorkbenchTransaction,
      commitTransaction: commitWorkbenchTransaction,
      transactionCanRun: workbenchTransactionCanRun,
      settleTransaction: settleWorkbenchTransaction,
      destroyTransaction: destroyWorkbenchTransaction,
      setTransactionPaused: setWorkbenchTransactionPaused,
      requirementsPending: projectRequirementWritePending,
      onChange: () => window.dispatchEvent(new Event('agent-pi-monitor-changed')),
    })
    function restoreActiveWorkbenchMonitor() {
      if (monitorEngine.state.monitoring) return false
      const parentSessionId = pinParentSessionId()
      const transaction = workbenchTransactions.get(parentSessionId)
      if (!transaction || transaction.phase !== 'committed') return false
      rememberWorkbenchBinding(parentSessionId, transaction.payload)
      ensureUserRequirementWatcher(parentSessionId)
      return monitorEngine.restore(
        transaction.payload,
        parentSessionId,
        workbenchPausedSessions.has(parentSessionId),
      )
    }
    let transactionRestoreList = null
    function watchWorkbenchTransactionRestore() {
      const list = runtime.sessions && runtime.sessions.list
      if (list && list !== transactionRestoreList && typeof list.subscribe === 'function') {
        transactionRestoreList = list
        list.subscribe(() => { restoreActiveWorkbenchMonitor() })
      }
      restoreActiveWorkbenchMonitor()
    }
    function slugify(str) {
      return String(str || '')
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 128)
    }

    function formatClock(iso) {
      if (!iso) return '—'
      const value = Date.parse(iso)
      if (!Number.isFinite(value)) return '—'
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    function fileName(path) {
      const parts = String(path || '').split(/[\\/]/)
      return parts[parts.length - 1] || path
    }

    function sameFilePath(left, right) {
      return String(left || '').replace(/\\/g, '/').toLowerCase() === String(right || '').replace(/\\/g, '/').toLowerCase()
    }

    function findSetupRestore(restores, sourcePath) {
      const list = Array.isArray(restores) ? restores : []
      const name = fileName(sourcePath)
      return list.find((item) => (
        item && (sameFilePath(item.sourcePath, sourcePath) || item.originalName === name)
      )) || null
    }

    function restoreOpenPath(sourcePath, restores) {
      const hit = findSetupRestore(restores, sourcePath)
      return (hit && hit.manuscriptPath) || sourcePath
    }

    function desktopApi() {
      if (typeof window === 'undefined') return null
      const frames = [window]
      try { if (window.parent && window.parent !== window) frames.push(window.parent) } catch { /* cross-origin */ }
      try { if (window.top && window.top !== window && window.top !== window.parent) frames.push(window.top) } catch { /* cross-origin */ }
      for (let i = 0; i < frames.length; i++) {
        try {
          const api = frames[i] && frames[i].agentPiDesktop
          if (api) return api
        } catch { /* isolated frame */ }
      }
      return null
    }

    function normalizePickedPaths(value) {
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

    function mergeKbEntries(server, local) {
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

    function kbLandingCardVisible(label, entries) {
      const shown = String(label || '').trim()
      if (!shown) return false
      return !(Array.isArray(entries) ? entries : []).some((entry) => {
        const name = String((entry && (entry.name || entry.originalName)) || '')
        if (!name || shown.indexOf(name) < 0) return false
        const status = entry && entry.parseStatus
        return status === 'ready' || status === 'staged' || status === 'parsing' || status === 'failed'
      })
    }

    function kbFidelityLabel(entry, lang) {
      const en = localeIdOf(lang || langState.lang) !== 'zh'
      const clauseCount = Number(entry && entry.clauseCount)
      const coverage = Number(entry && entry.coverage)
      const tableCount = Number(entry && entry.tableCount)
      if (Number.isFinite(clauseCount) && clauseCount > 0 && Number.isFinite(coverage)) {
        const tables = Number.isFinite(tableCount) && tableCount > 0
          ? (en ? ' · tables ' + tableCount : ' · 表 ' + tableCount)
          : ''
        return en
          ? 'Clauses ' + clauseCount + tables + ' · coverage ' + Math.round(coverage * 100) + '%'
          : '条款 ' + clauseCount + tables + ' · 覆盖 ' + Math.round(coverage * 100) + '%'
      }
      const chunkCount = Number(entry && entry.chunkCount)
      if (Number.isFinite(chunkCount) && chunkCount > 0) return en ? chunkCount + ' chunks' : chunkCount + ' 块'
      return ''
    }

    function kbIngestKind(entry) {
      if (!entry) return ''
      if (entry.ingest === 'pack') return 'pack'
      if (entry.ingest === 'mineru') return 'mineru'
      const name = String(entry.originalName || entry.name || '')
      if (/\.(pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp)$/i.test(name)) return 'local'
      return 'raw'
    }

    function kbIngestLabel(entry, lang) {
      const kind = kbIngestKind(entry)
      if (!kind) return ''
      const en = localeIdOf(lang || langState.lang) !== 'zh'
      if (kind === 'pack') return en ? 'Knowledge pack' : '知识包'
      if (kind === 'mineru') return en ? 'MinerU manuscript' : 'MinerU 解析稿'
      if (kind === 'local') return en ? 'Local text layer' : '本机文本层'
      return en ? 'Source ingest' : '原文入库'
    }

    function kbCategoryLabel(category, lang) {
      const name = String(category || '')
      const key = 'kb.cat.' + name
      const labeled = tAp(key)
      return labeled === key ? name : labeled
    }

    function apJoin(items) {
      return (items || []).join(langState.lang === 'zh' ? '、' : ', ')
    }

    function kbProgressText(text) {
      const raw = String(text || '')
      if (raw === '正在落入原始文档区…' || raw === 'Saving to the staging area…') return tAp('kb.landingProgress')
      if (raw === '已落入原始文档区，等待解析入库' || raw === 'In the staging area, waiting to be parsed') return tAp('kb.stagedWait')
      if (raw === '已保存' || raw === 'Saved') return tAp('kb.mineruSavedHint')
      return raw
    }

    function looksLikeKbPackName(file) {
      const name = String((file && file.name) || '')
      const base = name.replace(/^.*[\\/]/, '').toLowerCase()
      if (base === 'pack.json' || base === 'manuscript.md') return true
      if ((file && file.type) === 'directory' && /(kb-pack|knowledge-pack|知识包)/i.test(name)) return true
      return false
    }

    function kbChatImportCopy() {
      return {
        title: tAp('kb.path2Title'),
        warn: tAp('kb.path2Warn'),
        say: '把这个 PDF 准确整理完整内容，做成知识包再入库。',
        after: tAp('kb.path2After'),
      }
    }

    const MODULE_CREATE_GUARD = '请先读 skill workbench-domain-builder。当前会话使用 DSH 原生「创造模式」作为创作驾驶舱，但本任务的交付物是专业工作台业务模块，不是 Agent 预设。不得修改 DSH 官方预设、不得写 agent.cordis.yml 或改插件组装，除非用户另行明确要求创建 Agent 预设。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 风险审查 / 必要的人工确认）、配套方法 skill、能挂的知识库。来源是投标项目时，必须从内置 tender 复制并保留原阶段 id 和 controlProfile=tender，不得只仿造七段外观而丢掉 BOQ、证据、能力包和最终冻结硬门。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。'
    const MODULE_CREATE_PROMPTS = {
      distill: MODULE_CREATE_GUARD + '我想把来源项目里已经做完且由用户明确认可的成果与修订经验，整理成以后同类工作的标准。读取来源项目的 Official Outputs、用户要求台账和明确审批记录；不能把“文件存在”当成“用户认可”。如来源模块是 tender，先 workbench_module_copy 复制内置投标，保留原阶段 id、三个人工门、风险审查和 controlProfile=tender，再把用户验收的方法、skill 和知识包挂上去。范文或用户模板进知识库，做法和用户纠正规则记成 skill，模块保存后用中文告诉我顶栏新标签叫什么、下次怎么开项目。最多确认一句中文名称和分几步。',
      'copy-pack': MODULE_CREATE_GUARD + '我们的步骤和「投标全流程」一样，但要用自己的规范、组价表或投标函。请用 workbench_module_copy 拷贝当前内置投标，完整保留其阶段 id、风险审查和人工确认门禁。拷完用中文问我模块叫什么、规范或范文在哪（可以让我上传），挂到规范包。建好告诉我顶栏新标签和下次怎么用。',
      'custom-steps': MODULE_CREATE_GUARD + '我们这类工作和「投标全流程」步骤不一样。请用一条消息、用大白话问清：这个领域叫什么、实际工作分哪几步（3到6步）、开工有什么资料、最后交什么、有没有规范或范文。问完后建成完整模块包。保存后告诉我顶栏新标签叫什么、下次怎么开项目。',
    }
    function remoteResultValue(result, operation) {
      if (result && result.ok === true) return result.value
      const error = result && result.error
      const message = error && (error.message || error.code)
      throw new Error((operation || 'DSH 远程调用') + '失败：' + (message || '未返回可用结果'))
    }
    function waitForSessionFace(sessionId, attempts) {
      const face = sessionFaceById(sessionId)
      if (face) return Promise.resolve(face)
      if ((attempts || 0) >= 30) return Promise.reject(new Error('创造模式会话已建立，但对话绑定尚未就绪。'))
      return new Promise((resolve) => window.setTimeout(resolve, 100))
        .then(() => waitForSessionFace(sessionId, (attempts || 0) + 1))
    }
    function moduleSourceSuffix(context) {
      const source = context || {}
      const lines = [
        '',
        '【Agent Pi 来源上下文】',
        '来源会话：' + (source.sessionId || '未绑定'),
        '工作区：' + (source.cwd || '未绑定'),
      ]
      if (source.module) lines.push('来源模块：' + source.module)
      if (source.projectId) lines.push('来源项目：' + source.projectId)
      if (source.projectRoot) lines.push('项目根目录：' + source.projectRoot)
      lines.push('若来源会话有历史，不要假设新会话能直接继承聊天文本；以项目中已接受的 Official Outputs、.agent-pi 用户要求台账和显式人工审批为准。')
      return lines.join('\n')
    }
    async function openNativeModuleCreate(props, prompt, context) {
      const sourceId = resolveSessionId(props) || activeSessionId()
      const list = readSessionListSnap()
      const summary = sourceId && list && list.byId ? list.byId[sourceId] : null
      const blank = !!(summary && summary.blank === true) || !!(props && props.session && props.session.blank === true)
      const remote = runtime.remote
      if (!sourceId) throw new Error('请先打开或新建一个主对话，再进入创造模式。')
      if (!remote || !remote.agentPresets || typeof remote.agentPresets.select !== 'function'
        || !remote.session || typeof remote.session.create !== 'function') {
        throw new Error('当前 DSH Typert Gateway 未提供创造模式所需的 agentPresets/session 接口。')
      }
      if (!runtime.sessions || typeof runtime.sessions.open !== 'function' || typeof runtime.sessions.refresh !== 'function') {
        throw new Error('当前 DSH 会话服务尚未就绪。')
      }
      let targetId = sourceId
      if (blank) {
        remoteResultValue(await remote.agentPresets.select(sourceId, 'cordis'), '切换原生创造模式')
        await runtime.sessions.refresh()
      } else {
        const created = remoteResultValue(await remote.session.create({
          cwd: (context && context.cwd) || workspaceCwd(props),
          agentPreset: 'cordis',
        }), '新建原生创造模式会话')
        targetId = created && created.sessionId
        if (!targetId) throw new Error('DSH 未返回创造模式会话 id。')
        await runtime.sessions.refresh()
        runtime.sessions.open(targetId)
      }
      await waitForSessionFace(targetId, 0)
      await dispatchToConversation({}, prompt + moduleSourceSuffix(Object.assign({}, context, { sessionId: sourceId })), targetId)
      return targetId
    }
    function moduleCreateCopy() {
      return {
        title: tAp('mm.createTitle'),
        lead: tAp('mm.createLead'),
        warn: tAp('mm.createWarn'),
        advanced: tAp('mm.createAdvanced'),
        cards: [
          { id: 'distill', title: tAp('mm.card.distill'), body: tAp('mm.card.distillBody') },
          { id: 'copy-pack', title: tAp('mm.card.copy'), body: tAp('mm.card.copyBody') },
          { id: 'custom-steps', title: tAp('mm.card.custom'), body: tAp('mm.card.customBody') },
        ],
      }
    }

    function looksLikeUserTemplateName(name) {
      const base = String(name || '').replace(/^.*[\\/]/, '')
      if (!base) return false
      const stem = base.replace(/\.[^.]+$/, '')
      if (/(用户模板|用户模版)/.test(stem)) return true
      if (/(模板|模版)$/.test(stem)) return true
      if (/(^|[^a-z0-9])template([^a-z0-9]|$)/i.test(stem)) return true
      return false
    }

    function kbCategoryHint(category) {
      if (category === '用户模板' || category === '用户模版') return tAp('kb.hint.用户模板')
      return ''
    }

    const KB_PRESET_CATEGORIES = ['规范', '合同', '范文', '方法标准', '用户模板']

    function sortKbCategories(names) {
      return names.slice().sort((a, b) => {
        const ia = KB_PRESET_CATEGORIES.indexOf(a)
        const ib = KB_PRESET_CATEGORIES.indexOf(b)
        if (ia >= 0 && ib >= 0) return ia - ib
        if (ia >= 0) return -1
        if (ib >= 0) return 1
        return String(a).localeCompare(String(b), 'zh')
      })
    }

    function groupKbEntries(entries, folders, category) {
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

    function diskPathOf(file) {
      const desktop = desktopApi()
      if (desktop && typeof desktop.pathForFile === 'function') {
        try {
          const path = String(desktop.pathForFile(file) || '').trim()
          if (isAbsolutePath(path)) return path
        } catch { /* preload too old for webUtils */ }
      }
      const fallback = String(file && file.path || '').trim()
      return isAbsolutePath(fallback) ? fallback : ''
    }

    function joinPath(base, child) {
      const sep = String(base).indexOf('\\') >= 0 || /^[a-zA-Z]:/.test(String(base)) ? '\\' : '/'
      return String(base).replace(/[\\/]+$/, '') + sep + String(child).replace(/^[\\/]+/, '')
    }

    function isAbsolutePath(value) {
      const path = String(value || '')
      return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')
    }

    function explorerTarget(cwd, targetPath, file) {
      let path = String(targetPath || (file && file.path) || '').trim()
      const rel = file && file.relativePath ? String(file.relativePath).trim() : ''
      if (!path && rel && cwd) path = joinPath(cwd, rel)
      if (path && !isAbsolutePath(path) && cwd) path = joinPath(cwd, path)
      if (!path) path = String(cwd || '').trim()
      return path.replace(/\//g, '\\')
    }

    function parentDir(path) {
      const value = String(path || '').replace(/[\\/]+$/, '')
      const idx = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'))
      if (idx <= 0) return value
      if (idx === 2 && /^[a-zA-Z]:/.test(value)) return value
      return value.slice(0, idx)
    }

    function openInExplorer(cwd, targetPath, options) {
      const file = options && options.file
      const root = String(cwd || '').trim()
      const target = explorerTarget(root, targetPath, file)
      if (!target) return Promise.reject(new Error(tAp('files.noCwd')))
      const isDir = file ? file.type === 'directory' : true
      const reveal = options && Object.prototype.hasOwnProperty.call(options, 'reveal')
        ? Boolean(options.reveal)
        : !isDir
      showToast(tAp('files.opening'))
      const desktop = desktopApi()
      const viaDesktop = () => {
        if (!desktop) return Promise.resolve(false)
        const invoke = reveal && typeof desktop.revealPath === 'function'
          ? desktop.revealPath(target)
          : (typeof desktop.openPath === 'function'
            ? desktop.openPath(reveal ? (parentDir(target) || target) : target)
            : null)
        if (!invoke) return Promise.resolve(false)
        return Promise.resolve(invoke).then((msg) => !msg).catch(() => false)
      }
      return viaDesktop().then((ok) => {
        if (ok) return { ok: true, path: target }
        return api('/api/agent-pi/files/open', root || target, {
          method: 'POST',
          body: JSON.stringify({ path: target, reveal: reveal }),
        })
      })
    }

    function stageSlice(row, stageId) {
      if (!row) return null
      if (row.stages && row.stages[stageId]) return row.stages[stageId]
      if (row.stage && row.stage.stageId === stageId) return row.stage
      return null
    }

    function officialFolder(stageId) {
      return ({
        'bid-risk-decision': 'bid-decision',
        'tender-document-analysis': 'document-analysis',
        'pricing-basis-freeze': 'pricing-basis',
        'boq-five-step-pricing': 'boq-pricing',
        'planning-and-submission': 'planning',
        'submission-compliance-freeze': 'submission',
        'project-setup': 'setup',
        'delivery-setup': 'delivery',
        'delivery-controls': 'delivery',
        'investment-setup': 'investment',
        'investment-diligence': 'investment',
      })[stageId] || stageId
    }

    function officialStagePath(cwd, projectId, stageId) {
      return joinPath(joinPath(joinPath(cwd, 'Agent Pi Outputs'), projectId), officialFolder(stageId))
    }

    function stageRowDirty(slice, tasks, checkRow) {
      if (checkRow && typeof checkRow.needsQc === 'boolean') return checkRow.needsQc
      const done = tasks.filter((task) => task.status === 'done').length
      const failed = tasks.filter((task) => task.status === 'error').length
      if (failed > 0) return true
      if (slice && slice.status === 'done' && tasks.length > 0 && done < tasks.length) return true
      return false
    }

    function taskStatusLabel(status) {
      return ({ queued: '待处理', running: '进行中', done: '已完成', error: '失败' })[status] || status
    }

    function readWorkbenchOpen() {
      try { return sessionStorage.getItem('ap-wb-open') === '1' } catch { return false }
    }

    function setWorkbenchOpen(open) {
      try { sessionStorage.setItem('ap-wb-open', open ? '1' : '0') } catch {}
      document.documentElement.classList.toggle('ap-wb-open', !!open)
      window.dispatchEvent(new Event('agent-pi-wb-changed'))
    }

    function focusMainConversation(props) {
      setWorkbenchOpen(false)
      if (props && typeof props.openView === 'function') props.openView('chat', 'agent-pi-workbench-handoff')
      window.requestAnimationFrame(() => {
        const textarea = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
        if (!textarea) return
        try { textarea.scrollIntoView({ block: 'nearest' }) } catch {}
        try { textarea.focus() } catch {}
      })
    }

    function useWorkbenchOpen() {
      const [open, setOpen] = React.useState(() => (typeof document !== 'undefined' && document.documentElement.classList.contains('ap-wb-open')) || readWorkbenchOpen())
      React.useEffect(() => {
        const sync = () => setOpen(document.documentElement.classList.contains('ap-wb-open') || readWorkbenchOpen())
        sync()
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => window.removeEventListener('agent-pi-wb-changed', sync)
      }, [])
      return open
    }

    function useSidebarInset() {
      const [left, setLeft] = React.useState(260)
      React.useEffect(() => {
        const overlay = document.querySelector('[data-shell-overlay]')
        const side = overlay && overlay.parentElement ? overlay.parentElement.firstElementChild : null
        if (!side) return undefined
        const apply = () => setLeft(Math.round(side.getBoundingClientRect().width))
        apply()
        const ro = new ResizeObserver(apply)
        ro.observe(side)
        return () => ro.disconnect()
      }, [])
      return left
    }

    function stitchMarkdown(edited, original) {
      const sliced = slicePreviewMarkdown(original)
      const restored = restoreCappedTables(edited, sliced.text)
      if (!sliced.truncated) return restored
      return restored.replace(/\s*$/, '') + original.slice(sliced.text.length)
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    function citationChipLabel(token) {
      const raw = String(token || '')
      if (raw.startsWith('kb:')) {
        const rest = raw.slice(3)
        const sep = rest.lastIndexOf(':')
        return sep > 0 ? rest.slice(0, sep) : rest
      }
      if (raw.startsWith('src:')) {
        const rest = raw.slice(4)
        const hash = rest.lastIndexOf('#')
        const path = hash > 0 ? rest.slice(0, hash) : rest
        const loc = hash > 0 ? rest.slice(hash + 1) : ''
        const name = path.replace(/^.*[/\\]/, '')
        return loc ? name + ' · ' + loc : name
      }
      return raw.length > 42 ? raw.slice(0, 39) + '…' : raw
    }

    function citationChip(token) {
      // token is already HTML-escaped (runs after escapeHtml); keep it verbatim in the
      // data attribute so htmlToMarkdown can round-trip the literal [token] back out.
      return '<span class="ap-cite" data-cite="' + token + '" data-cite-token="[' + token + ']" title="点击查看出处">' + citationChipLabel(token) + '</span>'
    }

    function inlineMarkdown(value, ctx) {
      const raw = String(value)
      if (!MARKUP_RE.test(raw)) return HTML_SPECIAL_RE.test(raw) ? escapeHtml(raw) : raw
      let text = escapeHtml(raw)
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      text = text.replace(/\[(kb:[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+)\]/g, (_, token) => citationChip(token))
      text = text.replace(/\[(src:[^\]\r\n]+?)\]/g, (_, token) => citationChip(token))
      text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
        const image = resolvePreviewImage(href, ctx)
        return '<img alt="' + escapeHtml(alt) + '" src="' + escapeHtml(image.src) + '" data-md-src="' + escapeHtml(image.origin) + '">'
      })
      text = text.replace(/\[([^\]]+)\]\((https?:[^)]+|data:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      return text
    }

    function resolvePreviewImage(href, ctx) {
      const raw = String(href || '').trim()
      const origin = raw.replace(/^</, '').replace(/>.*$/, '').split(/\s+["']/)[0]
      if (!origin || /^(https?:|data:|blob:|#|mailto:)/i.test(origin)) return { src: origin, origin: origin }
      if (!ctx || !ctx.cwd || !ctx.filePath) return { src: origin, origin: origin }
      const filePath = String(ctx.filePath).replace(/\\/g, '/')
      const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
      const rel = origin.replace(/\\/g, '/')
      let resolved
      if (/^[a-zA-Z]:\//.test(rel) || rel.startsWith('/')) resolved = rel
      else {
        const parts = (dir + '/' + rel).split('/')
        const out = []
        for (const part of parts) {
          if (part === '.' || part === '') continue
          if (part === '..') out.pop()
          else out.push(part)
        }
        resolved = out.join('/')
      }
      return { src: rawFileUrl(ctx.cwd, resolved.replace(/\//g, '\\')), origin: origin }
    }

    function isPipeTableRow(line) {
      return /^\s*\|.+\|\s*$/.test(line)
    }

    function isPipeSeparatorRow(line) {
      const trimmed = String(line).trim()
      if (!trimmed.includes('|') || !trimmed.includes('-')) return false
      const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
      const cells = inner.split('|')
      return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
    }

    function pipeCells(line) {
      return line.split('|').slice(1, -1).map((cell) => cell.trim())
    }

    function startsMdBlock(line) {
      return /^(#{1,6}\s|```|\s*\\?[-*+]\s|\s*\\?\d+\.\s|\s*>|---+$)/.test(line)
        || isPipeTableRow(line)
        || /^\s*<table\b/i.test(line)
    }

    var TABLE_TAGS = { table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1, caption: 1, colgroup: 1, col: 1, br: 1 }

    function capHtmlTableRows(table, cap) {
      if (!Number.isFinite(cap) || cap === Infinity) return { html: table, hidden: 0 }
      let seen = 0
      let hidden = 0
      const html = table.replace(/<tr\b[\s\S]*?<\/tr>/gi, (row) => {
        seen += 1
        if (seen <= cap + 1) return row
        hidden += 1
        return ''
      })
      return { html: html, hidden: hidden }
    }

    function sanitizeMineruTable(html, cap) {
      const match = /<table\b[\s\S]*?<\/table>/i.exec(html)
      if (!match) return '<p>' + escapeHtml(html) + '</p>'
      const table = match[0]
        .replace(/<\/?(script|style|iframe|object|embed|link|meta|img|svg|video|audio)[^>]*>/gi, '')
        .replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (all, name, attrs) => {
          const tag = String(name).toLowerCase()
          if (tag === 'br') return '<br>'
          if (!TABLE_TAGS[tag]) return ''
          if (all.startsWith('</')) return '</' + tag + '>'
          const kept = []
          const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g
          let attr
          while ((attr = attrRe.exec(attrs))) {
            if (/^(colspan|rowspan|scope)$/i.test(attr[1])) {
              const value = attr[3] != null ? attr[3] : (attr[4] != null ? attr[4] : (attr[5] || ''))
              kept.push(attr[1].toLowerCase() + '="' + escapeHtml(value) + '"')
            }
          }
          return '<' + tag + (kept.length ? ' ' + kept.join(' ') : '') + '>'
        })
      const capped = capHtmlTableRows(table, cap == null ? PREVIEW_TABLE_ROW_CAP : cap)
      const more = capped.hidden > 0
        ? '<p class="ap-doc-more">还有 ' + capped.hidden + ' 行未显示，切源码可看全文；保存时会拼回。</p>'
        : ''
      return '<div class="ap-doc-table-wrap">' + capped.html + '</div>' + more
    }

    function takeHtmlTable(lines, start) {
      const first = lines[start]
      if (!first || (!/^\s*<table\b/i.test(first) && !(/^\s*<html\b/i.test(first) && /<table/i.test(first)))) return null
      const buf = [first]
      let i = start + 1
      if (!/<\/table>/i.test(first)) {
        let chars = first.length
        while (i < lines.length && !/<\/table>/i.test(lines[i]) && chars < 400000) {
          buf.push(lines[i])
          chars += lines[i].length + 1
          i += 1
        }
        if (i < lines.length) {
          buf.push(lines[i])
          i += 1
        }
      }
      return { html: buf.join('\n'), next: i }
    }

    function tableRowCapOf(ctx) {
      const cap = ctx && ctx.tableRowCap
      if (cap === Infinity) return Infinity
      if (typeof cap === 'number' && cap > 0) return cap
      return PREVIEW_TABLE_ROW_CAP
    }

    function collectMdTableRows(markdown) {
      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
      const tables = []
      const sep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/
      let i = 0
      while (i < lines.length) {
        if (/^\s*\|.+\|\s*$/.test(lines[i]) && i + 1 < lines.length && sep.test(lines[i + 1])) {
          i += 2
          const rows = []
          while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
            rows.push(lines[i])
            i += 1
          }
          tables.push(rows)
          continue
        }
        i += 1
      }
      return tables
    }

    function mdTableRowHtml(line, ctx) {
      return '<tr>' + line.split('|').slice(1, -1).map((cell) => '<td>' + inlineMarkdown(cell.trim(), ctx) + '</td>').join('') + '</tr>'
    }

    function fillMdTables(root, markdown, ctx, options) {
      const opts = options || {}
      let cancelled = false
      const batch = opts.batch > 0 ? opts.batch : 80
      const only = typeof opts.tableIndex === 'number' ? opts.tableIndex : -1
      const tables = collectMdTableRows(markdown)
      const run = async () => {
        if (!root || !root.querySelectorAll) return
        const wraps = root.querySelectorAll('.ap-doc-table-wrap')
        for (let i = 0; i < wraps.length && i < tables.length; i++) {
          if (only >= 0 && i !== only) continue
          const wrap = wraps[i]
          const tbody = wrap.querySelector('tbody')
          if (!tbody) continue
          const rows = tables[i]
          while (!cancelled && tbody.rows.length < rows.length) {
            const start = tbody.rows.length
            const end = Math.min(rows.length, start + batch)
            tbody.insertAdjacentHTML('beforeend', rows.slice(start, end).map((line) => mdTableRowHtml(line, ctx)).join(''))
            const more = wrap.nextElementSibling
            if (more && more.classList && more.classList.contains('ap-doc-more')) {
              const left = rows.length - tbody.rows.length
              if (left <= 0) more.remove()
              else {
                const btn = more.querySelector('[data-md-expand]')
                if (btn) btn.textContent = '还有 ' + left + ' 行未显示，点击立即展开'
              }
            }
            await new Promise((resolve) => requestAnimationFrame(resolve))
          }
          if (cancelled) return
        }
      }
      return { cancel: () => { cancelled = true }, done: run() }
    }

    function mdToHtml(markdown, ctx) {
      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
      const out = []
      const cap = tableRowCapOf(ctx)
      let i = 0
      let tableIndex = 0
      let listType = null
      let listItems = []
      const flushList = () => {
        if (!listType) return
        out.push('<' + listType + '>' + listItems.map((item) => '<li>' + item + '</li>').join('') + '</' + listType + '>')
        listType = null
        listItems = []
      }
      while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```')) {
          flushList()
          const code = []
          i += 1
          while (i < lines.length && !lines[i].startsWith('```')) {
            code.push(lines[i])
            i += 1
          }
          if (i < lines.length) i += 1
          out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>')
          continue
        }
        const htmlTable = takeHtmlTable(lines, i)
        if (htmlTable) {
          flushList()
          out.push(sanitizeMineruTable(htmlTable.html, cap))
          i = htmlTable.next
          continue
        }
        if (isPipeTableRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
          flushList()
          const header = pipeCells(line).map((cell) => '<th>' + inlineMarkdown(cell, ctx) + '</th>').join('')
          i += 2
          const rows = []
          let hidden = 0
          while (i < lines.length && isPipeTableRow(lines[i])) {
            if (rows.length >= cap) {
              hidden += 1
              i += 1
              continue
            }
            rows.push('<tr>' + pipeCells(lines[i]).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr>')
            i += 1
          }
      out.push('<div class="ap-doc-table-wrap" data-md-table="' + tableIndex + '"><table><thead><tr>' + header + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>')
      tableIndex += 1
      if (hidden > 0) {
        out.push('<p class="ap-doc-more"><button type="button" class="ap-doc-btn" data-md-expand="table">还有 ' + hidden + ' 行未显示，点击立即展开</button></p>')
      }
          continue
        }
        if (isPipeTableRow(line)) {
          flushList()
          out.push('<div class="ap-doc-table-wrap"><table><tbody><tr>' + pipeCells(line).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr></tbody></table></div>')
          i += 1
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flushList()
          const level = heading[1].length
          out.push('<h' + level + '>' + inlineMarkdown(heading[2], ctx) + '</h' + level + '>')
          i += 1
          continue
        }
        if (/^---+$/.test(line.trim())) {
          flushList()
          out.push('<hr/>')
          i += 1
          continue
        }
        const ul = /^\s*\\?[-*+]\s+(.*)$/.exec(line)
        if (ul) {
          if (listType && listType !== 'ul') flushList()
          listType = 'ul'
          listItems.push(inlineMarkdown(ul[1], ctx))
          i += 1
          continue
        }
        const ol = /^\s*\\?\d+\.\s+(.*)$/.exec(line)
        if (ol) {
          if (listType && listType !== 'ol') flushList()
          listType = 'ol'
          listItems.push(inlineMarkdown(ol[1], ctx))
          i += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          flushList()
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          out.push('<blockquote><p>' + inlineMarkdown(quote.join(' '), ctx) + '</p></blockquote>')
          continue
        }
        if (!line.trim()) {
          flushList()
          i += 1
          continue
        }
        flushList()
        const para = []
        while (i < lines.length && lines[i].trim() && !startsMdBlock(lines[i])) {
          para.push(lines[i])
          i += 1
        }
        if (!para.length) {
          out.push('<p>' + inlineMarkdown(line, ctx) + '</p>')
          i += 1
          continue
        }
        const joined = para.join(' ').trim()
        const embedded = /<table\b[\s\S]*?<\/table>/i.exec(joined)
        if (embedded) {
          const before = joined.slice(0, embedded.index).trim()
          if (before) out.push('<p>' + inlineMarkdown(before, ctx) + '</p>')
          out.push(sanitizeMineruTable(embedded[0], cap))
          const after = joined.slice(embedded.index + embedded[0].length).trim()
          if (after) out.push('<p>' + inlineMarkdown(after, ctx) + '</p>')
          continue
        }
        out.push('<p>' + inlineMarkdown(joined, ctx) + '</p>')
      }
      flushList()
      return out.join('\n')
    }

    function htmlToMarkdown(root) {
      const blocks = []
      const inline = (node) => {
        if (!node) return ''
        if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\u00a0/g, ' ')
        if (node.nodeType !== 1) return ''
        const tag = node.tagName.toLowerCase()
        if (node.getAttribute && node.getAttribute('data-cite-token')) return node.getAttribute('data-cite-token')
        const children = Array.from(node.childNodes).map(inline).join('')
        if (tag === 'br') return '\n'
        if (tag === 'strong' || tag === 'b') return children ? '**' + children + '**' : ''
        if (tag === 'em' || tag === 'i') return children ? '*' + children + '*' : ''
        if (tag === 'code') return children ? '`' + children + '`' : ''
        if (tag === 'a') {
          const href = node.getAttribute('href') || ''
          return href ? '[' + children + '](' + href + ')' : children
        }
        if (tag === 'img') {
          const origin = node.getAttribute('data-md-src') || node.getAttribute('src') || ''
          const alt = node.getAttribute('alt') || ''
          return origin ? '![' + alt + '](' + origin + ')' : ''
        }
        return children
      }
      const pushList = (line) => {
        const last = blocks[blocks.length - 1]
        if (last && /^(\s*[-*+]\s|\s*\d+\.\s)/.test(last.split('\n').pop())) blocks[blocks.length - 1] = last + '\n' + line
        else blocks.push(line)
      }
      const block = (node) => {
        if (node.nodeType === 3) {
          const text = String(node.nodeValue || '').trim()
          if (text) blocks.push(text)
          return
        }
        if (node.nodeType !== 1) return
        const tag = node.tagName.toLowerCase()
        if (/^h[1-6]$/.test(tag)) {
          blocks.push('#'.repeat(Number(tag[1])) + ' ' + inline(node).trim())
          return
        }
        if (tag === 'p') {
          const text = inline(node).trim()
          if (text) blocks.push(text)
          return
        }
        if (tag === 'blockquote') {
          const text = inline(node).trim()
          if (text) blocks.push(text.split('\n').map((line) => '> ' + line).join('\n'))
          return
        }
        if (tag === 'pre') {
          blocks.push('```\n' + String(node.textContent || '').replace(/\n$/, '') + '\n```')
          return
        }
        if (tag === 'ul' || tag === 'ol') {
          Array.from(node.children).filter((child) => child.tagName && child.tagName.toLowerCase() === 'li').forEach((li, index) => {
            pushList((tag === 'ol' ? (index + 1) + '. ' : '- ') + inline(li).trim())
          })
          return
        }
        if (tag === 'table') {
          const rows = Array.from(node.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => inline(cell).trim()))
          if (!rows.length) return
          const header = rows[0]
          blocks.push([
            '| ' + header.join(' | ') + ' |',
            '| ' + header.map(() => '---').join(' | ') + ' |',
            ...rows.slice(1).map((row) => '| ' + row.join(' | ') + ' |'),
          ].join('\n'))
          return
        }
        if (tag === 'hr') {
          blocks.push('---')
          return
        }
        if (tag === 'div' || tag === 'span' || tag === 'section') {
          if (node.childElementCount === 0) {
            const text = inline(node).trim()
            if (text) blocks.push(text)
            return
          }
          Array.from(node.childNodes).forEach(block)
          return
        }
        const text = inline(node).trim()
        if (text) blocks.push(text)
      }
      Array.from(root.childNodes).forEach(block)
      return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
    }

    function DocBtn(title, onClick, children, disabled) {
      return h('button', {
        type: 'button',
        className: 'ap-doc-btn',
        title: title,
        disabled: !!disabled,
        onClick: onClick,
      }, children)
    }

    function uploadBytes(cwd, relativePath, file) {
      const url = `/api/agent-pi/files/upload?cwd=${encodeURIComponent(cwd)}&relativePath=${encodeURIComponent(relativePath)}`
      return file.arrayBuffer().then((buf) => fetch(url, { method: 'POST', body: buf })).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || res.statusText)
        return body
      })
    }

    function uploadKbBytes(cwd, file, meta) {
      const qs = new URLSearchParams()
      qs.set('cwd', cwd || '')
      qs.set('fileName', file.name || 'document.bin')
      if (meta && meta.sessionId) qs.set('sessionId', meta.sessionId)
      if (meta && meta.category) qs.set('category', meta.category)
      if (meta && meta.name) qs.set('name', meta.name)
      if (meta && meta.stage) qs.set('stage', '1')
      const url = '/api/agent-pi/kb/bytes?' + qs.toString()
      return file.arrayBuffer().then((buf) => fetch(url, { method: 'POST', body: buf })).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || res.statusText)
        return body
      })
    }

    const FILE_SOURCE = 'workspace-file'
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
    const TEXT_EXT = /\.(md|txt|json|jsonl|csv|tsv|xml|ya?ml|html|css|js|ts|tsx|py|go|rs|java|c|h|cpp|log|ini|toml|svg)$/i
    const ATTACH_MARK = '<!--agent-pi-attachments-->'
    const ATTACH_MARK_END = '<!--/agent-pi-attachments-->'
    const runtime = {
      sessions: null,
      workspaces: null,
      locale: null,
      sessionId: '',
      cwd: '',
      files: [],
      conversation: null,
      uiConversation: null,
      remote: null,
    }
    const attachState = window.__apAttachState || (window.__apAttachState = { bySession: new Map(), listeners: new Set(), last: [], items: [] })
    if (!Array.isArray(attachState.items)) attachState.items = Array.isArray(attachState.last) ? attachState.last : []
    if (!attachState.listeners || typeof attachState.listeners.forEach !== 'function') attachState.listeners = new Set()
    const kbPickState = window.__apKbPick || (window.__apKbPick = {
      entries: [],
      pickedLabel: '',
      notice: '',
      error: '',
      listeners: new Set(),
      addManyPaths: null,
      addBrowserFiles: null,
    })
    if (!Array.isArray(kbPickState.entries)) kbPickState.entries = []
    if (!kbPickState.listeners || typeof kbPickState.listeners.forEach !== 'function') kbPickState.listeners = new Set()

    function kbPickNotify() {
      kbPickState.listeners.forEach((fn) => {
        try { fn() } catch { /* panel already gone */ }
      })
    }

    function kbPickPatch(patch) {
      Object.assign(kbPickState, patch)
      kbPickNotify()
    }

    function kbPickUpsert(entry) {
      if (!entry || !entry.slug) return
      const localName = 'local:' + (entry.name || entry.originalName || '')
      kbPickState.entries = [entry].concat(kbPickState.entries.filter((item) => item && item.slug !== entry.slug && item.slug !== localName))
      kbPickNotify()
    }

    function kbPickerHome() {
      if (typeof document === 'undefined') return null
      let home = document.getElementById('ap-kb-picker-home')
      if (home) return home
      home = document.createElement('div')
      home.id = 'ap-kb-picker-home'
      home.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none'
      document.body.appendChild(home)
      return home
    }

    function ensureKbFileInput() {
      if (typeof document === 'undefined') return null
      let el = document.getElementById('ap-kb-file-input')
      if (el) return el
      el = document.createElement('input')
      el.id = 'ap-kb-file-input'
      el.type = 'file'
      el.multiple = true
      el.className = 'ap-kb-native'
      el.accept = '.md,.markdown,.txt,.json,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp'
      el.addEventListener('change', () => {
        const files = el.files
        const names = Array.from(files || []).map((file) => file.name).join('、')
        if (names) kbPickPatch({ pickedLabel: names, error: '', notice: names })
        const picked = Array.from(files || [])
        kbPickState.pendingFiles = picked
        if (typeof kbPickState.addBrowserFiles === 'function') {
          kbPickState.pendingFiles = []
          kbPickState.addBrowserFiles(picked)
        } else {
          picked.forEach((file) => kbPickUpsert({
            slug: 'local:' + (file.name || 'file'),
            name: file.name || 'file',
            parseStatus: 'staged',
            parseProgress: '已选中，等待界面接手…',
            sizeBytes: file.size || 0,
          }))
        }
        el.value = ''
      })
      const home = kbPickerHome()
      if (home) home.appendChild(el)
      return el
    }

    function parkKbFileInput() {
      const el = ensureKbFileInput()
      const home = kbPickerHome()
      if (el && home && el.parentNode !== home) home.appendChild(el)
      return el
    }

    function pickKbDiskPaths() {
      const desktop = desktopApi()
      kbPickPatch({ error: '', notice: '正在打开文件选择器…' })
      if (desktop && typeof desktop.pickFiles === 'function') {
        return Promise.resolve(desktop.pickFiles()).then((raw) => {
          const paths = normalizePickedPaths(raw)
          if (!paths.length) {
            kbPickPatch({ error: '没有收到文件。请改用下方系统文件框，或把文件拖进本区。', notice: '' })
            return []
          }
          kbPickPatch({ pickedLabel: paths.map(fileName).join('、'), error: '', notice: '本次选择：' + paths.map(fileName).join('、') })
          kbPickState.pendingPaths = paths
          paths.forEach((path) => kbPickUpsert({
            slug: 'local:' + fileName(path),
            name: fileName(path),
            parseStatus: 'staged',
            parseProgress: '正在落入原始文档区…',
            sizeBytes: 0,
          }))
          if (typeof kbPickState.addManyPaths === 'function') {
            kbPickState.pendingPaths = []
            return kbPickState.addManyPaths(paths)
          }
          return paths
        }).catch((err) => {
          kbPickPatch({ error: '选择文件失败：' + String(err && err.message || err), notice: '' })
          return []
        })
      }
      const input = ensureKbFileInput()
      if (input) input.click()
      else kbPickPatch({ error: '无法打开文件选择器。请把文件拖进本区，或粘贴路径。', notice: '' })
      return Promise.resolve([])
    }

    function attachSessionId(props) {
      return resolveSessionId(props) || runtime.sessionId || ''
    }

    function notifyAttach() {
      try {
        window.dispatchEvent(new CustomEvent('agent-pi-attach-changed', { detail: { items: attachState.items || [] } }))
      } catch { /* ignore dispatch in detached windows */ }
      attachState.listeners.forEach((fn) => {
        try { fn() } catch { /* a stale subscriber must not block the rail */ }
      })
    }

    function attachItemsOf(sessionId) {
      if (sessionId) return attachState.bySession.get(sessionId) || []
      if (attachState.items && attachState.items.length) return attachState.items
      return attachState.last || []
    }

    function codexAttachItems(sessionId) {
      if (!sessionId || !attachState.bySession || !attachState.bySession.has(sessionId)) return []
      return attachState.bySession.get(sessionId) || []
    }

    function codexAttachmentToken(item) {
      return item && item.id ? 'id:' + item.id : item
    }

    function setCodexAttachItems(sessionId, items) {
      if (!sessionId) return
      const next = Array.isArray(items) ? items : []
      attachState.bySession.set(sessionId, next)
      if (activeSessionId() !== sessionId) return
      attachState.items = next
      attachState.last = next
      notifyAttach()
    }

    function setAttachItemsFor(sessionId, items) {
      const next = Array.isArray(items) ? items : []
      if (sessionId) attachState.bySession.set(sessionId, next)
      if (sessionId && activeSessionId() !== sessionId) return
      attachState.items = next
      attachState.last = next
      notifyAttach()
    }

    function useAttachItems() {
      const [items, setItems] = React.useState(() => attachItemsOf(activeSessionId()).slice())
      React.useEffect(() => {
        const sync = () => setItems(attachItemsOf(activeSessionId()).slice())
        attachState.listeners.add(sync)
        window.addEventListener('agent-pi-attach-changed', sync)
        sync()
        return () => {
          attachState.listeners.delete(sync)
          window.removeEventListener('agent-pi-attach-changed', sync)
        }
      }, [])
      return [items, (next) => {
        const sessionId = activeSessionId() || 'pending'
        const current = attachItemsOf(sessionId)
        setAttachItemsFor(sessionId, typeof next === 'function' ? next(current) : next)
      }]
    }

    function flattenFiles(nodes, out) {
      for (const node of nodes || []) {
        if (node.type !== 'directory') {
          out.push({
            name: node.name,
            relativePath: (node.relativePath || node.path || '').replace(/\\/g, '/'),
            path: node.path,
          })
        }
        flattenFiles(node.children, out)
      }
      return out
    }

    function fileKind(name, mime) {
      const type = String(mime || '').toLowerCase()
      if (type.startsWith('image/') || IMAGE_EXT.test(String(name || ''))) return 'image'
      const ext = String(name || '').split('.').pop().toLowerCase()
      if (ext === 'pdf') return 'pdf'
      if (TEXT_EXT.test(String(name || '')) || ext === 'md' || ext === 'txt' || ext === 'json' || ext === 'csv') return 'text'
      return 'file'
    }

    function fileTypeLabel(kind, name, loaded) {
      if (kind === 'folder') return '文件夹'
      if (kind === 'image') return '图片'
      if (loaded === false) return '读取中'
      const ext = String(name || '').split('.').pop().toUpperCase()
      return ext || '文件'
    }

    function folderNameOf(dir) {
      return String(dir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(dir || '')
    }

    function showToast(text) {
      if (!text) return
      window.dispatchEvent(new CustomEvent('agent-pi-toast', { detail: { text } }))
    }

    function resolveSessionId(props) {
      return sessionHint(props) || runtime.sessionId || composerFace.sessionId || ''
    }

    function revealComposerAfterAttach() {
      window.dispatchEvent(new Event('agent-pi-close-preview'))
      window.requestAnimationFrame(() => {
        const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
        if (!ta) return
        try { ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } catch {}
        try { ta.focus() } catch {}
      })
    }

    function readDraft() {
      return composerFace.draft || ''
    }

    function currentDraft(props) {
      if (props && props.input && typeof props.input.draft === 'string') return props.input.draft
      const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
      if (ta && typeof ta.value === 'string') return ta.value
      return composerFace.draft || ''
    }

    function setComposerDraft(props, text) {
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        props.inputActions.setDraft(text)
        return
      }
      fillComposer(props, text)
    }

    function stripMentionArtifacts(draft) {
      return String(draft || '')
        .replace(/\uFFFC\s*/g, '')
        .replace(/请读取并依据此文件：[`'“”‘'][^`'“”‘']*[`'“”‘']/g, '')
        .replace(/<!--agent-pi-attachments-->[\s\S]*?<!--\/agent-pi-attachments-->/g, '')
        .replace(/<!--agent-pi-kb-task-->[\s\S]*?<!--\/agent-pi-kb-task-->/g, '')
        .replace(/<!--agent-pi-attachment-tx:[^>]+?-->/g, '')
        .replace(/<attached-image\b[^>]*>[\s\S]*?<\/attached-image>/g, '')
        .replace(/The user attached an image\. The following is a faithful visual reading[\s\S]*$/g, '')
        .replace(/The user attached \d+ images\. The following are faithful visual readings[\s\S]*$/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    function cleanComposerDraft(props) {
      const draft = currentDraft(props)
      const next = stripMentionArtifacts(draft)
      if (next !== draft) setComposerDraft(props, next)
    }

    function filePreviewUrl(props, file) {
      if (fileKind(file.name || file.relativePath) !== 'image') return ''
      const cwd = workspaceCwd(props)
      if (!cwd || !file.path) return ''
      return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}`
    }

    function attachKey(item) {
      return String(item.path || item.relativePath || item.ref || item.name || '').replace(/\\/g, '/')
    }

    async function loadAttachmentContent(cwd, item) {
      const name = item.name || String(item.path || item.relativePath || '').split(/[\\/]/).pop()
      const kind = item.kind || fileKind(name)
      return Object.assign({}, item, {
        loaded: true,
        kind,
        previewUrl: item.previewUrl || (kind === 'image' ? filePreviewUrl({ }, Object.assign({}, item, { name })) : item.previewUrl),
      })
    }

    function workspaceRel(file) {
      let rel = String((file && (file.relativePath || file.ref || file.path || file.name)) || '').replace(/\\/g, '/')
      const cwd = String(workspaceCwd() || '').replace(/\\/g, '/').replace(/\/+$/, '')
      if (cwd && rel.length > cwd.length && rel.slice(0, cwd.length).toLowerCase() === cwd.toLowerCase() && rel.charAt(cwd.length) === '/') {
        rel = rel.slice(cwd.length + 1)
      }
      return rel
    }

    function mentionToken(file) {
      const rel = workspaceRel(file)
      if (!rel) return ''
      return /[\s"'`]/.test(rel) ? '@"' + rel + '"' : '@' + rel
    }

    function formatAttachVisible(items) {
      const tokens = []
      for (const item of items || []) {
        if (!item || item.kind === 'image') continue
        const token = mentionToken(item)
        if (token && tokens.indexOf(token) < 0) tokens.push(token)
      }
      return tokens.join(' ')
    }

    function stripComposerMentions(files) {
      const live = composerPropsRef.current
      const codexPhase = codexTurnPhase(live)
      if (codexPhase === 'preparing' || codexPhase === 'submitting') return
      const attachmentController = attachmentTurnControllers.get(attachmentTurnKey(live))
      if (attachmentController && (attachmentController.phase === 'preparing' || attachmentController.phase === 'submitting')) return
      let draft = currentDraft(live)
      if (!draft) {
        const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
        draft = ta && typeof ta.value === 'string' ? ta.value : ''
      }
      if (!draft) return
      let next = draft
      for (const file of files || []) {
        const token = mentionToken(file)
        if (token) next = next.split(token).join('')
        const rel = String((file && (file.relativePath || file.ref || file.path || '')) || '').replace(/\\/g, '/')
        if (rel) {
          next = next.split('@"' + rel + '"').join('')
          next = next.split('@' + rel).join('')
        }
      }
      next = next
        .replace(/@"(?:Agent Pi Outputs|Official Outputs|工作成果)\/[^"\n]+"/g, '')
        .replace(/[ \t]*\n{2,}/g, '\n')
        .replace(/^[ \t\n]+|[ \t\n]+$/g, '')
      if (next !== draft) setComposerDraft(live, next)
    }

    function attachItemsToComposer(props, items, source) {
      const list = (items || []).filter((item) => item && (item.relativePath || item.ref || item.path || item.name))
      if (!list.length) return
      try {
      const live = snapshotComposer()
      const sid = sessionHint(live) || sessionHint(props) || runtime.sessionId || 'pending'
      const cwd = runtime.cwd
      stripComposerMentions(list)
      cleanComposerDraft(live)
      const incoming = list.map((item) => ({
        id: item.id || attachKey(item) + ':' + Date.now(),
        relativePath: String(item.relativePath || item.ref || item.path || item.name || '').replace(/\\/g, '/'),
        path: item.path || '',
        name: item.name || String(item.relativePath || item.path || item.name || '').split(/[\\/]/).pop(),
        kind: item.kind || fileKind(item.name),
        previewUrl: item.previewUrl || '',
        uploaded: !!item.uploaded,
        loaded: true,
        text: item.text || '',
        size: item.size,
        cwd: item.cwd || cwd || '',
        sessionId: sid,
        file: item.file,
      }))
      const visual = incoming.filter((item) => item.kind === 'image')
      const docs = incoming.filter((item) => item.kind !== 'image')
      if (visual.length) {
        Promise.all(visual.map(async (item) => {
          if (item.file) return item.file
          const url = item.previewUrl || (cwd && item.path
            ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(item.path)}`
            : '')
          if (!url) return null
          const blob = await fetch(url).then((res) => {
            if (!res.ok) throw new Error(res.statusText)
            return res.blob()
          })
          return new File([blob], item.name, { type: blob.type || 'image/png' })
        })).then((files) => attachNativeImages(live, files.filter(Boolean)))
          .catch((err) => showToast(String(err && err.message || err)))
          .finally(() => revealComposerAfterAttach())
      }
      if (!docs.length) {
        if (!visual.length) showToast('该文件已在对话栏中')
        if (!visual.length) revealComposerAfterAttach()
        return
      }
      const merged = attachItemsOf(sid).slice()
      const added = []
      for (const item of docs) {
        const key = attachKey(item)
        if (key && merged.some((row) => attachKey(row) === key || (row.name && row.name === item.name && row.kind === item.kind))) continue
        merged.push(item)
        added.push(item)
      }
      if (!added.length) {
        if (!visual.length) showToast('该文件已在对话栏中')
        revealComposerAfterAttach()
        return
      }
      setAttachItemsFor(sid, merged)
      stripComposerMentions(merged)
      if (source === 'folder') {
        showToast(added.length === 1 ? '已加入文件夹：' + added[0].name : '已加入 ' + added.length + ' 个文件夹')
      } else if (source === 'upload') {
        showToast(added.length === 1 ? '已加入对话：' + added[0].name : '已加入对话 ' + added.length + ' 个文件')
      } else {
        showToast(added.length === 1 ? '已注入对话：' + added[0].name : '已注入对话 ' + added.length + ' 个文件')
      }
      revealComposerAfterAttach()
      } catch (err) {
        const msg = String(err && err.message || err)
        showToast(/#321|Invalid hook call/i.test(msg)
          ? '加入对话失败，请先点菜单「视图 → 刷新」再试'
          : msg)
      }
    }

    function restoreCleanDraft(props) {
      const draft = stripMentionArtifacts(currentDraft(props))
      if (draft !== currentDraft(props)) setComposerDraft(props, draft)
      return draft
    }

    function isLiveSessionId(sid) {
      return Boolean(sid) && sid !== 'pending' && sid !== 'active'
    }
    function attachmentTurnKey(props) {
      return attachSessionId(props) || runtime.sessionId || 'active'
    }

    function attachmentTransactionId(key) {
      return 'attachment:' + key + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 9)
    }

    function attachmentTransactionMarker(token) {
      if (!token || !token.hostRequested || !token.hostTransactionId) return ''
      return '<!--agent-pi-attachment-tx:' + encodeURIComponent(token.hostTransactionId) + '-->'
    }

    function clearAttachmentTurnStatus(token) {
      if (!token || !token.statusTimer) return
      try { window.clearTimeout(token.statusTimer) } catch {}
      token.statusTimer = null
    }

    function submissionHasNewPromptError(snapshot, controller) {
      const current = snapshot && snapshot.promptError
      if (!current) {
        if (controller.preSubmitPromptErrorRef) controller.promptErrorBaselineCleared = true
        return false
      }
      if (current.op !== 'send') return false
      return !controller.preSubmitPromptErrorRef
        || controller.promptErrorBaselineCleared
        || current !== controller.preSubmitPromptErrorRef
        || JSON.stringify(current) !== controller.preSubmitPromptErrorToken
    }

    function submissionOwnsDraft(controller, input) {
      if (!input) return false
      if (input.draft === controller.framedDraft) return true
      return controller.acceptedDraft === ''
        && input.draft === controller.acceptedDraft
        && controller.acceptedDraftRev !== null
        && input.draftRev === controller.acceptedDraftRev
    }

    function disposeAttachmentTurnInput(controller) {
      const unsubscribe = controller.unsubscribeInput
      controller.unsubscribeInput = null
      if (typeof unsubscribe === 'function') {
        try { unsubscribe() } catch {}
      }
    }

    function disposeAttachmentTurnSession(controller) {
      const unsubscribe = controller.unsubscribeSession
      controller.unsubscribeSession = null
      if (typeof unsubscribe === 'function') {
        try { unsubscribe() } catch {}
      }
    }

    function closeAttachmentTurn(key, controller, phase) {
      if (attachmentTurnControllers.get(key) !== controller) return
      controller.phase = phase
      clearAttachmentTurnStatus(controller.attemptToken)
      disposeAttachmentTurnInput(controller)
      disposeAttachmentTurnSession(controller)
      attachmentTurnControllers.delete(key)
    }

    function cancelAttachmentTurnHost(key, controller, attemptToken) {
      const token = attemptToken || controller.attemptToken
      if (!token || !token.hostRequested || !token.hostTransactionId || token.hostDelivered === true) return
      if (!token.prepareSettled) {
        token.cancelWhenPrepared = true
        return
      }
      if (token.cancelRequested) return
      token.cancelRequested = true
      void api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), controller.cwd || '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cancel',
          sessionId: key,
          transactionId: token.hostTransactionId,
        }),
      }).catch(() => {})
    }

    async function commitAttachmentTurnHost(key, controller, token) {
      if (!token.hostRequested) return
      const result = await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), controller.cwd || '', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({
          action: 'commit',
          sessionId: key,
          transactionId: token.hostTransactionId,
        }),
      })
      if (!result || result.committed !== true || result.sessionId !== key
        || result.transactionId !== token.hostTransactionId) {
        throw new Error('附件上下文提交失败，请重试')
      }
      token.hostCommitted = true
    }

    function attachmentTurnStillOwns(key, controller, token, kind) {
      const current = kind === 'codex' ? codexTurnControllers.get(key) : attachmentTurnControllers.get(key)
      return current === controller && controller.attemptToken === token && controller.phase === 'submitting'
    }

    function scheduleAttachmentTurnStatus(key, controller, token, kind, delay) {
      if (!token.hostRequested || !token.hostCommitted || token.statusTimer || token.statusPending) return
      token.statusTimer = window.setTimeout(() => {
        token.statusTimer = null
        void pollAttachmentTurnStatus(key, controller, token, kind)
      }, delay == null ? 750 : delay)
    }

    async function pollAttachmentTurnStatus(key, controller, token, kind) {
      if (!attachmentTurnStillOwns(key, controller, token, kind) || token.statusPending) return
      token.statusPending = true
      try {
        const status = await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), controller.cwd || '', {
          method: 'POST',
          timeoutMs: 5000,
          body: JSON.stringify({
            action: 'status',
            sessionId: key,
            transactionId: token.hostTransactionId,
          }),
        })
        if (!attachmentTurnStillOwns(key, controller, token, kind)) return
        if (!status || status.sessionId !== key || status.transactionId !== token.hostTransactionId) {
          if (kind === 'codex') failCodexTurn(key, controller, controller.inputStore)
          else failAttachmentTurn(key, controller, controller.inputStore)
          return
        }
        if (status.state === 'delivered') {
          token.hostDelivered = true
          if (kind === 'codex') clearCodexTurnAfterSubmit(key, controller)
          else clearAttachmentTurnAfterSubmit(key, controller)
          return
        }
        if (status.state === 'failed' || status.state === 'cancelled'
          || status.state === 'destroyed' || status.state === 'unknown') {
          if (kind === 'codex') failCodexTurn(key, controller, controller.inputStore)
          else failAttachmentTurn(key, controller, controller.inputStore)
          return
        }
      } catch {
        // Transport loss is not a transaction verdict; keep the exact row pending.
      } finally {
        token.statusPending = false
      }
      if (attachmentTurnStillOwns(key, controller, token, kind)) {
        scheduleAttachmentTurnStatus(key, controller, token, kind, 1000)
      }
    }

    function restoreAttachmentTurnItems(key, controller) {
      const current = codexAttachItems(key).slice()
      const currentIds = codexAttachmentIds(current)
      const missing = []
      for (const item of controller.capturedAttachments) {
        const id = codexAttachmentToken(item)
        const index = currentIds.indexOf(id)
        if (index >= 0) currentIds.splice(index, 1)
        else missing.push(item)
      }
      if (missing.length) setCodexAttachItems(key, missing.concat(current))
    }

    function abortAttachmentTurn(key, controller) {
      if (attachmentTurnControllers.get(key) !== controller) return
      cancelAttachmentTurnHost(key, controller)
      closeAttachmentTurn(key, controller, 'failed')
    }

    function failAttachmentTurn(key, controller, inputStore) {
      if (attachmentTurnControllers.get(key) !== controller) return
      let ownsFramedDraft = false
      const authoritativeInputStore = inputStore || controller.inputStore
      try {
        const input = authoritativeInputStore && authoritativeInputStore.getSnapshot()
        ownsFramedDraft = submissionOwnsDraft(controller, input)
      } catch {}
      const live = controller.latestProps
      const originalDraft = controller.originalDraft
      restoreAttachmentTurnItems(key, controller)
      cancelAttachmentTurnHost(key, controller)
      closeAttachmentTurn(key, controller, 'failed')
      if (ownsFramedDraft) {
        try { setComposerDraft(live, originalDraft) } catch {}
      }
    }

    function destroyAttachmentTurn(key, controller) {
      if (attachmentTurnControllers.get(key) !== controller) return
      cancelAttachmentTurnHost(key, controller)
      closeAttachmentTurn(key, controller, 'destroyed')
      attachState.bySession.delete(key)
      if (activeSessionId() === key) {
        attachState.items = []
        attachState.last = []
        notifyAttach()
      }
    }

    function clearAttachmentTurnAfterSubmit(key, controller) {
      if (attachmentTurnControllers.get(key) !== controller || controller.phase !== 'submitting') return
      const capturedIds = controller.capturedAttachmentIds.slice()
      const remainingIds = capturedIds.slice()
      const remaining = codexAttachItems(key).filter((item) => {
        const index = remainingIds.indexOf(codexAttachmentToken(item))
        if (index < 0) return true
        remainingIds.splice(index, 1)
        return false
      })
      cancelAttachmentTurnHost(key, controller)
      closeAttachmentTurn(key, controller, 'succeeded')
      if (capturedIds.length) setCodexAttachItems(key, remaining)
    }

    function settleAttachmentTurn(key, token) {
      const controller = attachmentTurnControllers.get(key)
      if (!controller || controller.phase !== 'submitting' || controller.attemptToken !== token) return
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        failAttachmentTurn(key, controller, null)
        return
      }
      if (!authorities) {
        failAttachmentTurn(key, controller, null)
        return
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      let snapshot
      let inputSnapshot
      try {
        snapshot = sessionSnapshotWithChat(key, session)
        inputSnapshot = inputStore && typeof inputStore.getSnapshot === 'function' ? inputStore.getSnapshot() : null
      } catch {
        failAttachmentTurn(key, controller, inputStore)
        return
      }
      if (!snapshot || !inputSnapshot) {
        failAttachmentTurn(key, controller, inputStore)
        return
      }
      if (snapshot.removed === true) {
        destroyAttachmentTurn(key, controller)
        return
      }
      if (codexUserNode(snapshot, controller)) {
        if (!token.hostRequested) clearAttachmentTurnAfterSubmit(key, controller)
        return
      }
      const previousPhase = controller.lastInputPhase
      const previousDraftRev = controller.lastInputDraftRev
      const inputPhase = inputSnapshot.phase
      const inputDraftRev = typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
      if (inputPhase === 'submitting') controller.sawSubmitting = true
      controller.lastInputPhase = inputPhase
      controller.lastInputDraftRev = inputDraftRev
      if (inputPhase === 'submitting') return
      if (submissionHasNewPromptError(snapshot, controller)) {
        failAttachmentTurn(key, controller, inputStore)
        return
      }
      if (controller.sawSubmitting && previousPhase === 'submitting' && inputPhase === 'plain'
        && inputDraftRev !== null && previousDraftRev !== null) {
        if (inputDraftRev === previousDraftRev) failAttachmentTurn(key, controller, inputStore)
        return
      }
    }

    function watchAttachmentTurnSession(key, controller) {
      if (typeof controller.unsubscribeSession === 'function') return true
      let authorities
      try { authorities = codexTurnAuthorities(key) } catch { return false }
      const session = authorities && authorities.session
      if (!session || typeof session.getSnapshot !== 'function' || typeof session.subscribe !== 'function') return false
      const onSession = () => {
        if (attachmentTurnControllers.get(key) !== controller) return
        let snapshot
        try { snapshot = sessionSnapshotWithChat(key, session) } catch { return }
        if (snapshot && snapshot.removed === true) {
          destroyAttachmentTurn(key, controller)
          return
        }
        const token = controller.attemptToken
        if (controller.phase !== 'submitting' || !token) return
        if (!token.settlementReady) token.settlementQueued = true
        else settleAttachmentTurn(key, token)
      }
      let unsubscribe
      try { unsubscribe = subscribeSessionWithChat(key, session, onSession) } catch { return false }
      if (typeof unsubscribe !== 'function') return false
      if (attachmentTurnControllers.get(key) !== controller) {
        try { unsubscribe() } catch {}
        return false
      }
      controller.unsubscribeSession = unsubscribe
      return true
    }

    function preparingAttachmentTurn(key, token) {
      const controller = attachmentTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return null
      let authorities
      try { authorities = codexTurnAuthorities(key) } catch {
        abortAttachmentTurn(key, controller)
        return null
      }
      if (!authorities) {
        abortAttachmentTurn(key, controller)
        return null
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      if (!session || typeof session.getSnapshot !== 'function' || !inputStore || typeof inputStore.getSnapshot !== 'function') {
        abortAttachmentTurn(key, controller)
        return null
      }
      let sessionSnapshot
      let inputSnapshot
      try {
        sessionSnapshot = sessionSnapshotWithChat(key, session)
        inputSnapshot = inputStore.getSnapshot()
      } catch {
        abortAttachmentTurn(key, controller)
        return null
      }
      if (sessionSnapshot && sessionSnapshot.removed === true) {
        destroyAttachmentTurn(key, controller)
        return null
      }
      const live = controller.latestProps
      const attachmentIds = codexAttachmentIds(codexAttachItems(key))
      if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== 'plain'
        || inputSnapshot.draft !== controller.originalDraft || !live || attachmentTurnKey(live) !== key
        || !sameCodexAttachmentIds(attachmentIds, controller.capturedAttachmentIds)) {
        abortAttachmentTurn(key, controller)
        return null
      }
      return { controller, live, sessionSnapshot, inputStore }
    }

    function attachmentPreparedDraft(key, controller, token) {
      const clean = stripMentionArtifacts(controller.originalDraft)
      const attachLine = formatAttachVisible(controller.capturedAttachments)
      const block = formatKbTaskBlock(key)
      const fallback = controller.capturedAttachments.length ? '请结合附件作答。' : ''
      const body = [clean, attachLine].filter(Boolean).join('\n\n')
      const draft = block
        ? (body ? block + '\n\n' + body : block + (fallback ? '\n\n' + fallback : ''))
        : (body || fallback)
      const marker = attachmentTransactionMarker(token)
      return marker ? [draft, marker].filter(Boolean).join('\n\n') : draft
    }

    async function prepareAttachmentTurn(key, token) {
      const controller = attachmentTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return
      const workspaceMismatch = controller.capturedAttachments.some((item) => item.cwd && controller.cwd
        && normPath(item.cwd) !== normPath(controller.cwd))
      if (workspaceMismatch) {
        token.prepareSettled = true
        abortAttachmentTurn(key, controller)
        showToast('附件来自另一个工作区，请重新添加后再发送')
        return
      }
      const items = controller.capturedAttachments
      const files = items.filter((item) => item.kind !== 'image' && item.kind !== 'folder' && (item.path || item.relativePath || item.name))
      const folders = items.filter((item) => item.kind === 'folder' && (item.path || item.relativePath))
      if (files.length || folders.length) {
        if (!isLiveSessionId(key) || !controller.cwd) {
          token.prepareSettled = true
          abortAttachmentTurn(key, controller)
          showToast('当前会话没有工作区，无法把附件交给模型')
          return
        }
        token.hostRequested = true
        try {
          const result = await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), controller.cwd, {
            method: 'POST',
            timeoutMs: 30000,
            body: JSON.stringify({
              sessionId: key,
              transactionId: token.hostTransactionId,
              cwd: controller.cwd,
              files: files.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
                relativePath: item.relativePath || item.path,
                kind: 'file',
              })),
              folders: folders.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
              })),
              images: [],
            }),
          })
          if (!result || result.stored !== true || result.sessionId !== key
            || result.transactionId !== token.hostTransactionId) {
            throw new Error('附件上下文准备失败，请重试')
          }
          token.prepareSettled = true
          token.hostPrepared = true
          if (token.cancelWhenPrepared || attachmentTurnControllers.get(key) !== controller) {
            cancelAttachmentTurnHost(key, controller, token)
            return
          }
        } catch (err) {
          token.prepareSettled = true
          cancelAttachmentTurnHost(key, controller, token)
          abortAttachmentTurn(key, controller)
          showToast(String(err && err.message || err))
          return
        }
      } else {
        token.prepareSettled = true
      }
      const prepared = preparingAttachmentTurn(key, token)
      if (!prepared) return
      controller.framedDraft = attachmentPreparedDraft(key, controller, token)
      requestAnimationFrame(() => { void commitAttachmentTurn(key, token) })
    }

    async function commitAttachmentTurn(key, token) {
      let prepared = preparingAttachmentTurn(key, token)
      if (!prepared) return
      const controller = prepared.controller
      if (token.hostRequested) {
        try {
          await commitAttachmentTurnHost(key, controller, token)
        } catch (error) {
          cancelAttachmentTurnHost(key, controller, token)
          failAttachmentTurn(key, controller, prepared.inputStore)
          showToast(String(error && error.message || error))
          return
        }
      }
      prepared = preparingAttachmentTurn(key, token)
      if (!prepared) return
      const inputStore = prepared.inputStore
      try {
        if (typeof inputStore.subscribe !== 'function' || typeof controller.unsubscribeSession !== 'function') {
          throw new Error('attachment settlement subscriptions unavailable')
        }
        const actions = prepared.live && prepared.live.inputActions
        const submit = actions && actions.__apOrigSubmit
        if (typeof submit !== 'function') throw new Error('attachment original submit unavailable')
        controller.preSubmitUserNodeWatermark = codexUserNodeWatermark(prepared.sessionSnapshot)
        controller.preSubmitPromptErrorRef = prepared.sessionSnapshot.promptError || null
        controller.preSubmitPromptErrorToken = JSON.stringify(prepared.sessionSnapshot.promptError || null)
        controller.promptErrorBaselineCleared = false
        controller.phase = 'submitting'
        setComposerDraft(prepared.live, controller.framedDraft)
        const inputSnapshot = inputStore.getSnapshot()
        controller.lastInputPhase = inputSnapshot && inputSnapshot.phase
        controller.lastInputDraftRev = inputSnapshot && typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
        controller.sawSubmitting = controller.lastInputPhase === 'submitting'
        token.settlementReady = false
        token.settlementQueued = false
        const onSettlement = () => {
          if (!token.settlementReady) {
            token.settlementQueued = true
            return
          }
          settleAttachmentTurn(key, token)
        }
        const unsubscribe = inputStore.subscribe(onSettlement)
        if (typeof unsubscribe !== 'function') throw new Error('attachment input settlement subscription unavailable')
        controller.unsubscribeInput = unsubscribe
        token.settlementReady = true
        submit()
        const acceptedInput = inputStore.getSnapshot()
        controller.acceptedDraft = acceptedInput && typeof acceptedInput.draft === 'string' ? acceptedInput.draft : null
        controller.acceptedDraftRev = acceptedInput && typeof acceptedInput.draftRev === 'number' ? acceptedInput.draftRev : null
        scheduleAttachmentTurnStatus(key, controller, token, 'normal', 250)
        if (token.settlementQueued) settleAttachmentTurn(key, token)
      } catch {
        failAttachmentTurn(key, controller, inputStore)
      }
    }

    function submitAttachmentTurn(props) {
      const key = attachmentTurnKey(props)
      if (attachmentTurnControllers.has(key)) return
      const codexController = codexTurnControllers.get(key)
      if (codexController && (codexController.phase === 'preparing' || codexController.phase === 'submitting')) {
        showToast('当前会话已有 Codex 附件事务，请等待完成后重试')
        return
      }
      let authorities
      let sessionSnapshot
      let inputSnapshot
      try {
        authorities = codexTurnAuthorities(key)
        if (!authorities || !authorities.session || !authorities.inputStore) {
          showToast('当前会话正在切换，请稍后重试')
          return
        }
        sessionSnapshot = sessionSnapshotWithChat(key, authorities.session)
        inputSnapshot = authorities.inputStore.getSnapshot()
      } catch {
        showToast('当前会话状态不可用，请刷新后重试')
        return
      }
      if (!sessionSnapshot || sessionSnapshot.removed === true || !inputSnapshot
        || inputSnapshot.phase !== 'plain' || typeof inputSnapshot.draft !== 'string') {
        showToast('当前会话正在切换或输入状态忙，请稍后重试')
        return
      }
      const cleanDraft = stripMentionArtifacts(inputSnapshot.draft)
      if (cleanDraft !== inputSnapshot.draft) {
        try {
          setComposerDraft(props, cleanDraft)
          inputSnapshot = authorities.inputStore.getSnapshot()
        } catch { return }
      }
      const attachments = codexAttachItems(key).slice()
      const token = {
        prepareSettled: false,
        cancelWhenPrepared: false,
        cancelRequested: false,
        hostRequested: false,
        hostPrepared: false,
        hostCommitted: false,
        hostTransactionId: attachmentTransactionId(key),
      }
      const controller = {
        phase: 'preparing',
        latestProps: props,
        attemptToken: token,
        originalDraft: inputSnapshot.draft,
        framedDraft: '',
        capturedAttachments: attachments,
        capturedAttachmentIds: codexAttachmentIds(attachments),
        preSubmitUserNodeWatermark: -1,
        preSubmitPromptErrorRef: sessionSnapshot.promptError || null,
        preSubmitPromptErrorToken: JSON.stringify(sessionSnapshot.promptError || null),
        promptErrorBaselineCleared: false,
        lastInputPhase: null,
        lastInputDraftRev: null,
        sawSubmitting: false,
        acceptedDraft: null,
        acceptedDraftRev: null,
        cwd: workspaceCwd(props),
        inputStore: authorities.inputStore,
        unsubscribeSession: null,
        unsubscribeInput: null,
      }
      attachmentTurnControllers.set(key, controller)
      if (!watchAttachmentTurnSession(key, controller)) {
        closeAttachmentTurn(key, controller, 'failed')
        showToast('当前会话状态不可用，请刷新后重试')
        return
      }
      void prepareAttachmentTurn(key, token)
    }

    function foldAndSubmit(props) {
      submitAttachmentTurn(props)
    }

    function failCodexPreparation(key, token, message) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return
      rearmCodexTurn(key, controller)
      if (message) showToast(message)
    }

    function codexPreparedDraft(key, controller, token) {
      const clean = stripMentionArtifacts(controller.originalDraft)
      const items = controller.capturedAttachments
      const attachLine = formatAttachVisible(items)
      const block = formatKbTaskBlock(key)
      const fallback = items.length ? '请结合附件作答。' : ''
      const body = [clean, attachLine].filter(Boolean).join('\n\n')
      const text = block
        ? (body ? block + '\n\n' + body : block + (fallback ? '\n\n' + fallback : ''))
        : (body || fallback)
      const delegation = buildCodexTurnDelegation(text)
      const marker = attachmentTransactionMarker(token)
      return marker ? delegation + '\n\n' + marker : delegation
    }

    async function prepareCodexTurn(key, token) {
      const desktop = window.agentPiDesktop
      try {
        const status = !desktop || typeof desktop.codexAuthStatus !== 'function'
          ? null
          : await desktop.codexAuthStatus()
        if (!status || status.available !== true || status.state !== 'logged-in') throw new Error('Codex unavailable')
      } catch {
        failCodexPreparation(key, token, 'Codex 尚未登录或运行时不可用，请到设置 → Codex 智能体完成登录。')
        return
      }
      let prepared = preparingCodexTurn(key, token)
      if (!prepared) return
      const items = prepared.controller.capturedAttachments
      const cwd = prepared.live && prepared.live.cwd || workspaceCwd(prepared.live)
      const workspaceMismatch = items.some((item) => item.cwd && cwd && normPath(item.cwd) !== normPath(cwd))
      if (workspaceMismatch) {
        failCodexPreparation(key, token, '附件来自另一个工作区，请重新添加后再发送')
        return
      }
      const files = items.filter((item) => item.kind !== 'image' && item.kind !== 'folder' && (item.path || item.relativePath || item.name))
      const folders = items.filter((item) => item.kind === 'folder' && (item.path || item.relativePath))
      prepared.controller.cwd = cwd || ''
      if (files.length || folders.length) {
        if (!isLiveSessionId(key) || !cwd) {
          failCodexPreparation(key, token, '当前会话没有工作区，无法把附件交给模型')
          return
        }
        token.hostRequested = true
        try {
          const result = await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), cwd, {
            method: 'POST',
            timeoutMs: 30000,
            body: JSON.stringify({
              sessionId: key,
              transactionId: token.hostTransactionId,
              cwd,
              files: files.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
                relativePath: item.relativePath || item.path,
                kind: 'file',
              })),
              folders: folders.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
              })),
              images: [],
            }),
          })
          if (!result || result.stored !== true || result.sessionId !== key
            || result.transactionId !== token.hostTransactionId) {
            throw new Error('附件上下文准备失败，请重试')
          }
          token.prepareSettled = true
          token.hostPrepared = true
          if (token.cancelWhenPrepared || codexTurnControllers.get(key) !== prepared.controller) {
            cancelAttachmentTurnHost(key, prepared.controller, token)
            return
          }
        } catch (err) {
          token.prepareSettled = true
          cancelAttachmentTurnHost(key, prepared.controller, token)
          failCodexPreparation(key, token, String(err && err.message || err))
          return
        }
        prepared = preparingCodexTurn(key, token)
        if (!prepared) return
      } else {
        token.prepareSettled = true
      }
      try {
        prepared.controller.framedDraft = codexPreparedDraft(key, prepared.controller, token)
        requestAnimationFrame(() => { void commitCodexTurn(key, token) })
      } catch {
        failCodexPreparation(key, token)
      }
    }

    async function commitCodexTurn(key, token) {
      let prepared = preparingCodexTurn(key, token)
      if (!prepared) return
      const controller = prepared.controller
      if (token.hostRequested) {
        try {
          await commitAttachmentTurnHost(key, controller, token)
        } catch (error) {
          cancelAttachmentTurnHost(key, controller, token)
          failCodexTurn(key, controller, prepared.inputStore)
          showToast(String(error && error.message || error))
          return
        }
      }
      prepared = preparingCodexTurn(key, token)
      if (!prepared) return
      const inputStore = prepared.inputStore
      try {
        if (typeof inputStore.subscribe !== 'function' || !watchCodexTurnSession(key, controller)) throw new Error('Codex settlement subscriptions unavailable')
        const actions = prepared.live && prepared.live.inputActions
        const submit = actions && actions.__apOrigSubmit
        if (typeof submit !== 'function') throw new Error('Codex original submit unavailable')
        controller.preSubmitUserNodeWatermark = codexUserNodeWatermark(prepared.sessionSnapshot)
        controller.preSubmitPromptErrorRef = prepared.sessionSnapshot.promptError || null
        controller.preSubmitPromptErrorToken = JSON.stringify(prepared.sessionSnapshot.promptError || null)
        controller.promptErrorBaselineCleared = false
        controller.phase = 'submitting'
        setComposerDraft(prepared.live, controller.framedDraft)
        const inputSnapshot = inputStore.getSnapshot()
        controller.lastInputPhase = inputSnapshot && inputSnapshot.phase
        controller.lastInputDraftRev = inputSnapshot && typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
        controller.sawSubmitting = controller.lastInputPhase === 'submitting'
        notifyCodexTurn()
        token.settlementReady = false
        token.settlementQueued = false
        const onSettlement = () => {
          if (!token.settlementReady) {
            token.settlementQueued = true
            return
          }
          settleCodexTurn(key, token)
        }
        const unsubscribeInput = inputStore.subscribe(onSettlement)
        if (typeof unsubscribeInput !== 'function') throw new Error('Codex input settlement subscription unavailable')
        controller.unsubscribeInput = unsubscribeInput
        token.settlementReady = true
        submit()
        const acceptedInput = inputStore.getSnapshot()
        controller.acceptedDraft = acceptedInput && typeof acceptedInput.draft === 'string' ? acceptedInput.draft : null
        controller.acceptedDraftRev = acceptedInput && typeof acceptedInput.draftRev === 'number' ? acceptedInput.draftRev : null
        scheduleAttachmentTurnStatus(key, controller, token, 'codex', 250)
        if (token.settlementQueued) settleCodexTurn(key, token)
      } catch {
        failCodexTurn(key, controller, inputStore)
      }
    }

    function submitCodexTurn(props) {
      const key = codexTurnKey(props)
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'armed') return
      if (attachmentTurnControllers.has(key)) {
        showToast('当前会话已有附件发送事务，请等待完成后重试')
        return
      }
      controller.latestProps = props
      let authorities
      let sessionSnapshot
      let inputSnapshot
      try {
        authorities = codexTurnAuthorities(key)
        if (!authorities) {
          showToast('当前会话正在切换，请稍后重试')
          return
        }
        if (!authorities.session || typeof authorities.session.getSnapshot !== 'function'
          || !authorities.inputStore || typeof authorities.inputStore.getSnapshot !== 'function') return
        sessionSnapshot = sessionSnapshotWithChat(key, authorities.session)
        inputSnapshot = authorities.inputStore.getSnapshot()
      } catch {
        return
      }
      if (sessionSnapshot && sessionSnapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return
      }
      if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== 'plain' || typeof inputSnapshot.draft !== 'string') return
      const attachments = codexAttachItems(key).slice()
      const token = {
        prepareSettled: false,
        cancelWhenPrepared: false,
        cancelRequested: false,
        hostRequested: false,
        hostPrepared: false,
        hostCommitted: false,
        hostTransactionId: attachmentTransactionId(key),
      }
      controller.phase = 'preparing'
      controller.attemptToken = token
      controller.originalDraft = inputSnapshot.draft
      controller.framedDraft = ''
      controller.capturedAttachments = attachments
      controller.capturedAttachmentIds = codexAttachmentIds(attachments)
      controller.inputStore = authorities.inputStore
      controller.preSubmitUserNodeWatermark = -1
      controller.preSubmitPromptErrorRef = sessionSnapshot.promptError || null
      controller.preSubmitPromptErrorToken = JSON.stringify(sessionSnapshot.promptError || null)
      controller.promptErrorBaselineCleared = false
      controller.acceptedDraft = null
      controller.acceptedDraftRev = null
      notifyCodexTurn()
      void prepareCodexTurn(key, token)
    }

    function wrapComposerSubmit(props) {
      const actions = props && props.inputActions
      if (!actions || typeof actions.submit !== 'function') return
      actions.__apLatestProps = props
      trackCodexTurnProps(props)
      const attachmentController = attachmentTurnControllers.get(attachmentTurnKey(props))
      if (attachmentController) attachmentController.latestProps = props
      if (actions.__apFoldWrapped) return
      const orig = actions.submit.bind(actions)
      actions.__apOrigSubmit = orig
      actions.submit = () => {
        const live = actions.__apLatestProps || props
        const before = currentDraft(live)
        if (codexTurnArmed(live)) {
          submitCodexTurn(live)
          return
        }
        const attachmentKey = attachmentTurnKey(live)
        if (attachmentTurnControllers.has(attachmentKey)) return
        restoreCleanDraft(live)
        const sid = sessionHint(live) || runtime.sessionId || 'active'
        const hasAttach = codexAttachItems(attachmentKey).length > 0
        const hasKb = kbTaskOf(sid).slugs.length > 0
        if (hasAttach) {
          submitAttachmentTurn(live)
          return
        }
        if (hasKb && stripMentionArtifacts(currentDraft(live))) {
          submitAttachmentTurn(live)
          return
        }
        if (stripMentionArtifacts(before) !== before) {
          requestAnimationFrame(() => orig())
          return
        }
        orig()
      }
      actions.__apFoldWrapped = true
    }

    function dropNativeImages(files) {
      try {
        const dt = new DataTransfer()
        files.forEach((file) => dt.items.add(file))
        document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
        return true
      } catch {
        return false
      }
    }

    function nativeImageMime(file) {
      const type = String(file && file.type || '').toLowerCase()
      if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp' || type === 'image/gif') return type
      const ext = String(file && file.name || '').split('.').pop().toLowerCase()
      if (ext === 'png') return 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
      if (ext === 'webp') return 'image/webp'
      if (ext === 'gif') return 'image/gif'
      return ''
    }

    async function asNativeImageFile(file) {
      if (!file) return null
      const mime = nativeImageMime(file)
      if (mime) {
        if (mime === file.type) return file
        const ext = mime === 'image/jpeg' ? '.jpg' : '.' + mime.slice('image/'.length)
        return new File([file], String(file.name || 'image').replace(/\.[^.]+$/, ext), { type: mime })
      }
      try {
        const bitmap = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap.close()
        const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', 0.86))
        if (!blob) return null
        return new File([blob], String(file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
      } catch {
        return null
      }
    }

    function addNativeImageFiles(props, files) {
      const list = (files || []).filter(Boolean)
      if (!list.length) return false
      const conversation = runtime.conversation
      const actions = props && props.inputActions
      if (conversation && typeof conversation.createDraftImages === 'function' && actions && typeof actions.addImages === 'function') {
        try {
          const images = conversation.createDraftImages(list)
          if (!actions.addImages(images.map((row) => row.id))) {
            if (typeof conversation.releaseDraftImages === 'function') conversation.releaseDraftImages(images)
            showToast('无法加入图片（可能超出张数或大小限制）')
            return false
          }
          showToast(list.length === 1 ? '已加入图片 ' + list[0].name : '已加入 ' + list.length + ' 张图片')
          return true
        } catch (err) {
          showToast(String(err && err.message || err))
        }
      }
      if (dropNativeImages(list)) {
        showToast(list.length === 1 ? '已加入图片 ' + list[0].name : '已加入 ' + list.length + ' 张图片')
        return true
      }
      showToast('图片未能加入输入框，请把图片直接拖到输入框重试。')
      return false
    }

    async function attachNativeImages(props, imageFiles) {
      const native = []
      for (const file of imageFiles || []) {
        const converted = await asNativeImageFile(file)
        if (converted) native.push(converted)
        else showToast('不支持的图片格式：' + (file && file.name || 'image'))
      }
      if (native.length) addNativeImageFiles(props, native)
      return native.length
    }

    function snapshotFileList(fileList) {
      return Array.from(fileList || [])
    }

    function attachUploadedItems(props, items, imageFiles) {
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      const live = snapshotComposer()
      const dockItems = (items || []).filter((item) => item.kind !== 'image')
      if (imageFiles && imageFiles.length) {
        attachNativeImages(live, imageFiles).catch((err) => {
          showToast(String(err && err.message || err))
        })
      }
      if (!dockItems.length) return
      attachItemsToComposer(live, dockItems, 'upload')
    }

    function attachDiskPaths(props, paths, source) {
      const items = (paths || []).filter(Boolean).map((path) => {
        const name = folderNameOf(path)
        return {
          id: path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
          relativePath: String(path).replace(/\\/g, '/'),
          path: path,
          name: name,
          kind: fileKind(name),
          loaded: true,
        }
      })
      attachItemsToComposer(snapshotComposer(), items, source || 'upload')
    }

    function mergeImportedItems(props, imported) {
      const sid = resolveSessionId(props) || resolveSessionId(composerPropsRef.current) || runtime.sessionId || 'pending'
      const current = attachItemsOf(sid).slice()
      for (const item of imported || []) {
        const idx = current.findIndex((row) => row.name === item.name && row.kind === item.kind)
        if (idx >= 0) {
          const stableId = current[idx].id
          current[idx] = Object.assign({}, current[idx], item)
          if (stableId) current[idx].id = stableId
        }
        else if (!current.some((row) => attachKey(row) === attachKey(item))) current.push(item)
      }
      setAttachItemsFor(sid, current)
    }

    async function uploadFileList(cwd, fileList, props) {
      const files = snapshotFileList(fileList)
      if (!files.length) {
        showToast('没有选中文件')
        return 0
      }
      attachItemsToComposer(snapshotComposer(), files.map((file) => ({
        id: (file.webkitRelativePath || file.name) + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
        relativePath: String(file.webkitRelativePath || file.name).replace(/\\/g, '/'),
        path: '',
        name: file.name,
        kind: fileKind(file.name, file.type),
        previewUrl: fileKind(file.name, file.type) === 'image' ? URL.createObjectURL(file) : '',
        uploaded: false,
        loaded: true,
        size: file.size,
        file: file,
      })), 'upload')
      if (!cwd) return files.length
      const items = []
      const imageFiles = []
      for (const file of files) {
        const rel = file.webkitRelativePath || file.name
        try {
          const saved = await uploadBytes(cwd, rel, file)
          const relativePath = ((saved && saved.relativePath) || ('Agent Pi Uploads/' + String(rel).replace(/\\/g, '/'))).replace(/\\/g, '/')
          const kind = fileKind(file.name, file.type)
          items.push({
            id: relativePath + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
            relativePath: relativePath,
            path: saved && saved.path,
            name: file.name,
            kind: kind,
            previewUrl: kind === 'image' ? URL.createObjectURL(file) : '',
            uploaded: true,
            loaded: true,
            size: file.size,
            cwd,
            sessionId: resolveSessionId(props),
          })
          if (kind === 'image') imageFiles.push(file)
        } catch (err) {
          showToast('已加入对话，但未能写入工作区：' + String(err && err.message || err))
        }
      }
      if (items.length) mergeImportedItems(snapshotComposer(), items)
      if (imageFiles.length) attachNativeImages(snapshotComposer(), imageFiles).catch((err) => showToast(String(err && err.message || err)))
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      return files.length
    }

    async function importDiskPaths(cwd, paths, props) {
      if (!cwd) return 0
      const list = (paths || []).filter(Boolean)
      if (!list.length) return 0
      const body = await api('/api/agent-pi/files/import', cwd, {
        method: 'POST',
        body: JSON.stringify({ paths: list }),
      })
      const files = body.files || []
      if (!files.length) return 0
      const items = files.map((file) => {
        const name = file.name || String(file.relativePath || '').split(/[\\/]/).pop()
        const kind = fileKind(name)
        return {
          id: (file.relativePath || name) + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
          relativePath: String(file.relativePath || '').replace(/\\/g, '/'),
          path: file.path,
          name: name,
          kind: kind,
          cwd,
          sessionId: resolveSessionId(props),
          previewUrl: kind === 'image' && file.path
            ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}`
            : '',
          uploaded: true,
          loaded: true,
          size: file.size,
        }
      })
      mergeImportedItems(props, items)
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      return files.length
    }

    async function chooseAndUpload(cwd, props, mode, inputs) {
      const live = snapshotComposer()
      if (mode === 'folder') {
        await chooseFolderForChat(cwd, live)
        return
      }
      const desktop = desktopApi()
      try {
        if (desktop && typeof desktop.pickFiles === 'function') {
          const paths = normalizePickedPaths(await desktop.pickFiles())
          if (!paths.length) return
          attachDiskPaths(live, paths, 'upload')
          if (cwd) {
            importDiskPaths(cwd, paths, live).catch((err) => {
              showToast('文件已加入对话，但未能拷进工作区：' + String(err && err.message || err))
            })
          }
          return
        }
      } catch (err) {
        showToast('选择文件失败：' + String(err && err.message || err))
        return
      }
      const input = inputs && inputs.fileInput
      if (input && input.current) input.current.click()
      else showToast('无法打开系统文件选择框，请改用右侧资源文件的「注入对话」')
    }

    function attachFolderPath(props, dir) {
      const path = String(dir || '').trim()
      if (!path) return
      const name = folderNameOf(path)
      attachItemsToComposer(snapshotComposer(), [{
        id: 'folder:' + path + ':' + Date.now(),
        relativePath: path,
        path: path,
        name: name,
        kind: 'folder',
      }], 'folder')
    }

    async function chooseFolderForChat(_cwd, props) {
      const live = snapshotComposer()
      const desktop = desktopApi()
      if (desktop && typeof desktop.pickFolder === 'function') {
        try {
          const dir = await desktop.pickFolder()
          if (dir) attachFolderPath(live, dir)
          return
        } catch (err) {
          showToast('选择文件夹失败：' + String(err && err.message || err))
        }
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
      input.multiple = true
      input.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
      input.addEventListener('change', () => {
        const files = snapshotFileList(input.files)
        input.remove()
        if (!files.length) return
        const rel = String(files[0].webkitRelativePath || files[0].name)
        attachFolderPath(live, rel.split(/[\\/]/)[0] || 'folder')
      })
      document.body.appendChild(input)
      input.click()
    }

    function mentionInChat(props, file) {
      if (file && file.type === 'directory') {
        attachFolderPath(props, file.path || file.relativePath)
        return
      }
      const rel = (file.relativePath || file.path || '').replace(/\\/g, '/')
      const name = file.name || rel.split(/[\\/]/).pop() || rel
      const items = [{
        id: rel + ':' + Date.now(),
        relativePath: rel,
        path: file.path,
        name: name,
        kind: fileKind(name),
        previewUrl: filePreviewUrl(props, file),
        size: file.size,
      }]
      stripComposerMentions([{ relativePath: rel, path: file.path, name: name }])
      attachItemsToComposer(snapshotComposer(), items, 'mention')
    }

    function FileContextMenu(props) {
      const menu = props.menu
      React.useEffect(() => {
        if (!menu) return undefined
        let armed = false
        const arm = window.setTimeout(() => { armed = true }, 280)
        const close = (event) => {
          if (!armed || (event && event.button === 2)) return
          const node = event && event.target
          if (node && node.closest && node.closest('.ap-menu')) return
          props.onClose()
        }
        window.addEventListener('pointerdown', close, true)
        return () => {
          window.clearTimeout(arm)
          window.removeEventListener('pointerdown', close, true)
        }
      }, [menu && menu.x, menu && menu.y, menu && menu.file])
      if (!menu) return null
      const node = h('div', {
        className: 'ap-menu',
        style: { left: menu.x + 'px', top: menu.y + 'px' },
        onClick: (e) => e.stopPropagation(),
        onContextMenu: (e) => e.stopPropagation(),
      }, props.children)
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function readReasoningEffort() {
      const label = readComposerModelLabel()
      if (/\bmax\b/i.test(label)) return 'max'
      if (/\bhigh\b/i.test(label)) return 'high'
      if (/\bmedium\b/i.test(label)) return 'medium'
      if (/\blow\b/i.test(label)) return 'low'
      return undefined
    }

    function readComposerModelLabel() {
      const seat = document.querySelector('[data-slot="conversation.input.model"]')
      return seat ? String(seat.textContent || '').replace(/\s+/g, ' ').trim() : ''
    }

    function sourceLabel(source) {
      if (source === 'official-output') return langState.lang === 'zh' ? '正式' : 'Official'
      if (source === 'attachment') return langState.lang === 'zh' ? '上传' : 'Upload'
      if (source === 'tender-workspace') return langState.lang === 'zh' ? '项目' : 'Project'
      return null
    }

    function displayFileName(file) {
      if (file.source === 'official-output' && (file.name === 'Official Outputs' || file.name === '工作成果')) return tAp('files.officialName')
      if (file.source === 'attachment' && (file.name === '上传资料' || file.name === 'Agent Pi Uploads')) return tAp('files.uploads')
      return file.name
    }

    function formatKbBytes(n) {
      const value = Number(n) || 0
      if (value < 1024) return value + ' B'
      if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
      return (value / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function importWorkspaceFileToKb(cwd, file, props) {
      const packLike = looksLikeKbPackName(file)
      if (!file || (file.type === 'directory' && !packLike)) {
        showToast('请选文件，或选含 pack.json 的知识包文件夹')
        return Promise.resolve()
      }
      const path = String(file.path || '').trim()
      if (!path) {
        showToast('这个文件没有磁盘路径')
        return Promise.resolve()
      }
      const sessionId = resolveSessionId(props) || runtime.sessionId || 'active'
      const action = packLike ? 'import-pack' : 'stage'
      return api('/api/agent-pi/kb', cwd, {
        method: 'POST',
        body: JSON.stringify({
          action,
          path,
          sessionId,
          category: looksLikeUserTemplateName(file.name || path) ? '用户模板' : '规范',
        }),
      }).then((staged) => {
        const slug = staged && staged.entry && staged.entry.slug
        if (!slug) throw new Error('落入知识库失败')
        if (staged.entry && staged.entry.parseStatus === 'ready') {
          const asTemplate = staged.entry.category === '用户模板' || staged.entry.category === '用户模版'
          showToast((packLike ? '知识包已入库：' : (asTemplate ? '已加入知识库（用户模板）：' : '已加入知识库：')) + (file.name || slug))
          window.dispatchEvent(new CustomEvent('agent-pi-kb-changed'))
          return
        }
        return api('/api/agent-pi/kb', cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'parse', slug, sessionId }),
        }).then(() => {
          showToast('已加入知识库并开始解析：' + (file.name || slug))
          window.dispatchEvent(new CustomEvent('agent-pi-kb-changed'))
        })
      }).catch((err) => {
        showToast('导入知识库失败：' + String(err && err.message || err))
      })
    }

    function kbTitle(entry) {
      const raw = String((entry && (entry.title || entry.originalName || entry.name)) || '')
      const base = raw.replace(/^.*[\\/]/, '')
      if (!base || /^full\.md$/i.test(base)) return base || (entry && entry.slug) || '文档'
      return base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '') || base
    }

    function statusChip(status) {
      if (status === 'blocked') return h('span', { className: 'ap-chip warn' }, '门禁未过')
      if (status === 'done') return h('span', { className: 'ap-chip ok' }, '已完成')
      if (status === 'running') return h('span', { className: 'ap-chip live' }, '进行中')
      return null
    }

    function FilePickPanel(props) {
      const cwd = props.cwd
      const selected = props.selected || []
      const [nodes, setNodes] = React.useState([])
      const [extra, setExtra] = React.useState('')
      const selectedSet = React.useMemo(() => new Set(selected), [selected])

      React.useEffect(() => {
        if (!cwd) return
        api('/api/agent-pi/files', cwd, { method: 'GET' })
          .then((body) => setNodes(body.files || []))
          .catch(() => setNodes([]))
      }, [cwd])

      const expand = (node) => {
        if (node.type !== 'directory') return
        api('/api/agent-pi/files?parentPath=' + encodeURIComponent(node.path), cwd, { method: 'GET' })
          .then((body) => setNodes((current) => replaceChildren(current, node.path, body.files || [])))
          .catch(() => {})
      }

      const renderNode = (node, depth) => {
        const on = selectedSet.has(node.path)
        return h('div', { key: node.path },
          h('button', {
            type: 'button',
            className: 'ap-tree-btn' + (on ? ' on' : ''),
            style: { paddingLeft: 6 + depth * 10 },
            onClick: () => {
              if (node.type === 'directory') expand(node)
              else props.onToggle(node.path, node.name)
            },
          },
            Icon(node.type === 'directory' ? 'folder' : 'file', 13),
            h('span', { className: 'ap-tree-name', title: node.path }, node.name),
            node.type !== 'directory' && on ? h('span', { className: 'ap-chip ok' }, '已选') : null,
          ),
          node.children && node.children.length
            ? h('div', { className: 'ap-tree-kids' }, node.children.map((child) => renderNode(child, depth + 1)))
            : null,
        )
      }

      const desktop = desktopApi()
      return h('div', null,
        h('p', { className: 'ap-sub' }, '只登记本次明确选择的文件。系统不会把项目工作目录自动当作资料库扫描。'),
        h('p', { className: 'ap-sub' }, '可同时附企业工效表（文件名含「工效 / productivity / 日产」）。有企业工效时优先于网络调研；组价稿里改过的工效和关键资源价，保存确认后落成该项目人工复核准确数并全局重算数量。'),
        h('div', { className: 'ap-row', style: { margin: '8px 0' } },
          desktop && typeof desktop.pickFiles === 'function'
            ? h('button', {
              type: 'button',
              className: 'ap-btn',
              onClick: () => {
                desktop.pickFiles().then((paths) => {
                  normalizePickedPaths(paths).forEach((path) => props.onToggle(path, fileName(path), true))
                })
              },
            }, Icon('filePlus', 14), '添加依据和待分析文件')
            : null,
        ),
        h('div', { className: 'ap-tree-pick' },
          nodes.length ? nodes.map((node) => renderNode(node, 0)) : h('div', { className: 'ap-files-empty' }, '工作区内暂无可选文件'),
        ),
        h('label', null, '或粘贴绝对路径（每行一个）'),
        h('input', {
          value: extra,
          placeholder: 'C:\\\\path\\\\to\\\\file.pdf',
          onChange: (e) => setExtra(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter' && extra.trim()) {
              extra.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((path) => props.onToggle(path, fileName(path), true))
              setExtra('')
            }
          },
        }),
        selected.length
          ? h('div', { style: { marginTop: 8 } }, selected.map((path) => h('div', { className: 'ap-file-item', key: path },
            h('span', { title: path }, fileName(path)),
            h('button', { type: 'button', className: 'ap-btn ghost', onClick: () => props.onToggle(path) }, '移除'),
          )))
          : h('p', { className: 'ap-sub' }, '可暂不添加，进入项目后继续上传。'),
      )
    }

    const { KnowledgeBasePanel, formatKbTaskBlock, kbTaskOf } = createKnowledgeBasePanel({
      Icon,
      KB_PRESET_CATEGORIES,
      React,
      apJoin,
      api,
      apiBlob,
      desktopApi,
      diskPathOf,
      downloadBlob,
      ensureKbFileInput,
      fileIconClass,
      fileIconName,
      fileName,
      formatKbBytes,
      groupKbEntries,
      h,
      kbCategoryHint,
      kbCategoryLabel,
      kbChatImportCopy,
      kbFidelityLabel,
      kbIngestKind,
      kbIngestLabel,
      kbLandingCardVisible,
      kbPickPatch,
      kbPickState,
      kbPickUpsert,
      kbProgressText,
      kbTitle,
      mergeKbEntries,
      normalizePickedPaths,
      parkKbFileInput,
      resolveSessionId,
      runtime,
      sortKbCategories,
      tAp,
      uploadKbBytes,
      useApLang,
    })


    function joinSlugs(value) {
      return Array.isArray(value) ? value.filter(Boolean).join(', ') : ''
    }
    function splitSlugs(value) {
      return String(value || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
    }
    function blankStage(index) {
      return {
        id: 'stage-' + String(index + 1),
        label: '',
        labelZh: '新阶段',
        hintZh: '',
        prompt: '写明这一步要完成什么、交出什么成果。',
        skillSlugs: '',
        reviewSkillSlugs: '',
        reviewPolicy: 'risk-based',
        approvalEnabled: false,
        approvalPrompt: '',
        approveLabel: '确认并继续',
        rejectLabel: '',
        listsSources: false,
        binding: '',
        summaryFile: '',
        summaryOutline: '',
      }
    }
    function workflowToDraft(row) {
      const workflow = (row && row.workflow) || {}
      const binding = workflow.bindingAreaByStage || {}
      const stages = Array.isArray(workflow.stages) ? workflow.stages : []
      return {
        id: row.id,
        label: workflow.label || row.label || '',
        labelZh: workflow.labelZh || row.labelZh || moduleLabel(row),
        icon: row.icon || '',
        controlProfile: workflow.controlProfile || '',
        setupStageId: workflow.setupStageId || (stages[0] && stages[0].id) || '',
        kbPack: {
          analysis: ((workflow.kbPack && workflow.kbPack.analysis) || []).slice(),
          pricing: ((workflow.kbPack && workflow.kbPack.pricing) || []).slice(),
          planning: ((workflow.kbPack && workflow.kbPack.planning) || []).slice(),
        },
        useOwnKbPack: Boolean(workflow.kbPack),
        stages: stages.map((stage, index) => ({
          id: stage.id || ('stage-' + (index + 1)),
          label: stage.label || '',
          labelZh: stage.labelZh || stage.label || '',
          hintZh: stage.hintZh || '',
          prompt: stage.prompt || '',
          skillSlugs: joinSlugs(stage.skillSlugs),
          consumes: Array.isArray(stage.consumes) ? stage.consumes.map((item) => ({ ...item })) : undefined,
          reviewSkillSlugs: joinSlugs(stage.reviewSkillSlugs),
          reviewPolicy: stage.reviewPolicy || 'risk-based',
          approvalEnabled: !!stage.approvalGate,
          approvalPrompt: (stage.approvalGate && stage.approvalGate.promptZh) || '',
          approveLabel: (stage.approvalGate && stage.approvalGate.approveLabelZh) || '确认并继续',
          rejectLabel: (stage.approvalGate && stage.approvalGate.rejectLabelZh) || '',
          listsSources: !!stage.listsSources,
          binding: binding[stage.id] || '',
          summaryFile: (stage.summaryDeliverable && stage.summaryDeliverable.fileName) || '',
          summaryOutline: ((stage.summaryDeliverable && stage.summaryDeliverable.outlineZh) || []).join('\n'),
        })),
      }
    }
    function draftToDefinition(draft) {
      const bindingAreaByStage = {}
      const stages = (draft.stages || []).map((stage) => {
        const id = String(stage.id || '').trim()
        if (stage.binding === 'analysis' || stage.binding === 'pricing' || stage.binding === 'planning') {
          bindingAreaByStage[id] = stage.binding
        }
        const outline = String(stage.summaryOutline || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        const fileName = String(stage.summaryFile || '').trim()
        return {
          id,
          label: String(stage.label || '').trim() || undefined,
          labelZh: String(stage.labelZh || '').trim(),
          hintZh: String(stage.hintZh || '').trim() || undefined,
          prompt: String(stage.prompt || '').trim(),
          skillSlugs: splitSlugs(stage.skillSlugs),
          consumes: Array.isArray(stage.consumes) ? stage.consumes.map((item) => ({ ...item })) : undefined,
          reviewSkillSlugs: splitSlugs(stage.reviewSkillSlugs),
          reviewPolicy: stage.reviewPolicy === 'all' ? 'all' : 'risk-based',
          approvalGate: stage.approvalEnabled
            ? {
                promptZh: String(stage.approvalPrompt || '').trim(),
                approveLabelZh: String(stage.approveLabel || '').trim(),
                rejectLabelZh: String(stage.rejectLabel || '').trim() || undefined,
              }
            : undefined,
          listsSources: stage.listsSources ? true : undefined,
          summaryDeliverable: fileName
            ? { fileName, outlineZh: outline.length ? outline : ['待补大纲'] }
            : undefined,
        }
      })
      return {
        schemaVersion: 1,
        id: draft.id,
        label: String(draft.label || '').trim() || undefined,
        labelZh: String(draft.labelZh || '').trim(),
        icon: String(draft.icon || '').trim() || undefined,
        controlProfile: draft.controlProfile === 'tender' ? 'tender' : undefined,
        setupStageId: draft.setupStageId || (stages[0] && stages[0].id),
        bindingAreaByStage: Object.keys(bindingAreaByStage).length ? bindingAreaByStage : undefined,
        kbPack: (function pack() {
          const next = {
            analysis: (draft.kbPack && draft.kbPack.analysis) || [],
            pricing: (draft.kbPack && draft.kbPack.pricing) || [],
            planning: (draft.kbPack && draft.kbPack.planning) || [],
          }
          const any = next.analysis.length + next.pricing.length + next.planning.length
          if (draft.useOwnKbPack || any > 0) return next
          return undefined
        }()),
        stages,
      }
    }

    function ModuleManagerPanel(props) {
      useApLang()
      const cwd = props.cwd || ''
      const [rows, setRows] = React.useState([])
      const [errors, setErrors] = React.useState([])
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [importText, setImportText] = React.useState('')
      const [viewingId, setViewingId] = React.useState('')
      const [copying, setCopying] = React.useState(null)
      const [copyId, setCopyId] = React.useState('')
      const [copyLabel, setCopyLabel] = React.useState('')
      const [copyThenEdit, setCopyThenEdit] = React.useState(false)
      const [editing, setEditing] = React.useState(null)
      const [kbEntries, setKbEntries] = React.useState([])
      const createCopy = moduleCreateCopy()

      const load = React.useCallback(() => {
        return api('/api/agent-pi/modules', cwd, { method: 'GET' })
          .then((body) => { setRows(body.modules || []); setErrors(body.errors || []); setError('') })
          .catch((e) => setError(String(e.message || e)))
      }, [cwd])
      React.useEffect(() => { load() }, [load])
      React.useEffect(() => {
        if (!editing) return
        api('/api/agent-pi/kb', cwd, { method: 'GET' })
          .then((body) => setKbEntries((body && body.entries) || []))
          .catch(() => setKbEntries([]))
      }, [editing ? editing.id : '', cwd])

      const act = (busyKey, body, done) => {
        setBusy(busyKey)
        setError('')
        setNotice('')
        return api('/api/agent-pi/modules', cwd, { method: 'POST', body: JSON.stringify(body) })
          .then((result) => {
            if (done) done(result)
            return load()
          })
          .then(() => { if (props.onChanged) props.onChanged() })
          .catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const toggle = (row) => act('sw:' + row.id, { action: 'set_enabled', id: row.id, disabled: !row.disabled },
        () => setNotice(tAp(row.disabled ? 'mm.enabled' : 'mm.disabled', { name: moduleLabel(row) })))
      const remove = (row) => {
        if (!window.confirm(tAp('mm.deleteConfirm', { name: moduleLabel(row) }))) return
        act('rm:' + row.id, { action: 'remove', id: row.id }, () => setNotice(tAp('mm.deleted', { id: row.id })))
      }
      const importSave = () => {
        let parsed
        try {
          parsed = JSON.parse(importText)
        } catch (e) {
          setError(tAp('mm.jsonFail', { err: String(e.message || e) }))
          return
        }
        act('import', { action: 'save', definition: parsed }, (saved) => {
          setNotice(tAp('mm.installed', { id: saved && saved.id ? saved.id : '' }))
          setImportText('')
          if (saved && saved.id && props.onOpened) props.onOpened(saved.id)
        })
      }
      const suggestCopyId = (sourceId) => {
        const taken = new Set(rows.map((item) => item.id))
        const root = String(sourceId || '').slice(0, 24)
        const first = root + '-copy'
        if (!taken.has(first)) return first
        for (let n = 2; n < 40; n++) {
          const id = root + '-copy-' + n
          if (!taken.has(id)) return id
        }
        return first
      }
      const beginCopy = (row, thenEdit) => {
        setCopyThenEdit(!!thenEdit)
        setCopying(row)
        setCopyId(suggestCopyId(row.id))
        setCopyLabel(moduleLabel(row) + tAp('mm.copySuffix'))
        setEditing(null)
      }
      const submitCopy = () => {
        if (!copying) return
        const openEditor = copyThenEdit
        act('copy', { action: 'copy', id: copying.id, newId: copyId.trim(), labelZh: copyLabel.trim() }, (saved) => {
          setNotice(tAp('mm.copied', { id: saved && saved.id ? saved.id : '' }))
          setCopying(null)
          setCopyThenEdit(false)
          if (openEditor && saved) {
            setEditing(workflowToDraft(saved))
            setViewingId('')
          } else if (saved && saved.id && props.onOpened) {
            props.onOpened(saved.id)
          } else {
            setViewingId(saved && saved.id ? saved.id : '')
          }
        })
      }
      const patchDraft = (patch) => setEditing((current) => current ? Object.assign({}, current, patch) : current)
      const patchStage = (index, patch) => setEditing((current) => {
        if (!current) return current
        const stages = current.stages.slice()
        stages[index] = Object.assign({}, stages[index], patch)
        const next = Object.assign({}, current, { stages })
        if (patch.id && current.setupStageId === current.stages[index].id) next.setupStageId = patch.id
        return next
      })
      const moveStage = (index, delta) => setEditing((current) => {
        if (!current) return current
        const dest = index + delta
        if (dest < 0 || dest >= current.stages.length) return current
        const stages = current.stages.slice()
        const [item] = stages.splice(index, 1)
        stages.splice(dest, 0, item)
        return Object.assign({}, current, { stages })
      })
      const addStage = () => setEditing((current) => {
        if (!current || current.stages.length >= 12) return current
        return Object.assign({}, current, { stages: current.stages.concat([blankStage(current.stages.length)]) })
      })
      const removeStage = (index) => setEditing((current) => {
        if (!current || current.stages.length <= 1) return current
        const stages = current.stages.filter((_, i) => i !== index)
        const removed = current.stages[index]
        const setupStageId = current.setupStageId === removed.id ? (stages[0] && stages[0].id) : current.setupStageId
        return Object.assign({}, current, { stages, setupStageId })
      })
      const beginEdit = (row) => {
        if (row.builtin) {
          setNotice(tAp('mm.builtinLocked'))
          beginCopy(row, true)
          return
        }
        setEditing(workflowToDraft(row))
        setCopying(null)
        setViewingId('')
      }
      const toggleKb = (area, slug, on) => setEditing((current) => {
        if (!current) return current
        const pack = Object.assign({ analysis: [], pricing: [], planning: [] }, current.kbPack)
        const list = (pack[area] || []).filter((item) => item !== slug)
        if (on) list.push(slug)
        pack[area] = list
        return Object.assign({}, current, { kbPack: pack, useOwnKbPack: true })
      })
      const saveEdit = () => {
        if (!editing) return
        if (!window.confirm(tAp('mm.saveConfirm'))) return
        act('edit', { action: 'save', definition: draftToDefinition(editing) }, (saved) => {
          setNotice(tAp('mm.saved', { id: saved && saved.id ? saved.id : '' }))
          setEditing(null)
          if (saved && saved.id && props.onOpened) props.onOpened(saved.id)
          else setViewingId(saved && saved.id ? saved.id : '')
        })
      }
      const stageMarks = (stage) => {
        const marks = []
        if (stage.listsSources) marks.push(tAp('mm.markLists'))
        if (stage.summaryDeliverable && stage.summaryDeliverable.fileName) marks.push(tAp('mm.markSummary', { name: stage.summaryDeliverable.fileName }))
        if (stage.skillSlugs && stage.skillSlugs.length) marks.push(tAp('mm.markSkills', { list: apJoin(stage.skillSlugs) }))
        if (stage.reviewSkillSlugs && stage.reviewSkillSlugs.length) marks.push(tAp('mm.markReview', { list: apJoin(stage.reviewSkillSlugs) }))
        return marks.join(' · ')
      }

      return h('div', { className: 'ap-ov', style: { display: 'block', overflow: 'auto' } },
        h('div', { className: 'ap-ov-main', style: { maxWidth: 1080, margin: '0 auto' } },
          h('header', { className: 'ap-ov-hd' },
            h('div', { style: { minWidth: 0 } },
              h('h1', null, tAp('mm.title')),
              h('div', { className: 'ap-sub' }, tAp('mm.lead')),
              h('div', { className: 'ap-sub', style: { marginTop: 4 } }, tAp('mm.lead2')),
            ),
            h('div', { className: 'ap-actions' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => load() }, Icon('refresh', 14), tAp('kb.refresh')),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                title: tAp('mm.designTitle'),
                onClick: () => props.onDesign && props.onDesign('custom-steps'),
              }, Icon('sparkles', 14), tAp('mm.design')),
            ),
          ),
          error ? h('div', { className: 'ap-err' }, error) : null,
          notice ? h('div', { className: 'ap-sub', style: { padding: '6px 0' } }, notice) : null,
          h('section', { className: 'ap-sec' },
            h('h2', null, createCopy.title),
            h('div', { className: 'ap-create-lead' },
              h('strong', null, tAp('mm.packNotJson')),
              h('p', { className: 'ap-sub', style: { margin: 0 } }, createCopy.lead),
              h('p', { className: 'ap-sub', style: { margin: '6px 0 0' } }, createCopy.warn),
            ),
            h('p', { className: 'ap-sub', style: { marginTop: 10 } }, tAp('mm.pickKind')),
            h('div', { className: 'ap-create-picks' },
              createCopy.cards.map((card) => h('button', {
                key: card.id,
                type: 'button',
                className: 'ap-create-pick',
                onClick: () => props.onDesign && props.onDesign(card.id),
              },
                h('strong', null, card.title),
                h('span', null, card.body),
              )),
            ),
            h('details', { style: { marginTop: 14 } },
              h('summary', { className: 'ap-sub', style: { cursor: 'pointer' } }, tAp('mm.advanced')),
              h('p', { className: 'ap-sub', style: { marginTop: 8 } }, createCopy.advanced),
              h('textarea', {
                value: importText,
                spellCheck: false,
                onChange: (e) => setImportText(e.target.value),
                style: { width: '100%', minHeight: 140, marginTop: 8, padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit', font: 'var(--dsw-font-markdown-code-block-small)' },
              }),
              h('div', { className: 'ap-row', style: { justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
                h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'import' || !importText.trim(), onClick: importSave }, busy === 'import' ? tAp('mm.installing') : tAp('mm.install')),
              ),
            ),
          ),
          copying ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.copyTitle')),
            h('p', { className: 'ap-sub' }, tAp('mm.copyLead', { name: moduleLabel(copying) })),
            h('label', { className: 'ap-sub', style: { display: 'block', marginTop: 10 } }, tAp('mm.labelZh')),
            h('input', {
              value: copyLabel,
              onChange: (e) => setCopyLabel(e.target.value),
              style: { width: '100%', marginTop: 4, padding: '8px 10px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit' },
            }),
            h('label', { className: 'ap-sub', style: { display: 'block', marginTop: 10 } }, tAp('mm.moduleId')),
            h('input', {
              value: copyId,
              onChange: (e) => setCopyId(e.target.value),
              style: { width: '100%', marginTop: 4, padding: '8px 10px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit' },
            }),
            h('div', { className: 'ap-row', style: { justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => setCopying(null) }, tAp('mm.cancel')),
              h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'copy' || !copyId.trim() || !copyLabel.trim(), onClick: submitCopy }, busy === 'copy' ? tAp('mm.copying') : (copyThenEdit ? tAp('mm.copyOpen') : tAp('mm.copyLive'))),
            ),
          ) : null,
          editing ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.editTitle', { name: editing.labelZh || editing.id })),
            h('p', { className: 'ap-sub' }, tAp('mm.editLead')),
            h('label', { className: 'ap-mm-field' }, tAp('mm.labelZh'),
              h('input', { value: editing.labelZh, onChange: (e) => patchDraft({ labelZh: e.target.value }) }),
            ),
            h('label', { className: 'ap-mm-field' }, tAp('mm.labelEn'),
              h('input', { value: editing.label, onChange: (e) => patchDraft({ label: e.target.value }) }),
            ),
            h('label', { className: 'ap-mm-field' }, tAp('mm.setupStage'),
              h('select', { value: editing.setupStageId, onChange: (e) => patchDraft({ setupStageId: e.target.value }) },
                editing.stages.map((stage) => h('option', { key: stage.id, value: stage.id }, (stage.labelZh || stage.id) + ' · ' + stage.id)),
              ),
            ),
            h('div', { className: 'ap-mm-ed-stage' },
              h('strong', null, tAp('mm.kbPack')),
              h('p', { className: 'ap-sub' }, tAp('mm.kbPackLead')),
              h('div', { className: 'ap-mm-checks' },
                h('label', null,
                  h('input', {
                    type: 'checkbox',
                    checked: !!editing.useOwnKbPack,
                    onChange: (e) => patchDraft({ useOwnKbPack: e.target.checked }),
                  }),
                  ' ' + tAp('mm.kbOwnOnly'),
                ),
              ),
              kbEntries.length === 0
                ? h('p', { className: 'ap-sub' }, tAp('mm.kbEmpty'))
                : ['analysis', 'pricing', 'planning'].map((area) => {
                  const selected = (editing.kbPack && editing.kbPack[area]) || []
                  return h('div', { key: area, style: { marginTop: 10 } },
                    h('div', { className: 'ap-sub' }, tAp('mm.area.' + area)),
                    kbEntries.map((entry) => h('label', {
                      key: area + ':' + entry.slug,
                      className: 'ap-mm-checks',
                      style: { marginTop: 4 },
                    },
                      h('input', {
                        type: 'checkbox',
                        checked: selected.indexOf(entry.slug) >= 0,
                        onChange: (e) => toggleKb(area, entry.slug, e.target.checked),
                      }),
                      ' ' + (typeof kbTitle === 'function' ? kbTitle(entry) : entry.name) + (entry.category ? ' · ' + kbCategoryLabel(entry.category) : ''),
                    )),
                  )
                }),
            ),
            editing.stages.map((stage, index) => h('div', { key: stage.id + ':' + index, className: 'ap-mm-ed-stage' },
              h('div', { className: 'ap-row', style: { gap: 8, justifyContent: 'space-between' } },
                h('strong', null, tAp('mm.stageN', { n: index + 1 })),
                h('span', { className: 'ap-row', style: { gap: 6 } },
                  h('button', { type: 'button', className: 'ap-btn link', disabled: index === 0, onClick: () => moveStage(index, -1) }, tAp('mm.moveUp')),
                  h('button', { type: 'button', className: 'ap-btn link', disabled: index === editing.stages.length - 1, onClick: () => moveStage(index, 1) }, tAp('mm.moveDown')),
                  h('button', { type: 'button', className: 'ap-btn link', disabled: editing.stages.length <= 1, onClick: () => removeStage(index) }, tAp('mm.deleteStage')),
                ),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageId'),
                h('input', { value: stage.id, onChange: (e) => patchStage(index, { id: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageZh'),
                h('input', { value: stage.labelZh, onChange: (e) => patchStage(index, { labelZh: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageHint'),
                h('input', { value: stage.hintZh, onChange: (e) => patchStage(index, { hintZh: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field tall' }, tAp('mm.stagePrompt'),
                h('textarea', { value: stage.prompt, spellCheck: false, onChange: (e) => patchStage(index, { prompt: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.skillSlugs'),
                h('input', { value: stage.skillSlugs, onChange: (e) => patchStage(index, { skillSlugs: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.reviewSlugs'),
                h('input', { value: stage.reviewSkillSlugs, onChange: (e) => patchStage(index, { reviewSkillSlugs: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.reviewPolicy'),
                h('select', { value: stage.reviewPolicy, onChange: (e) => patchStage(index, { reviewPolicy: e.target.value }) },
                  h('option', { value: 'risk-based' }, tAp('mm.reviewRisk')),
                  h('option', { value: 'all' }, tAp('mm.reviewAll')),
                ),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.binding'),
                h('select', { value: stage.binding, onChange: (e) => patchStage(index, { binding: e.target.value }) },
                  h('option', { value: '' }, tAp('mm.bindNone')),
                  h('option', { value: 'analysis' }, tAp('mm.bindAnalysis')),
                  h('option', { value: 'pricing' }, tAp('mm.bindPricing')),
                  h('option', { value: 'planning' }, tAp('mm.bindPlanning')),
                ),
              ),
              h('div', { className: 'ap-mm-checks' },
                h('label', null,
                  h('input', { type: 'checkbox', checked: !!stage.listsSources, onChange: (e) => patchStage(index, { listsSources: e.target.checked }) }),
                  ' ' + tAp('mm.listsSources'),
                ),
                h('label', null,
                  h('input', { type: 'checkbox', checked: !!stage.approvalEnabled, onChange: (e) => patchStage(index, { approvalEnabled: e.target.checked }) }),
                  ' ' + tAp('mm.approvalGate'),
                ),
              ),
              stage.approvalEnabled
                ? h(React.Fragment, null,
                  h('label', { className: 'ap-mm-field' }, tAp('mm.approvalPrompt'),
                    h('input', { value: stage.approvalPrompt, onChange: (e) => patchStage(index, { approvalPrompt: e.target.value }) }),
                  ),
                  h('label', { className: 'ap-mm-field' }, tAp('mm.approveLabel'),
                    h('input', { value: stage.approveLabel, onChange: (e) => patchStage(index, { approveLabel: e.target.value }) }),
                  ),
                  h('label', { className: 'ap-mm-field' }, tAp('mm.rejectLabel'),
                    h('input', { value: stage.rejectLabel, onChange: (e) => patchStage(index, { rejectLabel: e.target.value }) }),
                  ),
                )
                : null,
              h('label', { className: 'ap-mm-field' }, tAp('mm.summaryFile'),
                h('input', { value: stage.summaryFile, onChange: (e) => patchStage(index, { summaryFile: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.summaryOutline'),
                h('textarea', { value: stage.summaryOutline, spellCheck: false, onChange: (e) => patchStage(index, { summaryOutline: e.target.value }) }),
              ),
            )),
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between', gap: 8, marginTop: 8 } },
              h('button', { type: 'button', className: 'ap-btn', disabled: editing.stages.length >= 12, onClick: addStage }, tAp('mm.addStage')),
              h('span', { className: 'ap-row', style: { gap: 8 } },
                h('button', { type: 'button', className: 'ap-btn', onClick: () => setEditing(null) }, tAp('mm.cancel')),
                h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'edit' || !editing.labelZh.trim() || !editing.stages.length, onClick: saveEdit }, busy === 'edit' ? tAp('mm.saving') : tAp('mm.saveLive')),
              ),
            ),
          ) : null,
          h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.list', { n: rows.length })),
            rows.map((row) => {
              const stages = row.workflow && Array.isArray(row.workflow.stages) ? row.workflow.stages : []
              const open = viewingId === row.id
              return h('div', { key: row.id, className: 'ap-mm-card' + (row.disabled ? ' off' : '') },
                h('div', { className: 'ap-mm-row' },
                  moduleIconNode(row, 18),
                  h('div', { className: 'grow' },
                    h('div', { className: 'ap-row', style: { gap: 8 } },
                      h('strong', null, moduleLabel(row)),
                      h('span', { className: 'ap-chip' }, row.id),
                      row.builtin ? h('span', { className: 'ap-chip' }, tAp('mm.builtin')) : h('span', { className: 'ap-chip' }, tAp('mm.custom')),
                    ),
                    h('div', { className: 'ap-sub' },
                      tAp('mm.stageCount', { n: row.stageCount }) + (row.sourcePath ? ' · ' + row.sourcePath : '')),
                  ),
                  h('span', { className: 'ap-row', style: { gap: 6, flexShrink: 0 } },
                    h('button', {
                      type: 'button',
                      className: 'ap-btn link',
                      disabled: !!busy,
                      onClick: () => setViewingId(open ? '' : row.id),
                    }, open ? tAp('mm.collapse') : tAp('mm.expand')),
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => beginEdit(row) }, row.builtin ? tAp('mm.copyThenEdit') : tAp('mm.editStages')),
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => beginCopy(row, false) }, tAp('mm.copyAsCustom')),
                    row.sourcePath
                      ? h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, title: tAp('mm.defFileTitle'), onClick: () => openInExplorer(cwd, row.sourcePath, { reveal: true }).catch(() => {}) }, tAp('mm.defFile'))
                      : null,
                    !row.builtin
                      ? h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => remove(row) }, tAp('mm.delete'))
                      : null,
                    h('button', {
                      type: 'button',
                      className: 'ap-switch' + (row.disabled ? '' : ' on'),
                      role: 'switch',
                      'aria-checked': !row.disabled,
                      title: row.disabled ? tAp('mm.enable') : tAp('mm.disable'),
                      disabled: !!busy,
                      onClick: () => toggle(row),
                    }, h('span', { className: 'ap-switch-knob' })),
                  ),
                ),
                open ? h('div', { className: 'ap-mm-stages' },
                  stages.length === 0
                    ? h('div', { className: 'ap-sub' }, tAp('mm.noStages'))
                    : stages.map((stage, index) => h('div', { key: stage.id || index, className: 'ap-mm-stage' },
                      h('span', { className: 'ap-chip' }, String(index + 1)),
                      h('div', { className: 'grow' },
                        h('strong', null, stage.labelZh || stage.label || stage.id),
                        h('div', { className: 'ap-sub' }, stage.hintZh || ''),
                        stageMarks(stage) ? h('div', { className: 'ap-sub' }, stageMarks(stage)) : null,
                      ),
                    )),
                ) : null,
              )
            }),
          ),
          errors.length ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.loadFailed')),
            errors.map((item, index) => h('div', { key: index, className: 'ap-err', style: { marginTop: 6 } },
              item.file + ' — ' + item.error)),
          ) : null,
        ),
      )
    }

    const WorkbenchView = createWorkbenchView({
      h,
      Icon,
      tAp,
      moduleIconNode,
      moduleLabel,
      FilePickPanel,
    })

    function Workbench(props) {
      useApLang()
      const LIVE_POLL_MS = 45000
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [module, setModule] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') || 'tender' } catch { return 'tender' }
      })
      const [draft, setDraft] = React.useState('')
      const [refreshing, setRefreshing] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [selectedId, setSelectedId] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-project') || '' } catch { return '' }
      })
      const [monitorState, setMonitorState] = React.useState(() => Object.assign({}, monitorEngine.state))
      const [, setSessionPulse] = React.useState(0)
      const [notice, setNotice] = React.useState('')
      const [lastCheck, setLastCheck] = React.useState(null)
      const [picking, setPicking] = React.useState(false)
      const [pickSelected, setPickSelected] = React.useState([])
      const cwd = readWorkspaceCwd(props)
      const catalog = moduleList(data)
      const current = catalog.find((item) => item.id === module) || MODULES[module] || { id: module, labelZh: module, icon: 'clipboardCheck' }

      const selectModule = (id) => {
        setModule(id)
        if (id !== 'kb' && id !== 'modules' && id !== 'archive') setSelectedId('')
        try {
          sessionStorage.setItem('ap-wb-module', id)
          sessionStorage.removeItem('ap-wb-await-module')
        } catch {}
        window.dispatchEvent(new Event('agent-pi-wb-module-sync'))
      }

      React.useEffect(() => {
        const onModule = (event) => {
          const id = event && event.detail
          if (!id || typeof id !== 'string') return
          selectModule(id)
          setWorkbenchOpen(true)
        }
        window.addEventListener('agent-pi-wb-module', onModule)
        return () => window.removeEventListener('agent-pi-wb-module', onModule)
      }, [])

      React.useEffect(() => {
        if (!data || !data.modules) return
        let waiting = false
        let known = []
        try {
          waiting = sessionStorage.getItem('ap-wb-await-module') === '1'
          known = JSON.parse(sessionStorage.getItem('ap-wb-known-modules') || '[]')
        } catch { return }
        if (!waiting || !known.length) return
        const added = data.modules.filter((item) => item && item.id && !item.builtin && known.indexOf(item.id) < 0)
        if (!added.length) return
        try { sessionStorage.removeItem('ap-wb-await-module') } catch {}
        selectModule(added[added.length - 1].id)
      }, [data])

      const refresh = React.useCallback((silent) => {
        if (!cwd) {
          setError('先选择一个工作区')
          return Promise.resolve()
        }
        if (!silent) setError('')
        setRefreshing(true)
        return api('/api/agent-pi/workbench', cwd, { method: 'GET' })
          .then((body) => {
            setData(body)
            setLastCheck(Date.now())
          })
          .catch((e) => { if (!silent) setError(String(e.message || e)) })
          .finally(() => setRefreshing(false))
      }, [cwd])

      React.useEffect(() => {
        if (module === 'archive') {
          setError('')
          return
        }
        refresh()
      }, [refresh, module])
      React.useEffect(() => {
        const onCreated = (event) => {
          const id = event && event.detail && event.detail.projectId
          const nextModule = event && event.detail && event.detail.module
          if (nextModule) selectModule(nextModule)
          if (id) {
            setSelectedId(id)
            try { sessionStorage.setItem('ap-wb-project', id) } catch {}
          }
          refresh()
        }
        window.addEventListener('agent-pi-created', onCreated)
        return () => window.removeEventListener('agent-pi-created', onCreated)
      }, [refresh])
      React.useEffect(() => {
        const onRequirement = () => refresh(true)
        window.addEventListener('agent-pi-user-requirement', onRequirement)
        return () => window.removeEventListener('agent-pi-user-requirement', onRequirement)
      }, [refresh])

      const projects = (data && data.projects ? data.projects : []).filter((row) => row.project.module === module)
      React.useEffect(() => {
        if (!projects.length) return
        if (!selectedId || !projects.some((row) => row.project.projectId === selectedId)) {
          setSelectedId(projects[0].project.projectId)
        }
      }, [projects, selectedId])
      // A disabled/removed module falls back to the first visible one.
      React.useEffect(() => {
        if (module === 'kb' || module === 'modules' || module === 'archive') return
        if (!data || !catalog.length) return
        if (!catalog.some((item) => item.id === module)) {
          selectModule(catalog[0].id)
        }
      }, [data, module, catalog.map((item) => item.id).join(',')])

      const row = projects.find((item) => item.project.projectId === selectedId) || null

      // Disk-verified project health check shown under the monitor header; filled
      // by the 检查 button or the live monitor, cleared when switching projects.
      const [reality, setReality] = React.useState(null)
      const [control, setControl] = React.useState(null)
      React.useEffect(() => { setReality(null); setControl(null) }, [selectedId])

      // Keep the dashboard in sync with the module-level engine and poll the board
      // while the workbench is open. Opening the workbench never dispatches anything.
      React.useEffect(() => {
        const onMonitor = () => {
          setMonitorState(Object.assign({}, monitorEngine.state))
          if (monitorEngine.state.lastReality) setReality(monitorEngine.state.lastReality)
          if (monitorEngine.state.lastControl) setControl(monitorEngine.state.lastControl)
          refresh(true)
        }
        window.addEventListener('agent-pi-monitor-changed', onMonitor)
        return () => window.removeEventListener('agent-pi-monitor-changed', onMonitor)
      }, [refresh])
      React.useEffect(() => {
        const list = runtime.sessions && runtime.sessions.list
        if (!list || typeof list.subscribe !== 'function') return undefined
        return list.subscribe(() => setSessionPulse((value) => value + 1))
      }, [])
      React.useEffect(() => {
        if (module === 'archive' || module === 'kb' || module === 'modules') return
        const id = setInterval(() => { refresh(true) }, LIVE_POLL_MS)
        return () => clearInterval(id)
      }, [refresh, module])

      const runCheck = (project) => {
        setBusy('check:')
        setError('')
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action: 'check',
            module: project.module,
            projectId: project.projectId,
            sessionId: pinParentSessionId() || resolveSessionId(props) || runtime.sessionId || '',
          }),
        }).then((result) => {
          setReality(result.reality || null)
          setControl(result.control || null)
          monitorEngine.state.lastReality = result.reality || null
          monitorEngine.state.lastControl = result.control || null
          return refresh(true)
        }).catch((e) => setError(String(e.message || e))).finally(() => setBusy(''))
      }

      const updateRequirement = (project, requirement, action) => {
        if (!project || !requirement || !action) return Promise.resolve()
        if (action === 'accept_requirement'
          && !window.confirm('确认以这条用户要求替代本阶段旧的文件名、篇幅、章节和视图门禁？实际 BOQ、能力包、来源和引用完整性仍不可跳过。')) {
          return Promise.resolve()
        }
        setBusy(action + ':' + requirement.id)
        setError('')
        setNotice('')
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action,
            module: project.module,
            projectId: project.projectId,
            stageId: requirement.stageId,
            requirementId: requirement.id,
            sessionId: requirement.sessionId,
          }),
        }).then(() => {
          setNotice(action === 'accept_requirement'
            ? '已把用户要求设为本阶段验收口径；旧软门禁不再触发重复返工。'
            : action === 'satisfy_requirement'
              ? '已记录要求落实状态。'
              : action === 'reopen_requirement'
                ? '已把要求退回主会话继续修改。'
                : '已从项目要求中移除。')
          return refresh(true)
        }).catch((e) => setError(String(e && e.message || e)))
          .finally(() => setBusy(''))
      }

      const runStage = (project, stageId, action, submit, closeWorkbench) => {
        const parentId = pinParentSessionId()
        setBusy(action + ':' + (stageId || ''))
        setError('')
        setNotice('')
        if (submit && !parentId) {
          setBusy('')
          setError('请先打开或新建一个主会话，再启动专业项目。')
          return Promise.resolve()
        }
        const activeTransaction = submit ? workbenchTransactions.get(parentId) : null
        if (activeTransaction && (activeTransaction.phase === 'prepared' || activeTransaction.phase === 'committed')
          && (activeTransaction.payload.cwd !== cwd
            || activeTransaction.payload.module !== project.module
            || activeTransaction.payload.projectId !== project.projectId)) {
          setBusy('')
          setError('当前主会话已有另一项专业项目事务，请先暂停或结束。')
          return Promise.resolve()
        }
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action: action || 'prepare',
            module: project.module,
            projectId: project.projectId,
            stageId,
            sessionId: parentId || resolveSessionId(props) || runtime.sessionId || 'active',
          }),
        }).then((result) => {
          if (result.blocked) {
            // Blocked drafts are preview-only: never write them into the conversation
            // and never leave them armed in the composer.
            setError(result.blocked)
            if (result.draft) setDraft(result.draft)
            return refresh()
          }
          if (result.done) {
            setNotice(result.message || '流程已全部完成。')
            return refresh()
          }
          if (result.alreadyDispatched) {
            if (submit) {
              monitorEngine.start({ cwd, module: project.module, projectId: project.projectId })
              if (closeWorkbench !== false) focusMainConversation(props)
            }
            setNotice(result.message || '阶段稿已写入主对话，等待执行。')
            return refresh()
          }
          if (result.closed && result.message) setNotice(result.message)
          if (!result.draft) {
            if (result.message) setNotice(result.message)
            return refresh()
          }
          setDraft(result.draft)
          if (!submit) {
            const activeId = resolveSessionId(props) || runtime.sessionId || ''
            if (!result.closed && parentId && activeId && parentId !== activeId) {
              return dispatchToConversation({}, result.draft, parentId).then((ok) => {
                if (ok) setNotice('已把待处理稿直接送回主对话。')
                return refresh()
              })
            }
            if (!result.closed) fillComposer(props, result.draft)
            return refresh()
          }
          const transaction = prepareWorkbenchTransaction(parentId, {
            cwd,
            module: project.module,
            projectId: project.projectId,
          })
          const ownsPreparedTransaction = transaction.phase === 'prepared'
          return dispatchToConversation(props, result.draft, parentId).then((ok) => {
            if (ok && result.dispatch) {
              api('/api/agent-pi/stage', cwd, {
                method: 'POST',
                body: JSON.stringify({
                  action: 'mark_dispatched',
                  module: project.module,
                  projectId: project.projectId,
                  stageId: result.dispatch.stageId,
                  key: result.dispatch.key,
                }),
              }).catch(() => {})
            }
            if (ok) {
              monitorEngine.start({ cwd, module: project.module, projectId: project.projectId })
              if (closeWorkbench !== false) focusMainConversation(props)
            }
            return refresh()
          }).catch((e) => {
            if (ownsPreparedTransaction) settleWorkbenchTransaction(parentId, 'failed', e)
            const release = result.dispatch
              ? api('/api/agent-pi/stage', cwd, {
                method: 'POST',
                body: JSON.stringify({
                  action: 'release_dispatch',
                  module: project.module,
                  projectId: project.projectId,
                  stageId: result.dispatch.stageId,
                  key: result.dispatch.key,
                }),
              }).catch(() => {})
              : Promise.resolve()
            return release.then(() => {
              setError(String(e.message || e))
              return refresh()
            })
          })
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const decideStage = (project, stage, decision) => {
        if (!project || !stage || !stage.approvalGate) return Promise.resolve()
        if (decision === 'rejected' && !window.confirm('确认暂停本项目，不进入下一阶段？已生成成果和项目状态都会保留。')) {
          return Promise.resolve()
        }
        const action = decision === 'approved' ? 'approve_gate' : 'reject_gate'
        setBusy(action + ':' + stage.id)
        setError('')
        setNotice('')
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action,
            module: project.module,
            projectId: project.projectId,
            stageId: stage.id,
          }),
        }).then(() => {
          if (decision === 'rejected') {
            monitorEngine.stop('用户已决定暂停本项目。', 'failed')
            setNotice('已记录「不继续」决定，流程保持暂停。')
            return refresh(true)
          }
          setNotice('人工决策已记录，正在准备下一阶段。')
          return runStage(project, '', 'resume', true)
        }).catch((e) => setError(String(e && e.message || e)))
          .finally(() => setBusy(''))
      }

      const openCreate = () => {
        window.dispatchEvent(new CustomEvent('agent-pi-open-create', { detail: { cwd, module } }))
      }

      const openAdopt = () => {
        window.dispatchEvent(new CustomEvent('agent-pi-open-create', { detail: { cwd, module, mode: 'adopt' } }))
      }

      const selectProject = (id) => {
        setSelectedId(id)
        try { sessionStorage.setItem('ap-wb-project', id) } catch {}
      }

      const startLiveMonitor = () => {
        if (!row || !row.project) return
        try {
          monitorEngine.start({ cwd, module: row.project.module, projectId: row.project.projectId })
        } catch (error) {
          setError(String(error && error.message || error))
        }
      }

      const monitoringHere = monitorState.monitoring
        && row && row.project
        && monitorState.projectId === row.project.projectId
        && monitorState.cwd === cwd
      const liveActivity = sessionActivity(readSessionListSnap(), monitorState.parentSessionId)
      const liveActivityText = liveActivity.runningChildCount > 0
        ? (liveActivity.runningChildCount + ' 个子智能体执行中')
        : liveActivity.parentRunning ? '主对话执行中' : ''

      const addFiles = () => {
        if (!row) return
        setPickSelected(row.project.inputPaths || [])
        setPicking(true)
      }

      const restoreSources = (project, extra) => {
        setBusy('restore')
        setError('')
        setNotice(extra && extra.preferMineru ? '正在用 MinerU 对齐原稿…' : '正在按知识库逻辑对齐原稿…')
        return api('/api/agent-pi/projects/restore', cwd, {
          method: 'POST',
          body: JSON.stringify({
            module: project.module,
            projectId: project.projectId,
            force: !!(extra && extra.force),
            preferMineru: !!(extra && extra.preferMineru),
          }),
        }).then((batch) => {
          const ok = (batch.restored || []).length
          const skipped = (batch.skipped || []).filter((item) => item.reason !== 'unsupported')
          setNotice(ok
            ? ('已对齐 ' + ok + ' 份原稿' + (skipped.length ? '；' + skipped.length + ' 份未对齐' : '') + '。点文件名可预览改稿，保存会同步 JSON。')
            : (skipped.length ? ('原稿对齐未完成：' + skipped.map((item) => item.reason).join('；')) : '没有需要对齐的原稿。'))
          return refresh()
        })
      }

      const saveFiles = () => {
        if (!row) return
        setBusy('files')
        api('/api/agent-pi/projects', cwd, {
          method: 'PATCH',
          body: JSON.stringify({ module: row.project.module, projectId: row.project.projectId, inputPaths: pickSelected }),
        }).then(() => {
          setPicking(false)
          return restoreSources(row.project)
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const removeProject = () => {
        if (!row) return
        if (!window.confirm('从工作台移除项目「' + row.project.name + '」？磁盘上的项目文件会保留。')) return
        setBusy('remove')
        api('/api/agent-pi/projects', cwd, {
          method: 'DELETE',
          body: JSON.stringify({ module: row.project.module, projectId: row.project.projectId }),
        }).then(() => {
          setSelectedId('')
          refresh()
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const togglePick = (path, _name, forceAdd) => {
        setPickSelected((current) => {
          const has = current.indexOf(path) >= 0
          if (forceAdd && has) return current
          if (has) return current.filter((item) => item !== path)
          return current.concat([path])
        })
      }

      const renderOverview = (item) => {
        const project = item.project
        const wf = item.workflow
        const stages = wf.stages || []
        const setupId = wf.setupStageId || ''
        const evidence = item.evidence
        const requirements = (item.userRequirements || []).filter((requirement) => requirement.status !== 'dismissed')
        const activeControl = control && control.execution && control.execution.projectId === project.projectId ? control : null
        const execution = (activeControl && activeControl.execution) || item.execution || null
        const currentReality = reality && reality.stages
          ? reality.stages.find((stage) => stage.stageId === item.currentStageId) || null
          : null
        const currentSlice = item.currentStageId ? stageSlice(item, item.currentStageId) : null
        const executionStatusLabel = execution
          ? ({ planning: '规划中', working: '执行中', waiting: '等待回推', blocked: '已阻塞', completed: '已完成', failed: '失败' }[execution.status] || execution.status)
          : '未回写'
        const alignmentLabel = activeControl
          ? ({ aligned: '已对齐', missing: '缺执行账本', drifted: '存在差异', stale: '心跳过期', 'waiting-human': '等待人工' }[activeControl.alignment] || activeControl.alignment)
          : '待核验'
        const forceTarget = stages.find((stage) => {
          if (setupId && stage.id === setupId) return false
          const slice = stageSlice(item, stage.id)
          return slice && (slice.status === 'blocked' || (evidence && evidence.blocking))
        })
        const setup = setupId ? stageSlice(item, setupId) : null
        return h('div', { className: 'ap-ov-main' },
          h('header', { className: 'ap-ov-hd' },
            h('div', { style: { minWidth: 0 } },
              h('h1', null, project.name),
              h('div', { className: 'ap-path' }, Icon('folder', 14), h('span', { title: project.rootPath }, project.rootPath || cwd)),
            ),
            h('div', { className: 'ap-actions' },
              h('button', { type: 'button', className: 'ap-btn', onClick: addFiles }, Icon('filePlus', 14), '添加资料'),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                title: '同一条推进口：未齐套先确认资料，否则恢复未完阶段。已写入的阶段稿不会再灌一遍。',
                onClick: () => {
                  const next = stages.find((stage) => {
                    const slice = stageSlice(item, stage.id)
                    return !slice || slice.status !== 'done'
                  })
                  if (!next) {
                    setNotice('所有阶段均已完成；如需重跑，请对相应阶段「重置编排」。')
                    return
                  }
                  if (setupId && next.id === setupId) {
                    restoreSources(project).then(() => runStage(project, setupId, 'complete', true)).catch((e) => setError(String(e.message || e)))
                    return
                  }
                  runStage(project, '', 'resume', true)
                },
              }, Icon('play', 14), '继续推进'),
              h('button', { type: 'button', className: 'ap-btn ghost', onClick: removeProject }, Icon('trash', 14), '移除项目'),
            ),
          ),
          requirements.length
            ? h('section', { className: 'ap-sec ap-user-reqs', 'aria-label': '用户要求（最高优先级）' },
              h('div', { className: 'ap-user-req-head' },
                h('div', null,
                  h('h2', null, '用户要求（最高优先级）'),
                  h('p', { className: 'ap-sub' }, '主会话的新要求与工作台共用这份账本；只改受影响成果，不再让旧软门禁触发整阶段返工。'),
                ),
                h('span', { className: 'ap-chip' }, requirements.filter((requirement) => requirement.status === 'active').length + ' 条待落实'),
              ),
              requirements.slice(0, 6).map((requirement) => {
                const statusLabel = requirement.status === 'active' ? '待落实'
                  : requirement.status === 'implemented' ? '已落实'
                    : '已采用为验收口径'
                const statusClass = requirement.status === 'active' ? ' warn' : ' ok'
                return h('article', { className: 'ap-user-req', key: requirement.id },
                  h('div', { className: 'ap-user-req-main' },
                    h('div', { className: 'ap-row' },
                      h('span', { className: 'ap-chip' + statusClass }, statusLabel),
                      h('span', { className: 'ap-sub' }, requirement.stageId),
                    ),
                    h('p', null, requirement.text),
                    requirement.note ? h('p', { className: 'ap-sub' }, '落实说明：' + requirement.note) : null,
                    requirement.evidencePaths && requirement.evidencePaths.length
                      ? h('p', { className: 'ap-sub' }, '影响成果：' + requirement.evidencePaths.join('、'))
                      : null,
                  ),
                  h('div', { className: 'ap-user-req-actions' },
                    requirement.status === 'active'
                      ? h('button', {
                        type: 'button',
                        className: 'ap-btn',
                        disabled: !!busy,
                        onClick: () => updateRequirement(project, requirement, 'satisfy_requirement'),
                      }, '标记已落实')
                      : requirement.status === 'implemented'
                        ? h(React.Fragment, null,
                          h('button', {
                            type: 'button',
                            className: 'ap-btn primary',
                            disabled: !!busy,
                            onClick: () => updateRequirement(project, requirement, 'accept_requirement'),
                          }, '采用为验收口径'),
                          h('button', {
                            type: 'button',
                            className: 'ap-btn',
                            disabled: !!busy,
                            onClick: () => updateRequirement(project, requirement, 'reopen_requirement'),
                          }, '继续修改'),
                        )
                        : null,
                    requirement.status !== 'accepted'
                      ? h('button', {
                        type: 'button',
                        className: 'ap-btn ghost',
                        disabled: !!busy,
                        onClick: () => updateRequirement(project, requirement, 'dismiss_requirement'),
                      }, '不属于本项目')
                      : null,
                  ),
                )
              }),
            )
            : null,
          h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-mon-hd' },
              h('div', { style: { minWidth: 0 } },
                h('h2', null, '流程监控'),
                h('p', { className: 'ap-sub' }, '只有点「继续推进」才启动当前主会话事务；已启动事务会在应用重启后恢复，遇到人工决策门、阻塞或异常会停止。分析阶段只维护一套可追溯底稿。'),
              ),
              h('div', { className: 'ap-mon-tools' },
                h('span', { className: 'ap-row' },
                  h('i', { className: 'ap-dot' + ((monitoringHere && !monitorState.paused) || liveActivityText ? ' on' : '') }),
                  !monitoringHere
                    ? (liveActivityText || (monitorState.monitoring ? '另一项目事务正在运行' : '点继续推进后启动当前会话事务'))
                    : (monitorState.paused ? '当前会话事务已暂停' : '当前会话事务空闲') + (liveActivityText ? ' · ' + liveActivityText : ''),
                ),
                h('span', null, '检查于 ' + (monitorState.lastCheck ? formatClock(new Date(monitorState.lastCheck).toISOString()) : (lastCheck ? formatClock(new Date(lastCheck).toISOString()) : '—'))),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: busy === 'check:',
                  title: '对每个阶段做盘面对账：任务与产物、阶段总控、投标分析底稿、实际工程量清单、测算表、引用孤儿和人工门禁',
                  onClick: () => runCheck(project),
                }, Icon('search', 14), busy === 'check:' ? '体检中…' : '检查'),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !forceTarget && !(evidence && evidence.blocking),
                  title: forceTarget || (evidence && evidence.blocking) ? '解除缺件门槛：缺口保持为缺口，不授权联网尽调。' : '当前没有缺件门槛可放行',
                  onClick: () => {
                    if (!window.confirm('解除缺件门槛：缺口保持为缺口、继续使用已有资料，不授权联网尽调（联网需在对话中授权）。不会删除已完成批次。')) return
                    runStage(project, (forceTarget && forceTarget.id) || item.currentStageId || (stages[0] && stages[0].id) || '', 'force_pass', false)
                  },
                }, Icon('unlock', 14), '强制放行'),
                monitoringHere && !monitorState.paused
                  ? h('button', { type: 'button', className: 'ap-btn ghost', title: '暂停当前会话事务，不中断当前对话', onClick: () => monitorEngine.pause() }, Icon('square', 14), '暂停事务')
                  : monitoringHere && monitorState.paused
                    ? h('button', {
                      type: 'button',
                      className: 'ap-btn ghost',
                      onClick: () => { monitorEngine.unpause(); refresh(true) },
                }, Icon('play', 14), '恢复事务')
                    : null,
              ),
            ),
            h('div', { className: 'ap-dual-state' },
              h('article', { className: 'ap-state-card' },
                h('div', { className: 'ap-state-card-hd' },
                  h('div', null,
                    h('strong', null, '执行态（主智能体回写）'),
                    h('span', { className: 'ap-sub' }, '主对话负责理解、计划、派活与阻塞说明'),
                  ),
                  h('span', { className: 'ap-chip' + (execution && execution.status === 'blocked' ? ' warn' : execution ? ' ok' : '') }, executionStatusLabel),
                ),
                execution
                  ? h('div', { className: 'ap-state-body' },
                    h('p', null, h('b', null, '目标：'), execution.objective || '未登记'),
                    h('p', null, h('b', null, '当前批次：'), execution.currentBatch || '未登记'),
                    h('p', null, h('b', null, '下一动作：'), execution.nextAction || '未登记'),
                    execution.plan && execution.plan.length
                      ? h('div', { className: 'ap-mini-list' }, execution.plan.slice(0, 5).map((plan) => h('div', { key: plan.id },
                        h('i', { className: 'ap-mini-status ' + plan.status }),
                        h('span', null, plan.title),
                      )))
                      : h('p', { className: 'ap-sub' }, '尚未登记结构化计划。'),
                    execution.assignments && execution.assignments.length
                      ? h('p', { className: 'ap-sub' }, '子任务：' + execution.assignments.map((assignment) => assignment.title + ' [' + assignment.status + ']').join(' · '))
                      : null,
                    execution.blocker && execution.blocker.type !== 'none'
                      ? h('p', { className: 'ap-state-alert' }, '阻塞：' + (execution.blocker.reason || execution.blocker.needed || execution.blocker.type))
                      : null,
                    h('p', { className: 'ap-sub' }, 'revision ' + execution.revision + ' · 心跳 ' + formatClock(execution.heartbeatAt)),
                  )
                  : h('div', { className: 'ap-state-empty' }, '主智能体尚未回写执行计划。点「继续推进」后，主对话应先读取 status，再登记目标、批次、计划和下一动作。'),
              ),
              h('article', { className: 'ap-state-card' },
                h('div', { className: 'ap-state-card-hd' },
                  h('div', null,
                    h('strong', null, '事实态（系统核验）'),
                    h('span', { className: 'ap-sub' }, '只核验磁盘成果、BOQ、证据、引用与人工门禁'),
                  ),
                  h('span', { className: 'ap-chip' + (activeControl && activeControl.alignment !== 'aligned' ? ' warn' : currentReality ? ' ok' : '') }, alignmentLabel),
                ),
                h('div', { className: 'ap-state-body' },
                  h('p', null, h('b', null, '当前阶段：'), currentReality ? currentReality.stageLabel : (item.currentStageId || '未开始')),
                  currentReality
                    ? h('p', null,
                      '任务 ' + currentReality.tasks.done + '/' + currentReality.tasks.total,
                      currentReality.summary ? (currentReality.summary.exists ? ' · 总报告已就位' : ' · 缺《' + currentReality.summary.fileName + '》') : '',
                      currentReality.boqInventory ? (currentReality.boqInventory.ok ? ' · BOQ 已核验' : ' · BOQ 有缺口') : '',
                      currentReality.citations && currentReality.citations.total ? ' · 孤儿引用 ' + currentReality.citations.orphans : '',
                    )
                    : h('p', { className: 'ap-sub' }, '尚未执行本轮事实核验；阶段状态为 ' + ((currentSlice && currentSlice.status) || 'idle') + '。'),
                  activeControl && activeControl.realityDigest
                    ? h('p', { className: 'ap-sub' }, '事实版本 ' + activeControl.realityDigest)
                    : null,
                ),
              ),
            ),
            activeControl && activeControl.differences && activeControl.differences.length
              ? h('div', { className: 'ap-alignment-alert' },
                h('strong', null, '认知差异'),
                h('ul', null, activeControl.differences.map((difference, index) => h('li', { key: index }, difference))),
              )
              : null,
            reality && reality.stages ? h('div', { className: 'ap-check' },
              h('div', { className: 'ap-check-hd' },
                '系统事实明细',
                h('span', { className: 'ap-sub' },
                  formatClock(reality.generatedAt)
                  + (reality.stages[0] && reality.stages[0].quietMinutes != null ? ' · 最近产出 ' + reality.stages[0].quietMinutes + ' 分钟前' : '')),
                h('button', { type: 'button', className: 'ap-btn ghost', onClick: () => setReality(null) }, '收起'),
              ),
              reality.stages.map((st, index) => {
                const parts = []
                if (st.userRequirements && st.userRequirements.active > 0) {
                  parts.push('用户要求待落实 ' + st.userRequirements.active + ' 条')
                } else if (st.userRequirementOverride) {
                  parts.push('用户验收口径已生效')
                }
                if (st.tasks && st.tasks.total > 0) {
                  parts.push('任务 ' + st.tasks.done + '/' + st.tasks.total + (st.tasks.error ? '（' + st.tasks.error + ' 个 error）' : ''))
                }
                const missing = (st.artifacts ? st.artifacts.missingMarkdown.length + st.artifacts.missingReport.length : 0)
                if (missing > 0) parts.push('缺产物 ' + missing + ' 份')
                if (st.summary) parts.push(st.summary.exists ? '总报告已就位' : '缺《' + st.summary.fileName + '》')
                if (st.suite) {
                  if (st.suite.ok) parts.push('投标分析底稿已齐')
                  else if (st.suite.shortGaps) parts.push(st.suite.shortGaps)
                  else parts.push('投标分析底稿未齐')
                }
                if (st.boqInventory) {
                  if (st.boqInventory.ok) parts.push('工程量清单已抽出 ' + (st.boqInventory.touchedCount || st.boqInventory.itemCount || 0) + ' 行')
                  else if (st.boqInventory.shortGaps) parts.push(st.boqInventory.shortGaps)
                  else parts.push('未摸到工程量清单')
                }
                if (st.workbook) parts.push(st.workbook.exists ? '测算表已就位' : '缺《' + st.workbook.fileName + '》')
                if (st.stageId === item.currentStageId && st.citations && st.citations.total > 0) {
                  parts.push('引用 ' + st.citations.total + ' 令牌 / ' + st.citations.orphans + ' 孤儿')
                }
                if (st.evidence && st.evidence.blocking) parts.push('门禁阻塞（' + st.evidence.gapCount + ' 缺口）')
                else if (st.evidence && st.evidence.waived) parts.push('门禁已放行')
                const unfinishedTasks = st.tasks ? st.tasks.total - st.tasks.done : 0
                const bad = typeof st.needsQc === 'boolean'
                  ? st.needsQc
                  : (missing > 0
                    || (st.summary && !st.summary.exists && st.stageStatus !== 'idle')
                    || (st.suite && !st.suite.ok && st.stageStatus !== 'idle')
                    || (st.boqInventory && !st.boqInventory.ok && st.stageStatus !== 'idle')
                    || (st.workbook && !st.workbook.exists && st.stageStatus !== 'idle')
                    || (st.evidence && st.evidence.blocking)
                    || (st.stageId === item.currentStageId && st.citations && st.citations.orphans > 0)
                    || (st.stageStatus === 'done' && unfinishedTasks > 0))
                const idleText = st.stageStatus === 'idle' ? '未开始'
                  : (st.stageStatus === 'done' && !bad ? '阶段已收口（商务待办不挡完成）' : '无异常')
                return h('div', { className: 'ap-check-row' + (bad ? ' bad' : ''), key: st.stageId },
                  h('span', { className: 'ap-check-num' }, index + 1),
                  h('strong', null, st.stageLabel),
                  statusChip(st.stageStatus),
                  h('span', { className: 'ap-sub' }, parts.length ? parts.join(' · ') : idleText),
                )
              }),
            ) : null,
            stages.map((stage, index) => {
              const slice = stageSlice(item, stage.id)
              const stageMemory = item.memory && item.memory.stages ? item.memory.stages[stage.id] : null
              const tasks = (slice && slice.tasks) || []
              const done = tasks.filter((task) => task.status === 'done').length
              const failed = tasks.filter((task) => task.status === 'error').length
              const percent = tasks.length ? Math.round((done / tasks.length) * 100) : (slice && slice.status === 'done' ? 100 : 0)
              const setupDone = slice && slice.status === 'done'
              const checkRow = reality && reality.stages ? reality.stages.find((st) => st.stageId === stage.id) : null
              const closedClean = setupDone && stageMemory && stageMemory.status === 'current' && !stageRowDirty(slice, tasks, checkRow)
              const outFolder = (checkRow && checkRow.outputFolder) || officialFolder(stage.id)
              const stageHint = closedClean
                ? ('阶段已收口。成果在 Agent Pi Outputs/' + project.projectId + '/' + outFolder + '/。询价、开工确认、submission_audit 未通过是投标可提交门禁，不表示本阶段没做完。')
                : (stage.hintZh || stage.prompt)
              return h('div', { className: 'ap-stage-row', key: stage.id },
                h('span', { className: 'ap-stage-num' }, index + 1),
                h('div', { className: 'ap-stage-body' },
                  h('div', { className: 'ap-row' },
                    h('strong', null, stage.labelZh),
                    statusChip(slice && slice.status),
                    stageMemory && stageMemory.status === 'current'
                      ? h('span', { className: 'ap-chip ok', title: stageMemory.path }, '基线 v' + stageMemory.revision)
                      : stageMemory && stageMemory.status === 'stale'
                        ? h('span', { className: 'ap-chip warn', title: stageMemory.staleReason || '' }, '记忆已失效')
                        : slice && slice.status === 'done'
                          ? h('span', { className: 'ap-chip warn' }, '待生成记忆')
                          : null,
                    slice && slice.forcePassedAt ? h('span', { className: 'ap-chip' }, '已强制放行') : null,
                    slice && slice.approval && slice.approval.decision === 'approved'
                      ? h('span', { className: 'ap-chip ok' }, '用户已确认')
                      : slice && slice.approval && slice.approval.decision === 'rejected'
                        ? h('span', { className: 'ap-chip warn' }, '用户已暂停')
                        : stage.approvalGate && slice
                          ? h('span', { className: 'ap-chip warn' }, '待用户决策')
                          : null,
                  ),
                  h('p', { className: 'ap-stage-hint' }, stageHint),
                  stageMemory && stageMemory.inputs && stageMemory.inputs.length
                    ? h('p', { className: 'ap-sub' }, '前序基线：' + stageMemory.inputs.map((input) => {
                      const upstream = stages.find((item) => item.id === input.ref)
                      const label = input.kind === 'handoff' ? ((upstream && upstream.labelZh) || input.ref) : ('能力包 ' + input.ref)
                      return label + (input.revision ? ' v' + input.revision : '') + (input.status === 'current' ? '' : '（' + input.status + '）')
                    }).join(' · '))
                    : null,
                  slice && slice.blockedReason ? h('div', { className: 'ap-err' }, slice.blockedReason) : null,
                  evidence && stage.id !== setupId && evidence.gaps && evidence.gaps.length
                    && (stage.id === item.currentStageId || (slice && slice.status === 'blocked') || stage.id === 'tender-document-analysis')
                    ? evidence.gaps.slice(0, 4).map((gap) => h('div', { className: 'ap-gap', key: stage.id + gap.chapterId },
                      h('span', { className: 'ap-chip warn' }, '缺口'),
                      gap.title + ' — ' + gap.suggestedUpload,
                    ))
                    : null,
                  tasks.length
                    ? h('div', { style: { marginTop: 8 } },
                      h('div', { className: 'ap-bar' + (failed ? ' fail' : '') }, h('i', { style: { width: percent + '%' } })),
                      h('div', { className: 'ap-sub' }, '清单 ' + done + '/' + tasks.length + (failed ? ' · 失败 ' + failed : '')),
                      tasks.slice(0, 8).map((task) => {
                        const restore = findSetupRestore(item.restores, task.sourcePath || task.markdownPath)
                        const setupFile = !!(setupId && stage.id === setupId && (task.sourcePath || task.markdownPath))
                        const alignable = setupFile && /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(task.sourcePath || '')
                        return h('div', { className: 'ap-task', key: task.id },
                          h('button', {
                            type: 'button',
                            className: 'ap-task-open',
                            title: (restore && restore.manuscriptPath) || task.markdownPath || task.sourcePath,
                            onClick: () => window.dispatchEvent(new CustomEvent('agent-pi-open-file', {
                              detail: { cwd, path: task.markdownPath || restoreOpenPath(task.sourcePath, item.restores) || task.sourcePath },
                            })),
                          }, task.title),
                          setupFile && restore
                            ? h('span', { className: 'ap-chip ok', title: restore.manuscriptPath }, '已对齐')
                            : alignable
                              ? h('span', { className: 'ap-chip' }, '待对齐')
                              : h('span', { className: 'ap-chip' + (task.status === 'done' ? ' ok' : task.status === 'error' ? ' warn' : '') }, taskStatusLabel(task.status)),
                        )
                      }),
                    )
                    : null,
                ),
                h('div', { className: 'ap-stage-acts' },
                  stage.approvalGate && slice && slice.status !== 'done'
                    ? h(React.Fragment, null,
                      h('button', {
                        type: 'button',
                        className: 'ap-btn primary',
                        disabled: !!busy,
                        title: stage.approvalGate.promptZh,
                        onClick: () => decideStage(project, stage, 'approved'),
                      }, busy === 'approve_gate:' + stage.id ? '记录中…' : stage.approvalGate.approveLabelZh),
                      stage.approvalGate.rejectLabelZh
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn ghost',
                          disabled: !!busy,
                          onClick: () => decideStage(project, stage, 'rejected'),
                        }, stage.approvalGate.rejectLabelZh)
                        : null,
                    )
                    : null,
                  setupId && stage.id === setupId
                    ? h(React.Fragment, null,
                      h('button', {
                        type: 'button',
                        className: 'ap-btn primary',
                        disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
                        title: '按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿',
                        onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy('')),
                      }, busy === 'restore' ? '对齐中…' : '对齐原稿'),
                      setupDone
                      ? h('button', { type: 'button', className: 'ap-btn', onClick: () => setWorkbenchOpen(false) }, '资料已齐套')
                      : h('button', {
                        type: 'button',
                        className: 'ap-btn',
                        disabled: !!busy,
                        onClick: () => {
                          restoreSources(project).then(() => runStage(project, setupId, 'complete', true)).catch((e) => setError(String(e.message || e)))
                        },
                      }, busy === 'complete:' + setupId || busy === 'restore' ? '对齐并确认中…' : '资料齐套，进入下一阶段'),
                    )
                    : h(React.Fragment, null,
                      closedClean
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn primary',
                          title: '打开本阶段正式成果目录',
                          onClick: () => {
                            openInExplorer(cwd, officialStagePath(cwd, project.projectId, stage.id), {
                              file: { type: 'directory', path: officialStagePath(cwd, project.projectId, stage.id) },
                              reveal: false,
                            }).catch((e) => setError(String(e.message || e)))
                          },
                        }, '打开成果')
                        : h('button', {
                          type: 'button',
                          className: 'ap-btn',
                          disabled: !!busy,
                          title: '同步成果到正式输出，并核验全部引用令牌（孤儿引用逐条列出）',
                          onClick: () => runStage(project, stage.id, 'organize', false),
                        }, '成果质检并整理'),
                      closedClean
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn link',
                          disabled: !!busy,
                          title: '再核一次盘面。已收口且无差异时不会要求再 complete_stage，也不会把商务待办写成阶段未完成。',
                          onClick: () => runStage(project, stage.id, 'organize', false),
                        }, busy === 'organize:' + stage.id ? '核对中…' : '再次核对盘面')
                        : h('button', {
                          type: 'button',
                          className: 'ap-btn link',
                          disabled: !!busy,
                          title: '跳到这一阶段。若它已是当前未完阶段，走恢复稿而不是再灌全文。',
                          onClick: () => {
                            const currentUnfinished = item.currentStageId === stage.id && slice && slice.status !== 'done' && tasks.length > 0
                            runStage(project, currentUnfinished ? '' : stage.id, currentUnfinished ? 'resume' : 'prepare', true)
                          },
                        }, '进入此阶段'),
                      h('button', {
                        type: 'button',
                        className: 'ap-btn link',
                        disabled: !!busy,
                        onClick: () => {
                          if (!window.confirm('重置「' + stage.labelZh + '」编排？任务清单会清空，磁盘成果保留。')) return
                          runStage(project, stage.id, 'reset', false)
                        },
                      }, '重置编排'),
                    ),
                ),
              )
            }),
          ),
          h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
              h('h2', null, '项目资料'),
              h('div', { className: 'ap-row' },
                h('span', { className: 'ap-sub' }, '对齐原稿后点名称预览改稿；保存同步 JSON'),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
                  title: '按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿',
                  onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy('')),
                }, busy === 'restore' ? '对齐中…' : '对齐原稿'),
              ),
            ),
            h('div', { className: 'ap-files-list' },
              !(project.inputPaths && project.inputPaths.length)
                ? h('p', { className: 'ap-sub', style: { padding: '18px 0' } }, '尚未登记资料。')
                : project.inputPaths.map((path) => {
                  const restore = findSetupRestore(item.restores, path)
                  return h('div', { className: 'ap-file-row', key: path },
                    h('button', {
                      type: 'button',
                      className: 'ap-file-link',
                      title: restore ? restore.manuscriptPath : path,
                      onClick: () => window.dispatchEvent(new CustomEvent('agent-pi-open-file', {
                        detail: { cwd, path: restoreOpenPath(path, item.restores) },
                      })),
                    }, fileName(path)),
                    restore
                      ? h('span', { className: 'ap-chip ok', title: restore.manuscriptPath }, '已对齐')
                      : (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(path) ? h('span', { className: 'ap-chip' }, '待对齐') : null),
                  )
                }),
            ),
          ),
          row.workSurface ? h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
              h('h2', null, '知识面导航与证据'),
              h('span', { className: 'ap-sub' }, 'PageIndex 影子树只负责长文档导航；BOQ 仍以表格单元格为准'),
            ),
            h('div', { className: 'ap-audit' + (row.workSurface.pageIndex.fallback ? ' bad' : '') },
              h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
                h('span', null,
                  '影子树 ' + row.workSurface.pageIndex.ready + ' 份'
                  + (row.workSurface.pageIndex.notEligible ? ' / ' + row.workSurface.pageIndex.notEligible + ' 份保持原检索' : '')
                  + (row.workSurface.pageIndex.fallback ? ' / ' + row.workSurface.pageIndex.fallback + ' 份已回退' : '')),
                h('span', { className: 'ap-chip' }, row.workSurface.defaultNavigator ? '默认导航' : '影子评测'),
              ),
              h('div', { className: 'ap-row', style: { marginTop: 8, flexWrap: 'wrap' } },
                h('span', { className: 'ap-sub' },
                  row.workSurface.coverage.initialized
                    ? (row.workSurface.coverage.ready ? '五域覆盖：已完成' : '五域覆盖：有未读节点/证据/结论缺口')
                    : '五域覆盖：等待首份长叙事资料对齐'),
                h('span', { className: 'ap-sub' }, '结构化证据 ' + row.workSurface.evidence.claimCount + ' 条'),
                h('span', { className: 'ap-sub' }, '遥测 ' + row.workSurface.telemetry.eventCount + ' 次'),
              ),
              !row.workSurface.defaultNavigator
                ? h('p', { className: 'ap-sub', style: { margin: '8px 0 0' } }, '默认切换仍受真实项目 80–120 项评测、Route F1、定位有效率、BOQ 基线和回退测试门禁控制。')
                : null,
            ),
          ) : null,
          row.citationAudit ? h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
              h('h2', null, '引用核验'),
              h('span', { className: 'ap-sub' }, '成果中的 [kb:…]/[src:…]/[ev:…] 令牌逐一对回知识库、项目文件与冻结证据包'),
            ),
            h('div', { className: 'ap-audit' + (row.citationAudit.orphans.length ? ' bad' : '') },
              h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
                h('span', null,
                  row.citationAudit.orphans.length
                    ? '未通过：' + row.citationAudit.orphans.length + ' 个孤儿引用 / 共 ' + row.citationAudit.totalCitations + ' 个令牌'
                    : (row.citationAudit.totalCitations
                      ? '通过：' + row.citationAudit.totalCitations + ' 个令牌全部可解析（kb ' + row.citationAudit.kbCitations + ' / src ' + row.citationAudit.srcCitations + ' / ev ' + (row.citationAudit.evidenceCitations || 0) + '）'
                      : '尚无引用令牌（' + row.citationAudit.checkedFiles + ' 个成果文件）')),
                h('span', { className: 'ap-sub' }, String(row.citationAudit.generatedAt || '').slice(0, 16).replace('T', ' ')),
              ),
              row.citationAudit.orphans.length
                ? h('ul', null, row.citationAudit.orphans.slice(0, 8).map((orphan, index) => h('li', { key: index },
                  orphan.file + ':' + orphan.line + ' ' + orphan.token + ' — ' + orphan.reason)))
                : null,
              row.citationAudit.orphans.length > 8
                ? h('p', { className: 'ap-sub', style: { margin: '6px 0 0' } }, '…其余 ' + (row.citationAudit.orphans.length - 8) + ' 条见 orchestration/citation-audit.json')
                : null,
            ),
          ) : null,
          notice ? h('div', { className: 'ap-sub', style: { padding: '10px 0 0' } }, notice) : null,
          monitorState.note && monitoringHere ? h('div', { className: 'ap-sub', style: { padding: '4px 0 0' } }, '监控：' + monitorState.note) : null,
          draft ? h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-sub' }, '阶段稿（最近一次准备的内容；提交后由 dsh 原生 subagent / workflow 执行）'),
            h('div', { className: 'ap-draft' }, draft),
          ) : null,
        )
      }

      const specialContent = module === 'kb'
        ? h(KnowledgeBasePanel, { cwd, sessionId: pinParentSessionId() || resolveSessionId(props) || runtime.sessionId || '' })
        : module === 'archive'
          ? h(ArchivePanel, { onClose: props.onClose })
          : module === 'modules'
            ? h(ModuleManagerPanel, {
              cwd,
              onChanged: () => refresh(true),
              onOpened: (id) => {
                refresh(true).then(() => selectModule(id))
              },
              onDesign: (kind) => {
                const known = (data && data.modules ? data.modules : catalog).map((item) => item.id)
                const sourceRow = data && data.projects
                  ? data.projects.find((item) => item && item.project && item.project.projectId === selectedId)
                  : null
                try {
                  sessionStorage.setItem('ap-wb-known-modules', JSON.stringify(known))
                  sessionStorage.setItem('ap-wb-await-module', '1')
                } catch {}
                setBusy('module-create')
                setError('')
                setNotice('正在进入 DSH 原生创造模式…')
                openNativeModuleCreate(
                  props,
                  MODULE_CREATE_PROMPTS[kind] || MODULE_CREATE_PROMPTS['custom-steps'],
                  {
                    cwd,
                    module: sourceRow && sourceRow.project ? sourceRow.project.module : '',
                    projectId: sourceRow && sourceRow.project ? sourceRow.project.projectId : '',
                    projectRoot: sourceRow && sourceRow.project ? sourceRow.project.rootPath : cwd,
                  },
                ).then(() => {
                  showToast('已进入 DSH 原生创造模式；完成后模块会自动出现在专业工作台。')
                  if (props.onClose) props.onClose()
                }).catch((err) => {
                  try { sessionStorage.removeItem('ap-wb-await-module') } catch {}
                  setError(String(err && err.message || err))
                  setNotice('')
                }).finally(() => setBusy(''))
              },
            })
            : null

      return h(WorkbenchView, {
        cwd,
        onClose: props.onClose,
        catalog,
        module,
        current,
        onSelectModule: selectModule,
        refreshing,
        onRefresh: () => refresh(),
        onAdopt: openAdopt,
        onCreate: openCreate,
        moduleErrorCount: data && data.moduleErrors ? data.moduleErrors.length : 0,
        error,
        specialContent,
        projects,
        selectedId,
        onSelectProject: selectProject,
        overview: row ? renderOverview(row) : null,
        picking,
        pickSelected,
        onTogglePick: togglePick,
        onClosePicker: () => setPicking(false),
        onSaveFiles: saveFiles,
        busy,
      })
    }
    function CreateOverlay(props) {
      useApLang()
      const sessionCwd = readWorkspaceCwd(props)
      const [open, setOpen] = React.useState(false)
      const [mode, setMode] = React.useState('create')
      const [step, setStep] = React.useState(0)
      const [module, setModule] = React.useState('tender')
      const [name, setName] = React.useState('')
      const [projectId, setProjectId] = React.useState('')
      const [idEdited, setIdEdited] = React.useState(false)
      const [folderMode, setFolderMode] = React.useState('create')
      const [selectedPath, setSelectedPath] = React.useState('')
      const [attachments, setAttachments] = React.useState([])
      const [error, setError] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [cwd, setCwd] = React.useState('')
      const [catalog, setCatalog] = React.useState(null)
      const [preview, setPreview] = React.useState(null)

      const reset = () => {
        setStep(0)
        setName('')
        setProjectId('')
        setIdEdited(false)
        setFolderMode('create')
        setSelectedPath('')
        setAttachments([])
        setError('')
        setSaving(false)
        setPreview(null)
      }

      React.useEffect(() => {
        const onOpen = (event) => {
          const fromEvent = event && event.detail && event.detail.cwd
          const nextMode = event && event.detail && event.detail.mode === 'adopt' ? 'adopt' : 'create'
          const nextModule = event && event.detail && event.detail.module
          if (nextModule) setModule(nextModule)
          const nextCwd = fromEvent || sessionCwd || ''
          setMode(nextMode)
          setCwd(nextCwd)
          reset()
          setOpen(true)
          api('/api/agent-pi/modules', nextCwd, { method: 'GET' })
            .then((body) => setCatalog(body.modules || null))
            .catch(() => setCatalog(null))
          if (nextMode !== 'adopt' || !nextCwd) return
          setFolderMode('existing')
          setSelectedPath(nextCwd)
          const folder = fileName(nextCwd)
          setName(folder)
          setProjectId(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(folder) ? folder : (slugify(folder) || folder))
          setIdEdited(true)
          const previewUrl = '/api/agent-pi/projects/adopt-preview' + (nextModule ? ('?module=' + encodeURIComponent(nextModule)) : '')
          api(previewUrl, nextCwd, { method: 'GET' })
            .then((body) => {
              setPreview(body)
              if (body.name) setName(body.name)
              if (body.projectId) setProjectId(body.projectId)
              if (Array.isArray(body.suggestedInputs)) setAttachments(body.suggestedInputs)
            })
            .catch(() => {})
        }
        window.addEventListener('agent-pi-open-create', onOpen)
        return () => window.removeEventListener('agent-pi-open-create', onOpen)
      }, [sessionCwd])

      if (!open) return h('span', { style: { pointerEvents: 'none' } })
      const desktop = desktopApi()
      const catalogRows = catalog || Object.values(MODULES)
      const catalogRow = catalogRows.find((item) => item.id === module) || null
      const current = catalogRow || MODULES[module] || { id: module, labelZh: module }
      const workflow = catalogRow && catalogRow.workflow ? catalogRow.workflow : null
      const normalizedId = projectId.trim() || (slugify(name) || (module + '-' + Date.now().toString(36)))
      const adopt = mode === 'adopt'
      const existingHere = ((preview && preview.existing) || []).find((item) => item.module === module)
      const rootPath = adopt
        ? cwd
        : selectedPath
          ? (folderMode === 'create' ? joinPath(selectedPath, normalizedId) : selectedPath)
          : ''
      const canContinue = adopt
        ? (step === 0 ? Boolean(module) : step === 1 ? Boolean(name.trim() && normalizedId && cwd) : true)
        : (step === 0
          ? Boolean(name.trim() && normalizedId)
          : step === 1
            ? Boolean(selectedPath)
            : true)
      const close = () => { if (!saving) { setOpen(false); reset() } }

      const finishCreated = (createdId) => {
        const parentId = pinParentSessionId()
        if (parentId) {
          rememberWorkbenchBinding(parentId, { cwd, module, projectId: createdId })
          ensureUserRequirementWatcher(parentId)
          void api('/api/agent-pi/stage', cwd, {
            method: 'POST',
            body: JSON.stringify({
              action: 'bind_session',
              module,
              projectId: createdId,
              sessionId: parentId,
            }),
          }).catch((error) => showToast('项目与主会话绑定失败：' + String(error && error.message || error)))
        }
        setOpen(false)
        reset()
        try {
          sessionStorage.setItem('ap-wb-module', module)
          sessionStorage.setItem('ap-wb-project', createdId)
        } catch {}
        setWorkbenchOpen(true)
        window.dispatchEvent(new CustomEvent('agent-pi-created', {
          detail: { projectId: createdId, module },
        }))
      }

      const handleCreate = () => {
        if (!rootPath || saving) return
        if (adopt && existingHere) {
          finishCreated(existingHere.projectId)
          return
        }
        setSaving(true)
        setError('')
        const body = adopt
          ? { action: 'adopt', module, name: name.trim(), projectId: normalizedId, inputPaths: attachments }
          : {
            module,
            name: name.trim(),
            projectId: normalizedId,
            rootPath,
            createDirectory: folderMode === 'create',
            inputPaths: attachments,
          }
        api('/api/agent-pi/projects', cwd, {
          method: 'POST',
          body: JSON.stringify(body),
        }).then((created) => {
          const createdId = created && created.project ? created.project.projectId : normalizedId
          finishCreated(createdId)
        }).catch((e) => {
          setError(String(e.message || e))
          setSaving(false)
        })
      }

      const toggleAttach = (path, _name, forceAdd) => {
        setAttachments((currentPaths) => {
          const has = currentPaths.indexOf(path) >= 0
          if (forceAdd && has) return currentPaths
          if (has) return currentPaths.filter((item) => item !== path)
          return currentPaths.concat([path])
        })
      }

      const steps = adopt
        ? [tAp('create.step.module'), tAp('create.step.info'), tAp('create.step.files'), tAp('create.step.confirmAdopt')]
        : [tAp('create.step.info'), tAp('create.step.folder'), tAp('create.step.files'), tAp('create.step.confirmNew')]
      const FALLBACK_STAGE_LABELS = {
        tender: ['项目资料登记', '招标文件解析', 'BOQ 逐页组价与资源汇总', '施工策划、进度、成本与出稿'],
        delivery: ['实施工作区建立', '合同范围 / 进度 / 成本 / 风险'],
        investment: ['授权与工作区', '尽调与决策包'],
      }
      const stageLabels = {}
      stageLabels[module] = workflow
        ? workflow.stages.map((stage) => stage.labelZh)
        : (FALLBACK_STAGE_LABELS[module] || [])
      const showName = adopt ? step === 1 : step === 0
      const showFolder = !adopt && step === 1
      const showFiles = step === 2
      const showConfirm = step === 3

      return h('div', { className: 'ap-overlay', onClick: (e) => { if (e.target === e.currentTarget) close() } },
        h('div', { className: 'ap-modal wide' },
          h('button', { type: 'button', className: 'ap-close', onClick: close, 'aria-label': tAp('create.close') }, Icon('x', 16)),
          h('h1', null, adopt ? tAp('create.titleAdopt') : tAp('create.titleNew', { name: moduleLabel(current) })),
          h('p', { className: 'hint' }, adopt ? tAp('create.hintAdopt') : tAp('create.hintNew')),
          h('div', { className: 'ap-steps' },
            steps.map((label, index) => h('span', { key: label, className: index === step ? 'on' : '' }, (index + 1) + '. ' + label)),
          ),
          adopt && step === 0 ? h('div', null,
            h('p', { className: 'ap-sub' }, tAp('create.whichModule')),
            h('div', { className: 'ap-mods', style: { flexWrap: 'wrap', marginTop: 10 } },
              catalogRows.filter((item) => !item.disabled).map((item) => h('button', {
                key: item.id,
                type: 'button',
                className: 'ap-mod' + (module === item.id ? ' on' : ''),
                onClick: () => setModule(item.id),
              }, moduleIconNode(item, 15), moduleLabel(item))),
            ),
            existingHere
              ? h('p', { className: 'ap-sub', style: { marginTop: 12 } }, '当前工作区已是本模块项目「' + existingHere.name + '」，确认后直接打开。')
              : null,
          ) : null,
          showName ? h('div', null,
            h('label', null, '项目名称'),
            h('input', {
              value: name,
              autoFocus: true,
              placeholder: '例如：N3 公路升级投标',
              onChange: (e) => {
                const value = e.target.value
                setName(value)
                if (!idEdited) setProjectId(slugify(value))
              },
            }),
            h('label', null, '项目标识'),
            h('input', {
              value: projectId,
              placeholder: 'n3-upgrade',
              onChange: (e) => {
                setIdEdited(true)
                setProjectId(e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128))
              },
            }),
            h('p', { className: 'ap-sub' }, adopt
              ? '默认用当前工作区文件夹名。与正式成果目录对齐后，已有 Official Outputs 会挂到本项目。'
              : '用于项目状态目录和会话归类，不改变实际文件名。'),
          ) : null,
          showFolder ? h('div', null,
            h('div', { className: 'ap-mode' },
              h('button', {
                type: 'button',
                className: 'ap-btn' + (folderMode === 'create' ? ' primary' : ''),
                onClick: () => setFolderMode('create'),
              }, '新建项目文件夹'),
              h('button', {
                type: 'button',
                className: 'ap-btn' + (folderMode === 'existing' ? ' primary' : ''),
                onClick: () => setFolderMode('existing'),
              }, '关联现有项目文件夹'),
            ),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              style: { width: '100%', justifyContent: 'flex-start' },
              onClick: () => {
                if (desktop && typeof desktop.pickFolder === 'function') {
                  desktop.pickFolder().then((path) => { if (path) setSelectedPath(path) })
                  return
                }
                const fallback = window.prompt(folderMode === 'create' ? '上级目录绝对路径' : '现有项目目录绝对路径', selectedPath || cwd)
                if (fallback) setSelectedPath(fallback)
              },
            }, Icon('folder', 14), selectedPath || (folderMode === 'create' ? '选择上级目录' : '选择现有项目目录')),
            !selectedPath && cwd
              ? h('button', {
                type: 'button',
                className: 'ap-btn link',
                onClick: () => setSelectedPath(cwd),
              }, '使用当前工作区：' + cwd)
              : null,
            rootPath ? h('p', { className: 'ap-sub' }, '项目资料/成果目录：' + rootPath + '（阶段状态与编排数据保存在当前工作区，不写入该目录）') : null,
          ) : null,
          showFiles ? h(FilePickPanel, { cwd, selected: attachments, onToggle: toggleAttach }) : null,
          showConfirm ? h('div', { className: 'ap-confirm' },
            h('p', { style: { fontWeight: 600 } }, moduleLabel(current)),
            h('p', { className: 'ap-sub' }, adopt
              ? (existingHere
                ? '该工作区已登记过本模块，确认后打开已有项目。'
                : '不另建文件夹。已有正式成果保留；盘面从“' + ((stageLabels[module] || [])[0] || '资料登记') + '”起，不会自动改写后续阶段。')
              : '新项目从“' + (stageLabels[module] || [])[0] + '”开始；后续阶段在工作台切换。'),
            h('ol', { style: { paddingLeft: 18, margin: '10px 0' } },
              (stageLabels[module] || []).map((label) => h('li', { key: label, style: { margin: '6px 0', paddingBottom: 6, borderBottom: '1px solid var(--dsw-alias-border-l2)' } }, label)),
            ),
            h('p', null, h('span', { className: 'k' }, '项目：'), name),
            h('p', null, h('span', { className: 'k' }, '目录：'), rootPath),
            h('p', null, h('span', { className: 'k' }, '登记资料：'), attachments.length + ' 个'),
            adopt && preview && preview.officialCount
              ? h('p', null, h('span', { className: 'k' }, '已有正式成果：'), preview.officialCount + ' 份（保留）')
              : null,
          ) : null,
          error ? h('div', { className: 'ap-err' }, error) : null,
          h('div', { className: 'ap-foot' },
            step > 0 ? h('button', { type: 'button', className: 'ap-btn', disabled: saving, onClick: () => setStep((n) => n - 1) }, '上一步') : h('button', { type: 'button', className: 'ap-btn', disabled: saving, onClick: close }, '取消'),
            step < 3
              ? h('button', { type: 'button', className: 'ap-btn primary', disabled: !canContinue, onClick: () => setStep((n) => n + 1) }, '下一步')
              : h('button', {
                type: 'button',
                className: 'ap-btn primary',
                disabled: saving || !rootPath,
                onClick: handleCreate,
              }, saving
                ? (adopt ? '升级中…' : '创建中…')
                : (adopt
                  ? (existingHere ? '打开已有项目' : '升级为专业项目')
                  : '创建项目（登记资料后再启动阶段）')),
          ),
        ),
      )
    }

    function replaceChildren(nodes, path, children) {
      return (nodes || []).map((node) => {
        if (node.path === path) return Object.assign({}, node, { children: children, childrenLoaded: true, hasMoreChildren: false })
        if (node.children) return Object.assign({}, node, { children: replaceChildren(node.children, path, children) })
        return node
      })
    }

    const { FilePreviewOverlay, FolderPreviewOverlay, FilesPanel } = createFilePreviewOverlay({
      DocBtn,
      FileContextMenu,
      Icon,
      PREVIEW_HEAD_CHARS,
      PREVIEW_TABLE_ROW_CAP,
      React,
      ReactDOM,
      api,
      apiBlob,
      attachFolderPath,
      attachItemsOf,
      attachSessionId,
      buildPreviewSelectionFollowup,
      captureComposerFace,
      chooseAndUpload,
      chooseFolderForChat,
      codexTurnArmed,
      codexTurnListeners,
      currentDraft,
      dispatchToConversation,
      displayFileName,
      downloadBlob,
      escapeHtml,
      fileIconClass,
      fileIconName,
      fillComposer,
      fillMdTables,
      flattenFiles,
      foldAndSubmit,
      h,
      htmlToMarkdown,
      importWorkspaceFileToKb,
      looksLikeKbPackName,
      mdToHtml,
      mentionInChat,
      openInExplorer,
      previewIsHeavy,
      rawFileUrl,
      readDraft,
      readReasoningEffort,
      readWorkspaceCwd,
      replaceChildren,
      runtime,
      setCodexTurnArmed,
      showToast,
      slicePreviewMarkdown,
      snapshotComposer,
      snapshotFileList,
      sourceLabel,
      stitchMarkdown,
      stripComposerMentions,
      tAp,
      uploadFileList,
      useApLang,
      useAttachItems,
      wrapComposerSubmit,
    })


    function ComposerTools(props) {
      captureComposerFace(props)
      const live = snapshotComposer()
      const cwd = live.cwd
      const draft = readDraft()
      const [busy, setBusy] = React.useState(false)
      const [items, setItems] = useAttachItems()
      const fileInput = React.useRef(null)
      wrapComposerSubmit(live)
      React.useEffect(() => { if (items.length) stripComposerMentions(items) }, [items.length])
      const propsRef = React.useRef(live)
      propsRef.current = live
      const [, setCodexTurnTick] = React.useState(0)
      React.useEffect(() => {
        const sync = () => setCodexTurnTick((tick) => tick + 1)
        codexTurnListeners.add(sync)
        return () => { codexTurnListeners.delete(sync) }
      }, [])
      const armed = codexTurnArmed(live)
      React.useEffect(() => {
        const onFill = (event) => {
          const text = event && event.detail && event.detail.text
          if (!text) return
          const current = currentDraft(propsRef.current).trimEnd()
          fillComposer(propsRef.current, event.detail.append && current ? current + '\n' + text : text)
        }
        window.addEventListener('agent-pi-fill-composer', onFill)
        return () => {
          window.removeEventListener('agent-pi-fill-composer', onFill)
        }
      }, [])
      React.useEffect(() => {
        const isSendButton = (btn) => {
          if (!btn || btn.closest('.ap-row') || btn.closest('.ap-attach-host') || btn.closest('.ap-attach-rail')) return false
          if (!btn.closest('[data-composer-card]')) return false
          if (!/primary/i.test(String(btn.className || ''))) return false
          const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim()
          return !/停止|Stop|stop/i.test(label)
        }
        const onClick = (event) => {
          if (!codexAttachItems(attachmentTurnKey(propsRef.current)).length) return
          if (!isSendButton(event.target.closest('button'))) return
          event.preventDefault()
          event.stopPropagation()
          if (codexTurnArmed(propsRef.current)) {
            const submit = propsRef.current && propsRef.current.inputActions && propsRef.current.inputActions.submit
            if (typeof submit === 'function') submit()
            return
          }
          foldAndSubmit(propsRef.current)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
          if (!codexAttachItems(attachmentTurnKey(propsRef.current)).length) return
          const input = event.target && typeof event.target.closest === 'function'
            ? event.target.closest('textarea, [data-composer-input]')
            : null
          if (!input || !input.closest('[data-composer-card]')) return
          event.preventDefault()
          event.stopPropagation()
          if (codexTurnArmed(propsRef.current)) {
            const submit = propsRef.current && propsRef.current.inputActions && propsRef.current.inputActions.submit
            if (typeof submit === 'function') submit()
            return
          }
          foldAndSubmit(propsRef.current)
        }
        document.addEventListener('click', onClick, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [])
      const polish = () => {
        if (!cwd || !draft.trim() || busy) return
        setBusy(true)
        // provider/model/connectionName stay empty: the host falls back to the
        // agent-default-model from settings.yaml.
        api('/api/agent-pi/optimize-prompt', cwd, {
          method: 'POST',
          body: JSON.stringify({
            input: draft,
            attachments: codexAttachItems(attachmentTurnKey(live)).map((item) => ({
              name: item.name,
              type: item.kind,
              size: item.size,
            })),
            reasoningEffort: readReasoningEffort(),
          }),
        }).then((result) => {
          if (result.optimizedPrompt) fillComposer(live, result.optimizedPrompt)
          showToast(result.fallback ? '已用本地模板润色（当前模型未响应）' : '已用当前模型润色')
        }).catch((err) => {
          showToast('润色失败：' + String(err && err.message || err))
        }).finally(() => setBusy(false))
      }
      const uploaded = items.filter((item) => item.kind !== 'image').length
      return h('div', { className: 'ap-composer-tools' },
        h('div', { className: 'ap-row', style: { gap: 2 } },
          h('button', {
            type: 'button',
            className: 'ap-toolbtn' + (busy ? ' on' : ''),
            title: busy ? '正在用当前模型润色…' : '用当前模型润色提示词',
            disabled: busy || !draft.trim(),
            onMouseDown: (e) => e.preventDefault(),
            onClick: polish,
          }, Icon('sparkles', 15, busy ? 'ap-spin' : '')),
          h('button', {
            type: 'button',
            className: 'ap-codex-turn' + (armed ? ' on' : ''),
            'aria-pressed': armed ? 'true' : 'false',
            title: armed
              ? '下一条消息将由 Codex 子智能体执行'
              : '仅将下一条消息交给 Codex 子智能体',
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setCodexTurnArmed(propsRef.current, !armed),
          }, Icon('sparkles', 14), 'Codex 执行'),
          h('button', {
            type: 'button',
            className: 'ap-toolbtn',
            title: uploaded ? '已加入 ' + uploaded + ' 个文件' : '上传文件到对话（回形针）',
            onMouseDown: (e) => e.preventDefault(),
            onClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              chooseAndUpload(cwd, snapshotComposer(), 'files', { fileInput }).catch((err) => showToast('上传失败：' + String(err && err.message || err)))
            },
          }, Icon('paperclip', 15), uploaded ? h('span', { className: 'ap-badge' }, uploaded > 9 ? '9+' : uploaded) : null),
          h('button', {
            type: 'button',
            className: 'ap-toolbtn',
            title: tAp('files.addFolder'),
            onMouseDown: (e) => e.preventDefault(),
            onClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              chooseFolderForChat(cwd, snapshotComposer()).catch((err) => showToast('加入文件夹失败：' + String(err && err.message || err)))
            },
          }, Icon('folder', 15)),
          h('input', { ref: fileInput, type: 'file', multiple: true, style: { position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },           onChange: (e) => {
            const list = snapshotFileList(e.target.files)
            e.target.value = ''
            if (list.length) uploadFileList(cwd, list, snapshotComposer()).catch((err) => showToast('上传失败：' + String(err && err.message || err)))
          } }),
        ),
      )
    }

    function renderAttachRail(items, onRemove) {
      return h('div', { className: 'ap-attach-host', 'aria-label': '已加入对话的文件' },
        h('div', { className: 'ap-attach-rail' },
          items.map((item) => h('div', {
            key: item.id || item.relativePath,
            className: 'ap-attach-bubble' + (item.kind === 'image' ? ' image' : '') + (item.kind === 'folder' ? ' folder' : '') + (item.loaded === false ? ' loading' : ''),
            title: item.error || item.path || item.relativePath || item.name,
          },
            h('button', {
              type: 'button',
              className: 'ap-attach-x',
              title: '移除',
              onClick: () => onRemove(item),
            }, Icon('x', 10)),
            h('div', { className: 'ap-attach-thumb' },
              item.loaded === false
                ? Icon('sparkles', 16, 'ap-spin')
                : item.kind === 'image' && item.previewUrl
                  ? h('img', { src: item.previewUrl, alt: item.name })
                  : Icon(item.kind === 'folder' ? 'folder' : item.kind === 'text' ? 'fileText' : 'file', 16),
            ),
            item.kind === 'image' ? null : h('div', { className: 'ap-attach-meta' },
              h('strong', { title: item.path || item.relativePath || item.name }, item.name),
            ),
          )),
        ),
      )
    }

    function ProfessionalProjectStarter(props) {
      const session = props && props.session
      const cwd = props && props.cwd
      const pending = session && Array.isArray(session.pendingSubmissions) ? session.pendingSubmissions.length : 0
      const queued = session && Array.isArray(session.queue) ? session.queue.length : 0
      if (!cwd || !session || session.blank !== true || session.running || pending || queued) return null
      const choices = [
        { module: MODULES.tender, label: '投标项目' },
        { module: MODULES.delivery, label: '项管项目' },
        { module: MODULES.investment, label: '投资项目' },
      ]
      return h('section', { className: 'ap-project-starter', 'aria-label': '新建专业工作台项目' },
        h('div', { className: 'ap-project-starter-copy' },
          h('strong', null, '新建专业工作台项目'),
          h('span', null, '当前主对话将绑定项目；登记资料后，从工作台明确点击推进并在这里开始执行。'),
        ),
        h('div', { className: 'ap-project-starter-actions' },
          choices.map((choice) => h('button', {
            key: choice.module.id,
            type: 'button',
            className: 'ap-btn' + (choice.module.id === 'tender' ? ' primary' : ''),
            onClick: () => window.dispatchEvent(new CustomEvent('agent-pi-open-create', {
              detail: { cwd, module: choice.module.id, mode: 'create', source: 'blank-conversation' },
            })),
          }, moduleIconNode(choice.module, 14), choice.label)),
        ),
      )
    }

    function AttachmentDock(props) {
      const cwd = captureComposerFace(props)
      wrapComposerSubmit(snapshotComposer())
      return h(ProfessionalProjectStarter, { session: props && props.session, cwd })
    }

    function ensureComposerAttachHost() {
      const card = document.querySelector('[data-composer-card]')
      if (!card) return null
      let host = Array.prototype.find.call(card.children, (node) => node.classList && node.classList.contains('ap-attach-in-card'))
      if (!host) {
        host = document.createElement('div')
        host.className = 'ap-attach-in-card'
        const official = card.querySelector('[data-slot="conversation.input.attachments"]')
        if (official) official.insertAdjacentElement('afterend', host)
        else {
          const scroll = card.querySelector('[data-input-scroll]')
          if (scroll) card.insertBefore(host, scroll)
          else card.insertBefore(host, card.firstChild)
        }
      }
      return host
    }

    function AttachmentFloat() {
      useApLang()
      const [items, setItems] = useAttachItems()
      const [host, setHost] = React.useState(null)
      React.useEffect(() => {
        const place = () => setHost(ensureComposerAttachHost())
        place()
        window.addEventListener('resize', place)
        const timer = window.setInterval(place, 400)
        return () => {
          window.removeEventListener('resize', place)
          window.clearInterval(timer)
        }
      }, [items.length])
      if (!items.length) return null
      const rail = renderAttachRail(items, (item) => setItems(items.filter((row) => row !== item)))
      if (host && ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(rail, host)
      }
      const node = h('div', {
        className: 'ap-attach-float',
        style: { left: '50%', bottom: '168px', transform: 'translateX(-50%)', width: 'min(720px, calc(100vw - 48px))' },
      }, rail)
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function ToastHost() {
      const [text, setText] = React.useState('')
      React.useEffect(() => {
        let timer = 0
        const onToast = (event) => {
          const next = event && event.detail && event.detail.text
          if (!next) return
          setText(next)
          window.clearTimeout(timer)
          timer = window.setTimeout(() => setText(''), 4800)
        }
        window.addEventListener('agent-pi-toast', onToast)
        return () => {
          window.removeEventListener('agent-pi-toast', onToast)
          window.clearTimeout(timer)
        }
      }, [])
      if (!text) return null
      return h('div', { className: 'ap-toast', role: 'status' }, text)
    }


    function clampFilesRailWidth(px) {
      const n = Math.round(Number(px))
      if (!Number.isFinite(n) || n <= 0) return 300
      return Math.min(560, Math.max(220, n))
    }

    function readFilesRailWidth() {
      try { return clampFilesRailWidth(localStorage.getItem('ap-files-width') || 300) } catch { return 300 }
    }

    function writeFilesRailWidth(px) {
      const next = clampFilesRailWidth(px)
      try { localStorage.setItem('ap-files-width', String(next)) } catch {}
      return next
    }


    function FilesRail(props) {
      useApLang()
      const cwd = readWorkspaceCwd(props)
      const sessionId = activeSessionId(props)
      const [open, setOpen] = React.useState(() => {
        try { return sessionStorage.getItem('ap-files-open') !== '0' } catch { return true }
      })
      const [railWidth, setRailWidth] = React.useState(readFilesRailWidth)
      const [resizing, setResizing] = React.useState(false)
      const railWidthRef = React.useRef(railWidth)
      railWidthRef.current = railWidth
      const setRailOpen = (next) => {
        setOpen(next)
        try { sessionStorage.setItem('ap-files-open', next ? '1' : '0') } catch {}
      }
      const startRailResize = (event) => {
        if (!open) return
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startW = clampFilesRailWidth(railWidthRef.current)
        setResizing(true)
        document.documentElement.classList.add('ap-rail-resizing')
        const onMove = (ev) => {
          const next = clampFilesRailWidth(startW + (startX - ev.clientX))
          railWidthRef.current = next
          setRailWidth(next)
          document.documentElement.style.setProperty('--ap-files-w', next + 'px')
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          document.documentElement.classList.remove('ap-rail-resizing')
          setResizing(false)
          writeFilesRailWidth(railWidthRef.current)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }
      // Preview stack: opening pushes, closing pops. Clicking a source citation
      // inside a Markdown preview must return to that Markdown on close, not exit.
      const [stack, setStack] = React.useState([])
      const preview = stack.length > 0 ? stack[stack.length - 1] : null
      React.useEffect(() => {
        const onOpen = () => {
          setRailOpen(true)
        }
        window.addEventListener('agent-pi-open-files', onOpen)
        const onOpenFile = (event) => {
          const detail = event && event.detail
          const path = detail && detail.path
          if (!path) return
          setRailOpen(true)
          setStack((prev) => {
            const top = prev.length > 0 ? prev[prev.length - 1] : null
            if (top && top.type === 'file' && top.file && top.file.path === path && (!detail.kbSlug || top.file.kbSlug === detail.kbSlug)) return prev
            return prev.concat([{
              type: 'file',
              file: {
                path: path,
                name: detail.name || fileName(path),
                type: 'file',
                kbSlug: detail.kbSlug || '',
                kbHasSource: !!detail.kbHasSource,
              },
            }])
          })
        }
        window.addEventListener('agent-pi-open-file', onOpenFile)
        const onClosePreview = () => setStack([])
        window.addEventListener('agent-pi-close-preview', onClosePreview)
        return () => {
          window.removeEventListener('agent-pi-open-files', onOpen)
          window.removeEventListener('agent-pi-open-file', onOpenFile)
          window.removeEventListener('agent-pi-close-preview', onClosePreview)
        }
      }, [])
      React.useEffect(() => {
        const hasWorkspace = !!(cwd || sessionId)
        const reserved = hasWorkspace ? (open ? clampFilesRailWidth(railWidth) : 56) : 0
        if (reserved) document.documentElement.style.setProperty('--ap-files-w', reserved + 'px')
        else document.documentElement.style.removeProperty('--ap-files-w')
        document.documentElement.classList.toggle('ap-files-rail', hasWorkspace)
        document.documentElement.classList.toggle('ap-files-collapsed', !!(hasWorkspace && !open))
        document.documentElement.classList.toggle('ap-doc-open', !!preview)
      }, [cwd, sessionId, open, preview, railWidth])
      React.useEffect(() => {
        return () => {
          document.documentElement.classList.remove('ap-files-rail')
          document.documentElement.classList.remove('ap-files-collapsed')
          document.documentElement.classList.remove('ap-doc-open')
          document.documentElement.style.removeProperty('--ap-files-w')
        }
      }, [])
      const openFile = React.useCallback((file, fromFolder) => {
        setStack(fromFolder
          ? [{ type: 'folder', file: fromFolder }, { type: 'file', file: file }]
          : [{ type: 'file', file: file }])
      }, [])
      const openFolder = React.useCallback((file) => {
        setStack([{ type: 'folder', file: file }])
      }, [])
      const closePreview = React.useCallback(() => {
        setStack((prev) => prev.slice(0, -1))
      }, [])
      if (!cwd && !sessionId) return h('span', { style: { pointerEvents: 'none' } })
      const overlay = preview && preview.type === 'folder'
        ? h(FolderPreviewOverlay, {
          cwd: cwd,
          folder: preview.file,
          sessionProps: props,
          onClose: closePreview,
          onOpenFile: (file) => setStack((prev) => prev.concat([{ type: 'file', file: file }])),
        })
        : preview && preview.type === 'file'
          ? h(FilePreviewOverlay, {
            key: preview.file.kbSlug || preview.file.path,
            cwd: cwd,
            file: preview.file,
            kbSlug: preview.file.kbSlug || '',
            kbHasSource: !!preview.file.kbHasSource,
            sessionProps: props,
            onClose: closePreview,
            onDeleted: closePreview,
            onKbSaved: () => window.dispatchEvent(new Event('agent-pi-files-changed')),
          })
          : null
      const rail = h('div', {
        className: 'ap-files-dock' + (open ? '' : ' collapsed') + (resizing ? ' resizing' : ''),
        'data-files-collapsed': open ? undefined : 'true',
      },
        open ? h('div', {
          className: 'ap-files-resizer',
          title: tAp('files.resize'),
          'aria-label': tAp('files.resize'),
          role: 'separator',
          'aria-orientation': 'vertical',
          onPointerDown: startRailResize,
        }) : null,
        h(FilesPanel, Object.assign({}, props, {
          collapsed: !open,
          onOpenFile: openFile,
          onOpenFolder: openFolder,
          onToggle: () => { setRailOpen(!open) },
        })),
      )
      return h(React.Fragment, null, rail, overlay)
    }

    function FilesToggle() {
      useApLang()
      return h('button', {
        type: 'button',
        className: 'ap-header-tool',
        title: tAp('files.title'),
        'aria-label': tAp('files.title'),
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          window.dispatchEvent(new Event('agent-pi-open-files'))
        },
      }, Icon('folder', 16))
    }

    function HarvestOutputs(props) {
      const cwd = readWorkspaceCwd(props)
      const paths = props.matched || []
      React.useEffect(() => {
        if (!cwd || !paths.length) return
        api('/api/agent-pi/files/harvest', cwd, {
          method: 'POST',
          body: JSON.stringify({ paths: paths }),
        }).then((body) => {
          if (body && body.published) window.dispatchEvent(new Event('agent-pi-files-changed'))
        }).catch(() => {})
      }, [cwd, paths.join('|')])
      return null
    }

    function LanguageToggle(props) {
      const lang = useApLang()
      const ref = usePlaced('ap-mount-lang')
      return h('div', {
        ref,
        className: 'ap-lang-host' + (props && props.wide ? '' : ' rail'),
        'data-ap-place': 'ap-mount-lang',
      }, props && props.wide ? h('select', {
        className: 'ap-lang',
        value: lang,
        title: tAp('lang.title'),
        'aria-label': tAp('lang.title'),
        onClick: (event) => { event.stopPropagation() },
        onChange: (event) => {
          const next = localeIdOf(event.target.value)
          if (runtime.locale && typeof runtime.locale.setLocale === 'function') {
            try {
              runtime.locale.setLocale(next)
              setApLang(next)
            } catch {
              showToast(tAp('lang.switchFailed'))
            }
          } else {
            setApLang(next)
          }
        },
      }, AP_LANGUAGE_DEFINITIONS.map((language) => h('option', {
        key: language.id,
        value: language.id,
      }, language.label))) : null)
    }

    function uniqueIds(ids) {
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

    function visibleArchivedSessionIds(archivedIds, forgottenIds) {
      const forgotten = new Set(uniqueIds(forgottenIds))
      return uniqueIds(archivedIds).filter((id) => !forgotten.has(id))
    }

    function archiveSessionRows(input) {
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
          workspaceTitle: workspace ? workspace.title : tAp('archive.ungrouped'),
        }
      }).sort((left, right) => (right.updatedAt - left.updatedAt) || left.title.localeCompare(right.title, 'zh'))
    }

    function groupArchiveRows(rows) {
      const groups = []
      const index = new Map()
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String((row && row.workspaceId) || '')
        if (!index.has(key)) {
          const group = { workspaceId: key, title: (row && row.workspaceTitle) || tAp('archive.ungrouped'), sessions: [] }
          index.set(key, group)
          groups.push(group)
        }
        index.get(key).sessions.push(row)
      }
      return groups
    }

    function workspaceActionTitle(label) {
      const text = String(label || '').trim()
      const zh = text.match(/^工作区[“"](.+)[”"]的操作$/)
      if (zh) return zh[1]
      const en = text.match(/^Workspace actions for (.+)$/)
      if (en) return en[1]
      return ''
    }

    function resolveWorkspaceByTitle(items, title, index) {
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

    function archivedWorkspaceGroups(input) {
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

    function readWorkspaceListSnap() {
      const list = runtime.workspaces && runtime.workspaces.list
      if (list && typeof list.getSnapshot === 'function') return list.getSnapshot()
      return { items: [], archivedSessionIds: [] }
    }

    function readSessionListSnap() {
      const list = runtime.sessions && runtime.sessions.list
      if (list && typeof list.getSnapshot === 'function') return list.getSnapshot()
      return { byId: {}, current: undefined }
    }

    function archiveSessionById(sessionId) {
      const workspaces = runtime.workspaces
      if (!workspaces || typeof workspaces.archiveSession !== 'function') {
        return Promise.reject(new Error('会话服务还没就绪'))
      }
      return Promise.resolve(workspaces.archiveSession(sessionId))
    }

    function forgetSessionById(sessionId) {
      return api('/api/agent-pi/archive', '', {
        method: 'POST',
        body: JSON.stringify({ action: 'forget_session', sessionId }),
      })
    }

    let archiveStoreSnap = { forgottenSessionIds: [], archivedWorkspaceIds: [] }
    let lastWorkspaceMenuButton = null

    function rememberArchiveStore(body) {
      const next = {
        forgottenSessionIds: uniqueIds(body && body.forgottenSessionIds),
        archivedWorkspaceIds: uniqueIds(body && body.archivedWorkspaceIds),
      }
      const same = next.forgottenSessionIds.join('\0') === archiveStoreSnap.forgottenSessionIds.join('\0')
        && next.archivedWorkspaceIds.join('\0') === archiveStoreSnap.archivedWorkspaceIds.join('\0')
      archiveStoreSnap = next
      hideArchivedWorkspaceGroups()
      if (!same) window.dispatchEvent(new Event('agent-pi-archive-changed'))
      return archiveStoreSnap
    }

    function loadArchiveStore() {
      return api('/api/agent-pi/archive', '', { method: 'GET' })
        .then((body) => rememberArchiveStore(body))
        .catch(() => archiveStoreSnap)
    }

    function openArchivePage() {
      try { sessionStorage.setItem('ap-wb-module', 'archive') } catch {}
      window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'archive' }))
      setWorkbenchOpen(true)
    }

    function workspaceActionButtons() {
      return Array.from(document.querySelectorAll('button[aria-label]')).filter((btn) => (
        workspaceActionTitle(btn.getAttribute('aria-label'))
      ))
    }

    function resolveWorkspaceFromButton(button) {
      if (!button) return null
      const title = workspaceActionTitle(button.getAttribute('aria-label'))
      if (!title) return null
      const sameTitle = workspaceActionButtons().filter((btn) => (
        workspaceActionTitle(btn.getAttribute('aria-label')) === title
      ))
      return resolveWorkspaceByTitle(readWorkspaceListSnap().items, title, sameTitle.indexOf(button))
    }

    function hideArchivedWorkspaceGroups() {
      if (typeof document === 'undefined') return
      document.querySelectorAll('[data-ap-archived-workspace]').forEach((el) => {
        el.removeAttribute('data-ap-archived-workspace')
      })
      const archived = new Set(uniqueIds(archiveStoreSnap.archivedWorkspaceIds))
      if (!archived.size) return
      workspaceActionButtons().forEach((button) => {
        const workspace = resolveWorkspaceFromButton(button)
        if (!workspace || !archived.has(workspace.workspaceId)) return
        const row = button.closest('[role="treeitem"]')
        const section = row && row.parentElement
        if (!section) return
        section.setAttribute('data-ap-archived-workspace', workspace.workspaceId)
      })
    }

    function injectWorkspaceArchiveMenu(root) {
      const scope = root && root.querySelectorAll ? root : document
      const menus = []
      if (scope.matches && scope.matches('[role="menu"]')) menus.push(scope)
      if (scope.querySelectorAll) scope.querySelectorAll('[role="menu"]').forEach((menu) => menus.push(menu))
      menus.forEach((menu) => {
        if (menu.querySelector('[data-ap-archive-workspace]')) return
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
        const del = items.find((el) => {
          const text = (el.textContent || '').trim()
          return text === '删除工作区' || text === 'Delete workspace'
        })
        const rename = items.find((el) => {
          const text = (el.textContent || '').trim()
          return text === '重命名' || text === 'Rename'
        })
        if (!del || !rename || !del.parentElement || !rename.parentElement || !del.parentElement.parentElement) return
        const wrap = rename.parentElement.cloneNode(true)
        const btn = wrap.querySelector('[role="menuitem"]')
        if (!btn) return
        btn.setAttribute('data-ap-archive-workspace', '1')
        const spans = btn.querySelectorAll('span')
        const textSpan = spans[spans.length - 1]
        if (textSpan) textSpan.textContent = tAp('archive.workspace')
        else btn.textContent = tAp('archive.workspace')
        btn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const trigger = lastWorkspaceMenuButton
            || document.querySelector('button[aria-expanded="true"][aria-label]')
          archiveWorkspaceFromSidebar(resolveWorkspaceFromButton(trigger))
        })
        del.parentElement.parentElement.insertBefore(wrap, del.parentElement)
      })
    }

    function archiveWorkspaceFromSidebar(workspace) {
      if (!workspace || !workspace.workspaceId) {
        showToast(tAp('archive.workspaceFailed'))
        return
      }
      if (!window.confirm(tAp('archive.workspaceConfirm'))) return
      window.__apViewingArchived = ''
      Promise.all(uniqueIds(workspace.sessionIds).map((id) => archiveSessionById(id).catch(() => {})))
        .then(() => api('/api/agent-pi/archive', '', {
          method: 'POST',
          body: JSON.stringify({ action: 'mark_workspace', workspaceId: workspace.workspaceId }),
        }))
        .then((body) => {
          rememberArchiveStore(body)
          openArchivePage()
        })
        .catch((err) => showToast(tAp('archive.workspaceFailed') + '：' + String(err && err.message || err)))
    }

    function watchArchivedWorkspaces() {
      loadArchiveStore()
      const list = runtime.workspaces && runtime.workspaces.list
      if (list && typeof list.subscribe === 'function' && !list.__apArchiveHide) {
        list.__apArchiveHide = true
        list.subscribe(() => hideArchivedWorkspaceGroups())
      }
    }

    function guardArchivedSessionView(sessions, workspaces) {
      const sessionApi = sessions || runtime.sessions
      if (sessionApi && !sessionApi.__apArchiveGuard) {
        const origClear = typeof sessionApi.clear === 'function' ? sessionApi.clear.bind(sessionApi) : null
        const origOpen = typeof sessionApi.open === 'function' ? sessionApi.open.bind(sessionApi) : null
        if (origClear) {
          sessionApi.clear = function () {
            const snap = sessionApi.list && typeof sessionApi.list.getSnapshot === 'function'
              ? sessionApi.list.getSnapshot()
              : null
            const current = snap && snap.current
            if (current && window.__apViewingArchived === current) return
            window.__apViewingArchived = ''
            return origClear()
          }
        }
        if (origOpen) {
          sessionApi.open = function (sessionId) {
            if (window.__apViewingArchived && window.__apViewingArchived !== sessionId) {
              window.__apViewingArchived = ''
            }
            return origOpen(sessionId)
          }
        }
        sessionApi.__apArchiveGuard = true
      }
      const workspaceApi = workspaces || runtime.workspaces
      if (workspaceApi && typeof workspaceApi.startSession === 'function' && !workspaceApi.__apArchiveGuard) {
        const origStart = workspaceApi.startSession.bind(workspaceApi)
        workspaceApi.startSession = function () {
          window.__apViewingArchived = ''
          return origStart.apply(this, arguments)
        }
        workspaceApi.__apArchiveGuard = true
      }
    }

    function openArchivedSession(sessionId) {
      if (!sessionId || !runtime.sessions || typeof runtime.sessions.open !== 'function') {
        showToast('会话服务还没就绪')
        return
      }
      window.__apViewingArchived = sessionId
      setWorkbenchOpen(false)
      runtime.sessions.open(sessionId)
    }

    function ArchiveSession(props) {
      useApLang()
      const [busy, setBusy] = React.useState(false)
      const sessionId = props.sessionId || resolveSessionId(props)
      if (!sessionId) return null
      return h('button', {
        type: 'button',
        className: 'ap-header-tool',
        title: tAp('session.archiveTitle'),
        'aria-label': tAp('session.archive'),
        disabled: busy,
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (busy) return
          window.__apViewingArchived = ''
          setBusy(true)
          archiveSessionById(sessionId)
            .catch((err) => showToast(tAp('session.archiveFailed') + '：' + String(err && err.message || err)))
            .finally(() => setBusy(false))
        },
      }, Icon('archive', 16))
    }

    function ArchivePanel(props) {
      useApLang()
      const [forgotten, setForgotten] = React.useState(() => uniqueIds(archiveStoreSnap.forgottenSessionIds))
      const [archivedWorkspaceIds, setArchivedWorkspaceIds] = React.useState(() => uniqueIds(archiveStoreSnap.archivedWorkspaceIds))
      const [tick, setTick] = React.useState(0)
      const [busy, setBusy] = React.useState('')
      React.useEffect(() => {
        api('/api/agent-pi/archive', '', { method: 'GET' })
          .then((body) => {
            rememberArchiveStore(body)
            setForgotten(uniqueIds(body && body.forgottenSessionIds))
            setArchivedWorkspaceIds(uniqueIds(body && body.archivedWorkspaceIds))
          })
          .catch(() => {})
      }, [tick])
      React.useEffect(() => {
        const refresh = () => setTick((value) => value + 1)
        const unsubs = []
        if (runtime.workspaces && runtime.workspaces.list && typeof runtime.workspaces.list.subscribe === 'function') {
          unsubs.push(runtime.workspaces.list.subscribe(refresh))
        }
        if (runtime.sessions && runtime.sessions.list && typeof runtime.sessions.list.subscribe === 'function') {
          unsubs.push(runtime.sessions.list.subscribe(refresh))
        }
        window.addEventListener('agent-pi-archive-changed', refresh)
        return () => {
          unsubs.forEach((fn) => { try { fn() } catch {} })
          window.removeEventListener('agent-pi-archive-changed', refresh)
        }
      }, [])
      const workspaceSnap = readWorkspaceListSnap()
      const sessionSnap = readSessionListSnap()
      const groups = archivedWorkspaceGroups({
        archivedWorkspaceIds,
        archivedSessionIds: workspaceSnap.archivedSessionIds,
        forgottenSessionIds: forgotten,
        sessionsById: sessionSnap.byId,
        workspaces: workspaceSnap.items,
      })
      const deleteArchived = (sessionId) => {
        if (!window.confirm(tAp('session.deleteConfirm'))) return
        setBusy('del:' + sessionId)
        archiveSessionById(sessionId)
          .catch(() => {})
          .then(() => forgetSessionById(sessionId))
          .then((body) => {
            rememberArchiveStore(body)
            if (window.__apViewingArchived === sessionId) {
              window.__apViewingArchived = ''
              if (runtime.sessions && typeof runtime.sessions.clear === 'function') runtime.sessions.clear()
            }
            setTick((value) => value + 1)
          })
          .catch((err) => showToast(tAp('session.deleteFailed') + '：' + String(err && err.message || err)))
          .finally(() => setBusy(''))
      }
      const deleteWorkspace = (workspace) => {
        if (!workspace || !workspace.workspaceId) return
        if (!window.confirm(tAp('archive.deleteWorkspaceConfirm'))) return
        if (!runtime.workspaces || typeof runtime.workspaces.delete !== 'function') {
          showToast('工作区服务还没就绪')
          return
        }
        setBusy('wsd:' + workspace.workspaceId)
        Promise.resolve(runtime.workspaces.delete(workspace.workspaceId))
          .then(() => api('/api/agent-pi/archive', '', {
            method: 'POST',
            body: JSON.stringify({ action: 'forget_workspace', workspaceId: workspace.workspaceId }),
          }))
          .then((body) => {
            rememberArchiveStore(body)
            setTick((value) => value + 1)
          })
          .catch((err) => showToast(String(err && err.message || err)))
          .finally(() => setBusy(''))
      }
      return h('div', { className: 'ap-main' },
        h('section', { className: 'ap-sec' },
          h('h2', null, tAp('archive.title')),
          h('p', { className: 'ap-arch-lead' }, tAp('archive.lead')),
          groups.length === 0
            ? h('p', { className: 'ap-sub' }, tAp('archive.empty'))
            : groups.map((group) => h('div', {
              key: (group.kind || 'group') + ':' + (group.workspaceId || 'ungrouped'),
              className: 'ap-arch-group',
            },
              h('div', { className: 'ap-arch-group-hd' },
                h('h3', null, group.title + ' · ' + group.sessions.length + (group.kind === 'sessions' ? ' · ' + tAp('archive.workspaceLive') : '')),
                group.kind === 'workspace'
                  ? h('button', {
                    type: 'button',
                    className: 'ap-btn',
                    disabled: !!busy,
                    onClick: () => deleteWorkspace(group),
                  }, tAp('archive.deleteWorkspace'))
                  : null,
              ),
              group.sessions.length === 0
                ? h('p', { className: 'ap-arch-empty' }, tAp('archive.workspaceEmpty'))
                : group.sessions.map((row) => h('div', { key: row.sessionId, className: 'ap-arch-row' },
                  h('div', { className: 'grow' },
                    h('strong', null, row.title),
                    h('div', { className: 'ap-sub' }, row.sessionId),
                  ),
                  h('span', { className: 'ap-arch-actions' },
                    h('button', {
                      type: 'button',
                      className: 'ap-btn primary',
                      disabled: !!busy,
                      onClick: () => {
                        if (props.onClose) props.onClose()
                        openArchivedSession(row.sessionId)
                      },
                    }, tAp('archive.open')),
                    h('button', {
                      type: 'button',
                      className: 'ap-btn',
                      disabled: !!busy,
                      onClick: () => deleteArchived(row.sessionId),
                    }, tAp('archive.delete')),
                  ),
                )),
            )),
        ),
      )
    }

    function paintHeroLogo(root) {
      const scope = root && root.querySelectorAll ? root : document
      const nodes = new Set()
      scope.querySelectorAll('[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"])').forEach((el) => nodes.add(el))
      scope.querySelectorAll('[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"])').forEach((el) => nodes.add(el))
      nodes.forEach((el) => {
        let img = el.querySelector(':scope > img.ap-hero-logo')
        if (!img) {
          img = document.createElement('img')
          img.className = 'ap-hero-logo'
          img.alt = 'Agent Pi DSH'
          el.insertBefore(img, el.firstChild)
        }
        if (img.getAttribute('src') !== BRAND_LOGO) img.src = BRAND_LOGO
      })
    }

    const BRAND_LOGO = '/api/agent-pi/brand/logo.png?v=8'
    const BRAND_FAVICON = '/api/agent-pi/brand/favicon.png?v=8'
    const COMPANY_LOGO = '/api/agent-pi/brand/company.png?v=5'
    const PRODUCT_NAME = 'Agent Pi DSH'

    let placingSidebar = false
    function sidebarParts() {
      const slot = document.querySelector('[data-slot="sidebar"]')
      const root = slot && slot.firstElementChild
      if (!root) return null
      let logoRow = null
      let newSession = null
      let region = null
      let foot = null
      for (let i = 0; i < root.children.length; i++) {
        const el = root.children[i]
        if (el.getAttribute && el.getAttribute('data-ap-mount')) continue
        if (el.querySelector && el.querySelector('[data-slot="sidebar.workspaces"]')) { region = el; continue }
        if (el.querySelector && el.querySelector('[data-slot="sidebar.settings"]')) { foot = el; continue }
        if (el.tagName === 'BUTTON') { newSession = el; continue }
        if (!logoRow) logoRow = el
      }
      return { root, logoRow, newSession, region, foot }
    }

    function ensureMount(id) {
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('div')
        el.id = id
        el.className = 'ap-mount'
        el.setAttribute('data-ap-mount', id)
      }
      return el
    }

    function fillPiMount(mount) {
      if (!mount) return
      let wrap = mount.querySelector('.ap-pi')
      if (!wrap) {
        wrap = document.createElement('div')
        wrap.className = 'ap-pi'
        wrap.setAttribute('aria-label', 'Agent Pi DSH')
        const img = document.createElement('img')
        img.src = BRAND_LOGO
        img.alt = 'Agent Pi DSH'
        img.draggable = false
        wrap.appendChild(img)
        mount.appendChild(wrap)
      }
      wrap.classList.toggle('rail', !!document.querySelector('[data-sidebar-collapsed]'))
    }

    function syncSidebarLayout() {
      if (placingSidebar || typeof document === 'undefined') return
      const parts = sidebarParts()
      if (!parts || !parts.root || !parts.logoRow || !parts.newSession) return
      placingSidebar = true
      try {
        const company = ensureMount('ap-mount-company')
        const lang = ensureMount('ap-mount-lang')
        lang.classList.add('ap-mount-lang')
        const wb = ensureMount('ap-mount-wb')
        const kb = ensureMount('ap-mount-kb')
        const archive = ensureMount('ap-mount-archive')
        const pi = ensureMount('ap-mount-pi')
        const staleSessions = document.getElementById('ap-mount-sessions')
        if (staleSessions) staleSessions.remove()
        const logoToggle = parts.logoRow.lastElementChild
        if (lang.parentElement !== parts.logoRow || lang.nextElementSibling !== logoToggle) {
          parts.logoRow.insertBefore(lang, logoToggle || null)
        }
        const seq = [parts.logoRow, company, wb, kb, archive, parts.newSession, parts.region, parts.foot, pi].filter(Boolean)
        for (let i = 0; i < seq.length; i++) {
          if (parts.root.children[i] !== seq[i]) parts.root.insertBefore(seq[i], parts.root.children[i] || null)
        }
        ;['ap-mount-company', 'ap-mount-lang', 'ap-mount-wb', 'ap-mount-kb', 'ap-mount-archive'].forEach((id) => {
          const mount = document.getElementById(id)
          const node = document.querySelector('[data-ap-place="' + id + '"]')
          if (mount && node && node.parentElement !== mount) mount.appendChild(node)
        })
        fillPiMount(pi)
      } finally {
        placingSidebar = false
      }
    }

    function usePlaced(mountId) {
      const ref = React.useRef(null)
      React.useLayoutEffect(() => {
        const node = ref.current
        if (node) node.setAttribute('data-ap-place', mountId)
        syncSidebarLayout()
      })
      return ref
    }

    function KnowledgeBaseNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [kbOn, setKbOn] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') === 'kb' } catch { return false }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setKbOn(sessionStorage.getItem('ap-wb-module') === 'kb') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const ref = usePlaced('ap-mount-kb')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-kb' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (open && kbOn ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('nav.kbTitle'),
          'aria-pressed': open && kbOn ? 'true' : 'false',
          onClick: () => {
            try { sessionStorage.setItem('ap-wb-module', 'kb') } catch {}
            setKbOn(true)
            window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'kb' }))
            setWorkbenchOpen(true)
          },
        }, Icon('book', 16), props.wide ? h('span', null, tAp('nav.kb')) : null),
      )
    }

    function WorkbenchNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [page, setPage] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') || 'tender' } catch { return 'tender' }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setPage(sessionStorage.getItem('ap-wb-module') || 'tender') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const on = open && page !== 'kb' && page !== 'archive' && page !== 'modules'
      const ref = usePlaced('ap-mount-wb')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-wb' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (on ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('workbench.title'),
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => {
            try { sessionStorage.setItem('ap-wb-module', 'tender') } catch {}
            window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'tender' }))
            setWorkbenchOpen(true)
          },
        }, Icon('layout', 16), props.wide ? h('span', null, tAp('workbench.title')) : null),
      )
    }

    function ArchiveNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [on, setOn] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') === 'archive' } catch { return false }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setOn(sessionStorage.getItem('ap-wb-module') === 'archive') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const ref = usePlaced('ap-mount-archive')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-archive' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (open && on ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('archive.lead'),
          'aria-pressed': open && on ? 'true' : 'false',
          onClick: () => {
            setOn(true)
            openArchivePage()
          },
        }, Icon('archive', 16), props.wide ? h('span', null, tAp('archive.title')) : null),
      )
    }

    function WorkbenchOverlay(props) {
      const open = useWorkbenchOpen()
      const left = useSidebarInset()
      if (!open) return h('span', { style: { pointerEvents: 'none' } })
      return h('div', { className: 'ap-wb-page', style: { left: left + 'px' } },
        h(Workbench, Object.assign({}, props, { onClose: () => setWorkbenchOpen(false) })),
      )
    }

    const COMPANY_MARK = '/api/agent-pi/brand/company-mark.png?v=5'

    function rewriteBrandText(value) {
      return String(value || PRODUCT_NAME)
        .replace(/DeepSeek Harness/g, PRODUCT_NAME)
        .replace(/DSH Local Build/g, PRODUCT_NAME)
        .replace(/Agent π/g, PRODUCT_NAME)
    }

    function installTitleAndFavicon() {
      try {
        const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title')
        if (desc && desc.set && desc.get && !document.__apTitleGuard) {
          document.__apTitleGuard = true
          Object.defineProperty(document, 'title', {
            configurable: true,
            enumerable: true,
            get() { return desc.get.call(document) },
            set(v) { desc.set.call(document, rewriteBrandText(v)) },
          })
        }
      } catch {}
      document.title = rewriteBrandText(document.title || PRODUCT_NAME)
      document.querySelectorAll('link[rel*="icon"]').forEach((el) => {
        if (el.getAttribute('href') !== BRAND_FAVICON) el.remove()
      })
      if (!document.querySelector(`link[rel="icon"][href="${BRAND_FAVICON}"]`)) {
        const link = document.createElement('link')
        link.rel = 'icon'
        link.type = 'image/svg+xml'
        link.href = BRAND_FAVICON
        document.head.appendChild(link)
      }
    }

    function scrubDeepSeekLabels(root) {
      if (!root || root.nodeType !== 1) return
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      nodes.forEach((node) => {
        if (node.nodeValue && /DeepSeek Harness|DSH Local Build/.test(node.nodeValue)) {
          node.nodeValue = rewriteBrandText(node.nodeValue)
        }
      })
    }

    function syncSplashState() {
      const hero = document.querySelector('[data-phase="hero"]')
      const ta = hero && hero.querySelector('textarea')
      const waiting = !ta || /选择一个工作区开始|Choose a workspace to start/.test(ta.placeholder || '')
      document.documentElement.classList.toggle('ap-waiting-workspace', !!(hero && waiting))
    }

    function shortPluginName(moduleName) {
      const raw = String(moduleName || '')
      const unscoped = raw.startsWith('@') ? raw.slice(raw.indexOf('/') + 1) : raw
      return unscoped
        .replace(/^cordis:/, '')
        .replace(/^cordis-plugin-/, '')
        .replace(/^dsh-(?:host-|client-)?/, '') || raw
    }

    function hideVisionDupNode(node, kind) {
      if (!node || node.getAttribute('data-ap-hidden-vision-dup')) return
      node.setAttribute('data-ap-hidden-vision-dup', kind)
      node.setAttribute('hidden', '')
      node.setAttribute('aria-hidden', 'true')
      node.style.display = 'none'
    }

    function isHiddenVisionModelsAlias(text) {
      const sample = String(text || '').replace(/\s+/g, ' ')
      return /视觉路由\s*[（(]自动识图[)）]/.test(sample)
        || /Vision Router \(auto image understanding\)/i.test(sample)
        || /DeepSeek \+ 自动识图/.test(sample)
        || /DeepSeek \+ Auto Vision/i.test(sample)
    }

    function isRetiredVisionNavLabel(text) {
      const sample = String(text || '').replace(/\s+/g, ' ').trim()
      return /^Vision Router\b/i.test(sample)
        || /^视觉路由/.test(sample)
        || /^vision-router$/i.test(sample)
    }

    function hideRetiredVisionSettingsNav(scope) {
      const root = scope && scope.querySelectorAll ? scope : document
      const dialogs = root.querySelectorAll('[role="dialog"]')
      const hosts = dialogs.length ? dialogs : [root]
      for (let d = 0; d < hosts.length; d++) {
        const host = hosts[d]
        if (!host || !host.querySelectorAll) continue
        const buttons = host.querySelectorAll('nav button')
        let hiddenActive = false
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i]
          if (!isRetiredVisionNavLabel(btn.textContent)) continue
          hiddenActive = hiddenActive
            || btn.getAttribute('aria-current') === 'true'
            || /\bactive\b/i.test(String(btn.className || ''))
          hideVisionDupNode(btn, 'nav')
        }
        if (!hiddenActive) continue
        for (let i = 0; i < buttons.length; i++) {
          const other = buttons[i]
          if (other.getAttribute('data-ap-hidden-vision-dup')) continue
          other.click()
          break
        }
      }
    }

    // Official DeepSeek key card stays. Hide leftover Vision Router aliases
    // and the retired plugin's settings stub, including its leftover nav row.
    function hideRedundantVisionSettings(root) {
      hideRetiredVisionSettingsNav(root)
      const scope = root && root.querySelectorAll ? root : document
      const cards = scope.querySelectorAll('.vr-card, [data-plugin-entry], li')
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const text = card.textContent || ''
        const entry = String(card.getAttribute('data-plugin-entry') || '')
        const leftoverPlugin = /dsh-vision-router/i.test(entry)
          || /Vision Router 设置已迁移|Vision Router settings moved/.test(text)
          || (/Vision Router/i.test(text) && /vision_describe|vision_ocr|stealth/i.test(text))
        if (!leftoverPlugin) continue
        hideVisionDupNode((card.closest && card.closest('li')) || card, 'plugin')
      }
      const markers = document.querySelectorAll('p, h2')
      for (let i = 0; i < markers.length; i++) {
        const title = (markers[i].textContent || '').trim()
        if (title !== '填入各提供方的 API 密钥即可使用其模型'
          && title !== 'Enter your API keys to use models from the following providers.') continue
        const section = markers[i].parentElement
        if (!section) continue
        const rows = section.querySelectorAll('li')
        for (let j = 0; j < rows.length; j++) {
          if (isHiddenVisionModelsAlias(rows[j].textContent)) hideVisionDupNode(rows[j], 'models')
        }
        const options = section.querySelectorAll('option')
        for (let j = 0; j < options.length; j++) {
          const opt = options[j]
          const value = String(opt.value || '')
          if (value === 'deepseek-vision' || value === 'vision-router' || isHiddenVisionModelsAlias(opt.textContent)) {
            opt.hidden = true
            opt.disabled = true
            opt.setAttribute('data-ap-hidden-vision-dup', 'models')
          }
        }
      }
    }

    function paintPluginNames(root) {
      const scope = root && root.querySelectorAll ? root : document
      scope.querySelectorAll('[data-plugin-entry]').forEach((card) => {
        const strong = card.querySelector('strong')
        if (!strong) return
        const title = strong.getAttribute('title') || card.getAttribute('data-plugin-entry') || ''
        if (!String(strong.textContent || '').trim() && title) {
          strong.textContent = shortPluginName(title)
        }
        strong.style.setProperty('color', '#111827', 'important')
        strong.style.setProperty('-webkit-text-fill-color', '#111827', 'important')
        strong.style.setProperty('font-size', '14px', 'important')
        strong.style.setProperty('opacity', '1', 'important')
        strong.style.setProperty('visibility', 'visible', 'important')
        strong.style.setProperty('display', 'block', 'important')
        strong.style.setProperty('flex', '1 1 auto', 'important')
        strong.style.setProperty('min-width', '48px', 'important')
      })
    }

    function installSimpleNav() {
      document.documentElement.classList.add('ap-simple-nav')
      document.documentElement.classList.remove('ap-split-nav', 'ap-split-collapsed')
      syncSidebarLayout()
    }

    if (typeof document !== 'undefined') {
      document.querySelectorAll('.ap-hero-rebrand, .ap-brand-top, .ap-brand-mark').forEach((el) => el.remove())
      document.documentElement.classList.toggle('ap-wb-open', readWorkbenchOpen())
      installTitleAndFavicon()
      installSimpleNav()
      syncSplashState()
      paintPluginNames(document)
      paintHeroLogo(document)
      hideRedundantVisionSettings(document)
      const observer = new MutationObserver((records) => {
        let touchedShell = false
        for (const rec of records) {
          if (rec.type === 'characterData' && rec.target.nodeValue && /DeepSeek Harness|DSH Local Build/.test(rec.target.nodeValue)) {
            if (!isInsideApDoc(rec.target)) {
              rec.target.nodeValue = rewriteBrandText(rec.target.nodeValue)
              touchedShell = true
            }
          }
          if (rec.addedNodes && rec.addedNodes.length) {
            rec.addedNodes.forEach((node) => {
              if (node.nodeType !== 1 || isInsideApDoc(node)) return
              touchedShell = true
              scrubDeepSeekLabels(node)
              paintPluginNames(node)
              paintHeroLogo(node)
              hideRedundantVisionSettings(node)
              injectWorkspaceArchiveMenu(node)
            })
          }
        }
        hideArchivedWorkspaceGroups()
        if (!touchedShell) return
        syncSplashState()
        syncSidebarLayout()
        paintPluginNames(document)
        paintHeroLogo(document)
        hideRedundantVisionSettings(document)
        injectWorkspaceArchiveMenu(document)
      })
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      document.addEventListener('pointerdown', (event) => {
        const btn = event.target && event.target.closest && event.target.closest('button[aria-label]')
        if (!btn || !workspaceActionTitle(btn.getAttribute('aria-label'))) return
        lastWorkspaceMenuButton = btn
      }, true)
      loadArchiveStore()
      hideArchivedWorkspaceGroups()
      injectWorkspaceArchiveMenu(document)
    }

    function CodexSettingsSection() {
      const desktop = window.agentPiDesktop
      const lang = useApLang()
      const zh = lang === 'zh'
      const [auth, setAuth] = React.useState({ available: true, state: 'checking' })
      const [busy, setBusy] = React.useState(false)
      const compactionBridgeAvailable = !!desktop
        && typeof desktop.compactionFallbackStatus === 'function'
        && typeof desktop.setCompactionFallback === 'function'
      const [compactionEnabled, setCompactionEnabled] = React.useState(true)
      const lastConfirmedCompaction = React.useRef(true)
      const [compactionBusy, setCompactionBusy] = React.useState(compactionBridgeAvailable)
      const [compactionMessage, setCompactionMessage] = React.useState('')

      const refresh = React.useCallback(async () => {
        if (!desktop || typeof desktop.codexAuthStatus !== 'function') {
          setAuth({ available: false, state: 'unavailable' })
          return
        }
        try {
          setAuth(await desktop.codexAuthStatus())
        } catch {
          setAuth({ available: false, state: 'unavailable' })
        }
      }, [desktop])

      React.useEffect(() => { void refresh() }, [refresh])
      React.useEffect(() => {
        if (auth.state !== 'pending') return undefined
        const timer = setInterval(() => { void refresh() }, 2000)
        return () => clearInterval(timer)
      }, [auth.state, refresh])

      const loadCompaction = React.useCallback(async () => {
        if (!compactionBridgeAvailable) {
          setCompactionBusy(false)
          return
        }
        setCompactionBusy(true)
        setCompactionMessage('')
        try {
          const result = await desktop.compactionFallbackStatus()
          if (!result || typeof result.enabled !== 'boolean') throw new Error('Invalid compaction preference')
          lastConfirmedCompaction.current = result.enabled
          setCompactionEnabled(result.enabled)
        } catch {
          setCompactionEnabled(lastConfirmedCompaction.current)
          setCompactionMessage(zh ? '无法读取自动压缩设置，请重试。' : 'Could not load the compaction setting. Please retry.')
        } finally {
          setCompactionBusy(false)
        }
      }, [compactionBridgeAvailable, desktop, zh])

      React.useEffect(() => { void loadCompaction() }, [loadCompaction])

      const invoke = async (method) => {
        setBusy(true)
        try {
          setAuth(await desktop[method]())
        } catch {
          setAuth({ available: true, state: 'error' })
        } finally {
          setBusy(false)
        }
      }

      const saveCompaction = async () => {
        if (!compactionBridgeAvailable || compactionBusy) return
        const nextEnabled = !compactionEnabled
        setCompactionBusy(true)
        setCompactionEnabled(nextEnabled)
        setCompactionMessage('')
        try {
          const result = await desktop.setCompactionFallback(nextEnabled)
          if (!result || typeof result.enabled !== 'boolean' || typeof result.restartRequired !== 'boolean') {
            throw new Error('Invalid compaction preference')
          }
          lastConfirmedCompaction.current = result.enabled
          setCompactionEnabled(result.enabled)
          setCompactionMessage(result.restartRequired ? (zh ? '重启应用后生效' : 'Restart the app to apply') : '')
        } catch {
          setCompactionEnabled(lastConfirmedCompaction.current)
          setCompactionMessage(zh ? '保存失败，请重试。' : 'Could not save the setting. Please retry.')
        } finally {
          setCompactionBusy(false)
        }
      }

      const labels = zh
        ? {
            checking: '正在检查',
            'logged-in': '已通过 ChatGPT 登录',
            pending: '等待浏览器授权',
            'logged-out': '未登录',
            error: '登录未完成',
            unavailable: 'Codex 运行时不可用',
          }
        : {
            checking: 'Checking',
            'logged-in': 'Signed in with ChatGPT',
            pending: 'Waiting for browser authorization',
            'logged-out': 'Not signed in',
            error: 'Sign-in did not complete',
            unavailable: 'Codex runtime unavailable',
          }
      const loggedIn = auth.state === 'logged-in'
      const pending = auth.state === 'pending'
      const statusClass = loggedIn ? 'ap-chip ok' : pending ? 'ap-chip live' : 'ap-chip warn'
      const model = loggedIn && auth.model
      const formatCapacity = (value) => Number(value).toLocaleString()
      const capacitySource = zh
        ? {
            provider: '供应商返回',
            official: '官方参数',
            estimated: '估算参数',
          }
        : {
            provider: 'Provider metadata',
            official: 'Verified catalog',
            estimated: 'Conservative estimate',
          }

      return h('section', { className: 'ap-codex-settings' },
        h('h1', null, zh ? 'Codex 智能体' : 'Codex Agent'),
        h('p', { className: 'ap-codex-lead' }, zh
          ? 'DeepSeek DSH 保持主智能体和投标流程控制权，Codex 作为独立子智能体处理明确委派的代码、审查与修复任务。'
          : 'DeepSeek DSH remains the primary agent and tender orchestrator. Codex handles self-contained coding, review, and repair delegations.'),
        h('div', { className: 'ap-codex-card' },
          h('div', { className: 'ap-codex-status' },
            h('strong', null, 'ChatGPT / Codex'),
            h('span', { className: statusClass }, labels[auth.state] || auth.state),
          ),
          h('p', { className: 'ap-sub' }, zh
            ? '使用 ChatGPT 账号在系统浏览器中授权，无需 API Key。凭据仅保存在本机 Agent Pi 专属 Codex 目录。'
            : 'Authorize with your ChatGPT account in the system browser. No API key is required; credentials stay in Agent Pi’s private local Codex directory.'),
          loggedIn && h('p', { className: 'ap-sub' }, model
            ? [
                h('strong', { key: 'id' }, model.id),
                h('br', { key: 'break' }),
                zh ? '上下文窗口：' : 'Context window: ',
                formatCapacity(model.contextWindow),
                ' · ',
                capacitySource[model.contextWindowSource],
                h('br', { key: 'output-break' }),
                zh ? '最大输出：' : 'Maximum output: ',
                formatCapacity(model.maxTokens),
                ' · ',
                capacitySource[model.maxTokensSource],
              ]
            : (zh ? '模型信息暂不可用' : 'Model information is temporarily unavailable')),
          h('div', { className: 'ap-row', style: { marginTop: 14 } },
            !loggedIn && h('button', {
              type: 'button',
              className: 'ap-btn primary',
              disabled: busy || pending || !auth.available,
              onClick: () => { void invoke('codexAuthLogin') },
            }, pending ? (zh ? '等待授权…' : 'Waiting…') : (zh ? '使用 ChatGPT 登录' : 'Sign in with ChatGPT')),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              disabled: busy,
              onClick: () => { void refresh() },
            }, zh ? '刷新状态' : 'Refresh'),
            loggedIn && h('button', {
              type: 'button',
              className: 'ap-btn warn',
              disabled: busy,
              onClick: () => {
                if (window.confirm(zh ? '确认退出 Agent Pi 的 Codex 登录？' : 'Sign out of Codex in Agent Pi?')) {
                  void invoke('codexAuthLogout')
                }
              },
            }, zh ? '退出登录' : 'Sign out'),
          ),
          h('p', { className: 'ap-codex-note' },
            zh ? '登录后，DSH 智能体可按需调用 ' : 'After sign-in, DSH agents can invoke ',
            h('code', null, 'subagent_codex'),
            zh
              ? '。Codex 不会自动继承父对话或知识库，父智能体会把所需文件路径、知识和交付目标整理成独立任务。'
              : '. Codex does not inherit parent conversation or knowledge automatically, so the parent provides a self-contained brief.',
          ),
        ),
        h('div', { className: 'ap-codex-card', style: { marginTop: 14 } },
          h('div', { className: 'ap-codex-status' },
            h('strong', null, zh ? '对话自动压缩' : 'Automatic conversation compaction'),
            h('button', {
              type: 'button',
              role: 'switch',
              className: 'ap-switch' + (compactionEnabled ? ' on' : ''),
              'aria-label': zh ? 'DeepSeek 摘要兜底' : 'DeepSeek summary fallback',
              'aria-checked': compactionEnabled ? 'true' : 'false',
              disabled: compactionBusy || !compactionBridgeAvailable,
              onClick: () => { void saveCompaction() },
            }, h('span', { className: 'ap-switch-knob' })),
          ),
          h('p', { className: 'ap-sub' }, zh
            ? '当上下文用量达到约 72% 时自动压缩，先尝试当前会话模型。启用兜底后，如果主摘要发生可兜底的失败，旧对话历史可能会发送给 deepseek-v4-flash-vision-exp；这可能产生一次 DeepSeek 调用费用，并会跨供应商处理该段历史。'
            : 'Automatic compaction starts near 72% context usage and tries the current session model first. When fallback is enabled and the primary summary has an eligible failure, older conversation history may be sent to deepseek-v4-flash-vision-exp. This may create one DeepSeek charge and processes that history across provider boundaries.'),
          !compactionBridgeAvailable && h('p', { className: 'ap-sub' }, zh
            ? '此设置仅在打包的桌面应用中可用。'
            : 'This setting is available only in the packaged desktop app.'),
          compactionMessage && h('p', { className: 'ap-sub' }, compactionMessage),
        ),
      )
    }

    function CompanyLockup(props) {
      const ref = usePlaced('ap-mount-company')
      if (!props.wide) return h('span', { ref, 'data-ap-place': 'ap-mount-company', style: { display: 'none' } })
      return h('div', { ref, className: 'ap-company', 'data-ap-place': 'ap-mount-company', 'aria-label': '中国建筑第二工程局有限公司' },
        h('img', { src: COMPANY_LOGO, alt: '中国建筑第二工程局有限公司', draggable: false }),
      )
    }

    function SidebarBrandMark(props) {
      const size = Number(props && props.size) || 24
      return h('img', {
        src: '/api/agent-pi/brand/symbol.png?v=8',
        alt: '',
        width: size,
        height: size,
        draggable: false,
        style: { width: size, height: size, objectFit: 'contain' },
      })
    }

    function SidebarBrandName() {
      return h('span', { className: 'ap-sidebar-brand-name' }, 'Agent Pi DSH')
    }

    function HeroBrandMark(props) {
      const size = Number(props && props.size) || 34
      return h('img', {
        className: (props && props.className) || 'ap-hero-logo',
        src: BRAND_LOGO,
        alt: 'Agent Pi DSH',
        width: size,
        height: size,
        draggable: false,
        style: { width: size, height: 'auto', maxHeight: 188, objectFit: 'contain' },
      })
    }

    export const name = 'tender-web'
    export const inject = [
      'slots',
      'workspaces',
      'remote',
      'remote.credentials',
      'remote.agentPresets',
      'remote.session',
    ]
    window.__apAttachItems = attachItemsToComposer
    if (!window.__apAttachFileBound) {
      window.__apAttachFileBound = true
      window.addEventListener('agent-pi-attach-file', (event) => {
        const detail = event && event.detail
        if (!detail || !detail.items) return
        const write = window.__apAttachItems
        if (typeof write === 'function') write(detail.sessionProps || composerPropsRef.current, detail.items, detail.source)
      })
    }

    export function apply(ctx) {
      runtime.workspaces = ctx.workspaces || runtime.workspaces
      runtime.remote = ctx.remote || runtime.remote
      watchArchivedWorkspaces()
      ctx.inject(['sessions'], (scope) => {
        runtime.sessions = scope.sessions
          || ctx.sessions
          || (typeof scope.get === 'function' ? scope.get('sessions') : null)
          || runtime.sessions
        guardArchivedSessionView(runtime.sessions)
        watchWorkbenchTransactionRestore()
        ensureUserRequirementWatcher(runtime.sessionId)
      })
      ctx.inject(['conversation'], (scope) => {
        runtime.conversation = scope.conversation
          || ctx.conversation
          || (typeof scope.get === 'function' ? scope.get('conversation') : null)
          || runtime.conversation
      })
      ctx.inject(['uiConversation'], (scope) => {
        runtime.uiConversation = scope.uiConversation
          || ctx.uiConversation
          || (typeof scope.get === 'function' ? scope.get('uiConversation') : null)
          || runtime.uiConversation
      })
      ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: 'workbench', order: 50, label: WORKBENCH_LABEL },
        Workbench,
      ))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: 'agent-pi-codex',
          order: 15,
          label: () => tAp('codex.title'),
        },
        CodexSettingsSection,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-workbench', order: 5, label: WORKBENCH_LABEL },
        WorkbenchOverlay,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-create', order: 20, label: '新建项目' },
        CreateOverlay,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-files', order: 10, label: '资源文件' },
        FilesRail,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'agent-pi-toast', order: 80, label: '提示' },
        ToastHost,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'agent-pi-attach-float', order: 75, label: '附件条' },
        AttachmentFloat,
      ))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'agent-pi-attachments', order: 5, label: '附件' },
        AttachmentDock,
      ))
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
        { name: 'conversation.input.left', id: 'agent-pi-composer-tools', order: 20, label: '指令润色' },
        ComposerTools,
      ))
      ctx.inject(['workspaces'], (scope) => {
        runtime.workspaces = scope.workspaces
          || ctx.workspaces
          || (typeof scope.get === 'function' ? scope.get('workspaces') : null)
          || runtime.workspaces
        guardArchivedSessionView(runtime.sessions, runtime.workspaces)
        watchArchivedWorkspaces()
      })
      ctx.inject(['locale'], (scope) => {
        runtime.locale = scope.locale || (typeof scope.get === 'function' ? scope.get('locale') : null) || runtime.locale
        if (runtime.locale && typeof runtime.locale.addLanguage === 'function' && typeof runtime.locale.getLocale === 'function') {
          const registered = new Set((runtime.locale.getLocale().locales || []).map((language) => String(language.id || '').toLowerCase()))
          for (const language of AP_LANGUAGE_DEFINITIONS) {
            if (registered.has(language.id)) continue
            try {
              runtime.locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback })
              registered.add(language.id)
            } catch {}
          }
        }
        const applyLang = () => {
          const snap = runtime.locale && typeof runtime.locale.getLocale === 'function' ? runtime.locale.getLocale() : null
          const id = snap && snap.active ? snap.active : (snap && snap.locale)
          setApLang(id)
        }
        applyLang()
        if (typeof scope.on === 'function') scope.on('locale/change', applyLang)
      })
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
        {
          name: 'conversation.chat.turnTail',
          id: 'agent-pi-harvest',
          order: 80,
          select: (owner) => {
            const data = owner && owner.turn && owner.turn.data && typeof owner.turn.data.get === 'function'
              ? owner.turn.data.get('deliverables')
              : null
            const produced = data && data.produced ? data.produced : []
            const paths = []
            const seen = new Set()
            for (let i = 0; i < produced.length; i++) {
              const row = produced[i]
              if (!row || !row.path || seen.has(row.path)) continue
              if (typeof owner.seq === 'number' && row.seq > owner.seq) continue
              seen.add(row.path)
              paths.push(row.path)
            }
            return paths.length ? paths : null
          },
        },
        HarvestOutputs,
      ))
      ctx.inject(['inputTriggers', 'sessions'], (scope) => {
        runtime.sessions = scope.sessions || (typeof scope.get === 'function' ? scope.get('sessions') : null)
        watchWorkbenchTransactionRestore()
        const inputTriggers = scope.inputTriggers || (typeof scope.get === 'function' ? scope.get('inputTriggers') : null)
        if (!inputTriggers || typeof inputTriggers.registerSource !== 'function') return
        const source = {
          trigger: '/',
          name: FILE_SOURCE,
          order: 40,
          candidates(_session, req) {
            const query = String(req && req.query || '').toLowerCase()
            return Promise.resolve(runtime.files
              .filter((file) => !query || file.name.toLowerCase().includes(query) || file.relativePath.toLowerCase().includes(query))
              .slice(0, 24)
              .map((file) => ({ name: file.name, description: file.relativePath })))
          },
          onPick({ candidate }) {
            const ref = candidate.description || candidate.name
            const file = runtime.files.find((row) => row.relativePath === ref || row.name === candidate.name) || {}
            window.dispatchEvent(new CustomEvent('agent-pi-attach-file', {
              detail: {
                items: [{
                  id: ref + ':' + Date.now(),
                  relativePath: ref,
                  path: file.path,
                  name: candidate.name,
                  kind: fileKind(candidate.name),
                }],
                source: 'mention',
              },
            }))
            return {}
          },
          codec: {
            clipboardText: (ref) => ref,
            serialize: (ref) => Promise.resolve('请读取并依据此文件：`' + ref + '`'),
          },
        }
        if (typeof scope.effect === 'function') {
          scope.effect(() => inputTriggers.registerSource(source), 'tender-web: workspace-file source')
        } else {
          inputTriggers.registerSource(source)
        }
      })
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'agent-pi-files', order: 40, label: '资源文件' },
        FilesToggle,
      ))
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'agent-pi-delete-session', order: 80, label: '归档对话' },
        ArchiveSession,
      ))
      ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register(
        { name: 'sidebar.brand.mark' },
        SidebarBrandMark,
      ))
      ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
        { name: 'sidebar.brand.name' },
        SidebarBrandName,
      ))
      ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register(
        { name: 'conversation.hero.brand.mark' },
        HeroBrandMark,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-company', order: 0, label: '中建二局' },
        CompanyLockup,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-lang', order: 1, label: 'Language' },
        LanguageToggle,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'tender-workbench-nav', order: 2, label: WORKBENCH_LABEL },
        WorkbenchNav,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-kb-nav', order: 3, label: '知识库' },
        KnowledgeBaseNav,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-archive-nav', order: 4, label: '归档' },
        ArchiveNav,
      ))
    }
