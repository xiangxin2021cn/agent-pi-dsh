import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const dsh = join(root, 'vendor', 'deepseek-harness')
const pnpm = join(dsh, 'node_modules', '.pnpm')

function requirePnpmPackage(name: string, entry = '') {
  const folder = readdirSync(pnpm).find((entry) => entry === name || entry.startsWith(name + '@'))
  if (!folder) throw new Error(`Missing ${name} under the DSH pnpm store`)
  const packagePath = join(pnpm, folder, 'node_modules', name, entry)
  return createRequire(import.meta.url)(packagePath)
}

test('generated client boots, ChatGPT login works, and the session file rail renders in a real React DOM', async () => {
  const { JSDOM } = requirePnpmPackage('jsdom')
  const React = requirePnpmPackage('react')
  const ReactDOM = requirePnpmPackage('react-dom')
  const { createRoot } = requirePnpmPackage('react-dom', 'client.js')
  const { act } = React
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
  })

  const workflow = { id: 'tender-main', module: 'tender', labelZh: '投标全流程', setupStageId: 'project-setup', stages: [{ id: 'project-setup', labelZh: '项目资料登记', hintZh: '登记资料', prompt: '', skillSlugs: [] }] }
  const requirement = {
    id: 'req-user-1', projectId: 'p1', module: 'tender', stageId: 'project-setup', sessionId: 'session-1',
    text: '只修改重大风险结论，不要重做已完成的招标文件解析。', status: 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  const workbenchSnapshot = {
    cwd: 'C:\\workspace',
    knowledge: {},
    modules: [{ id: 'tender', labelZh: '投标工作台', builtin: true, disabled: false }],
    workflows: [workflow],
    projects: [{
      project: { schemaVersion: 1, module: 'tender', projectId: 'p1', name: '测试投标', rootPath: 'C:\\workspace', workflowId: 'tender-main', inputPaths: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      workflow, stage: null, stages: {}, currentStageId: 'project-setup', evidence: null, outputs: [], restores: [],
      execution: {
        sessionId: 'session-1', runId: 'run-1', projectId: 'p1', module: 'tender', stageId: 'project-setup', revision: 2,
        status: 'working', objective: '登记并核验投标资料', currentBatch: '资料齐套检查',
        plan: [{ id: 'files', title: '核对已登记资料', status: 'in_progress' }], assignments: [], blocker: { type: 'none' },
        nextAction: '完成资料齐套后进入投标决策', contentDigest: 'digest', createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(),
      },
      userRequirements: [requirement],
      workSurface: { mode: 'shadow', defaultNavigator: false, pageIndex: { ready: 1, fallback: 0, notEligible: 1 }, coverage: { initialized: true, ready: false, missingDomains: [], unreadDomains: ['commercial-contract'], evidenceGaps: [], conclusionGaps: [], sourceTreeHashes: { volume: 'abc' } }, evidence: { claimCount: 2, surfaces: ['document', 'table'] }, telemetry: { eventCount: 3, last: null } },
      citationAudit: { schemaVersion: 1, projectId: 'p1', module: 'tender', generatedAt: new Date().toISOString(), checkedFiles: 1, totalCitations: 2, kbCitations: 0, srcCitations: 1, evidenceCitations: 1, orphans: [] },
    }],
    inspectedAt: new Date().toISOString(),
  }

  const promptTexts: string[] = []
  const fetchCalls: Array<{ url: string; action?: string; text?: string }> = []
  const sessionSnapshot = {
    sessionId: 'session-1', blank: true, running: false, queue: [],
    pendingSubmissions: [] as Array<{ requestId: string; time: number; text: string; images: unknown[] }>,
    nodes: [] as Array<{ kind: string; seq: number; content: Array<{ type: string; text: string }> }>,
    subagent: null, removed: false, openState: 'open', openError: null, hasMore: false,
    loadingOlder: false, promptError: null, lastAgentError: null, promptAttempted: false,
    awaitingFirstTurn: false,
  }
  const sessionListeners = new Set<() => void>()
  const presetSelectCalls: Array<{ sessionId: string; preset: string }> = []
  const sessionCreateCalls: Array<{ cwd?: string; agentPreset?: string }> = []
  const openedSessionIds: string[] = []
  const sessionFace = {
    getSnapshot: () => sessionSnapshot,
    subscribe: (listener: () => void) => {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    prompt: async (blocks: Array<{ type: string; text?: string }>) => {
      promptTexts.push(blocks.map((block) => block.text || '').join(''))
      sessionSnapshot.blank = false
      sessionSnapshot.promptAttempted = true
      return { ok: true }
    },
  }
  const sessionService = {
    binding: () => ({ session: sessionFace }),
    refresh: async () => {},
    open: (sessionId: string) => { openedSessionIds.push(sessionId) },
    list: {
      getSnapshot: () => ({ current: 'session-1', byId: { 'session-1': { cwd: 'C:/workspace', blank: sessionSnapshot.blank } } }),
      subscribe: () => () => {},
    },
  }

  const globals = {
    window: dom.window,
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const request = init && typeof init.body === 'string' ? JSON.parse(init.body) as { action?: string; text?: string } : {}
      fetchCalls.push({ url, action: request.action, text: request.text })
      let body: unknown = { files: [], outputFiles: [] }
      if (url.includes('/api/agent-pi/workbench')) body = {
        ...workbenchSnapshot,
        projects: workbenchSnapshot.projects.map((item) => ({
          ...item,
          userRequirements: [{ ...requirement }],
        })),
      }
      else if (url.includes('/api/agent-pi/modules')) {
        body = { modules: [
          { id: 'tender', labelZh: '投标工作台', builtin: true, disabled: false, workflow },
          { id: 'delivery', labelZh: '项目实施控制', builtin: true, disabled: false },
          { id: 'investment', labelZh: '资源投资研究', builtin: true, disabled: false },
        ] }
      } else if (url.includes('/api/agent-pi/projects/restore')) body = { restored: [], skipped: [] }
      else if (url.includes('/api/agent-pi/stage') && request.action === 'complete') {
        body = {
          draft: '【专业项目启动】请依据已登记资料完成项目对齐并继续当前阶段。',
          dispatch: { stageId: 'project-setup', key: 'project-setup|running|||' },
        }
      } else if (url.includes('/api/agent-pi/stage') && request.action === 'record_requirement') {
        body = { requirement }
      } else if (url.includes('/api/agent-pi/stage') && request.action === 'satisfy_requirement') {
        requirement.status = 'implemented'
        body = { requirement }
      } else if (url.includes('/api/agent-pi/stage') && request.action === 'accept_requirement') {
        requirement.status = 'accepted'
        body = { requirement }
      }
      return { ok: true, statusText: '', json: async () => body }
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    setInterval: () => 0,
    clearInterval: () => {},
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  dom.window.confirm = () => true
  ;(dom.window.HTMLElement.prototype as unknown as { attachEvent: () => void; detachEvent: () => void }).attachEvent = () => {}
  ;(dom.window.HTMLElement.prototype as unknown as { attachEvent: () => void; detachEvent: () => void }).detachEvent = () => {}
  const previous = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }

  let rootView: ReturnType<typeof createRoot> | undefined
  try {
    let factory: ((require: (id: string) => unknown) => Record<string, unknown>) | undefined
    ;(dom.window as typeof dom.window & { __ModuleLoader__: unknown }).__ModuleLoader__ = {
      load(definition: { factory: typeof factory }) { factory = definition.factory },
    }
    let loginCalls = 0
    ;(dom.window as typeof dom.window & { agentPiDesktop: unknown }).agentPiDesktop = {
      codexAuthStatus: async () => ({ available: true, state: 'logged-out' }),
      codexAuthLogin: async () => {
        loginCalls += 1
        return { available: true, state: 'logged-in' }
      },
      codexAuthLogout: async () => ({ available: true, state: 'logged-out' }),
      compactionFallbackStatus: async () => ({ enabled: true }),
      setCompactionFallback: async (enabled: boolean) => ({ enabled, restartRequired: false }),
    }

    const builtClient = readFileSync(join(root, 'bundles', 'tender-web', 'lib', 'client.js'), 'utf8')
    Function(builtClient)()
    assert.equal(typeof factory, 'function', 'DSH module loader did not receive the client factory')
    const client = factory!((id) => {
      if (id === 'react') return React
      if (id === 'react-dom') return ReactDOM
      throw new Error(`Unexpected client dependency: ${id}`)
    }) as { apply(ctx: unknown): void }

    const registered = new Map<string, unknown>()
    client.apply({
      inject(deps: unknown, callback: (scope: object) => void) {
        const names = Array.isArray(deps) ? deps : [deps]
        callback(names.includes('sessions') ? { sessions: sessionService } : {})
      },
      slots: {
        inject(_name: string, callback: () => void) { callback() },
        register(definition: { id?: string; name: string }, component: unknown) {
          registered.set(definition.id || definition.name, component)
        },
      },
      remote: {
        agentPresets: {
          select: async (sessionId: string, preset: string) => {
            presetSelectCalls.push({ sessionId, preset })
            return { ok: true, value: preset }
          },
        },
        session: {
          create: async (request: { cwd?: string; agentPreset?: string }) => {
            sessionCreateCalls.push(request)
            return { ok: true, value: { sessionId: 'session-create-mode', agentPreset: request.agentPreset } }
          },
        },
      },
    })

    const CodexSettings = registered.get('agent-pi-codex')
    assert.equal(typeof CodexSettings, 'function')
    const mount = dom.window.document.getElementById('root')!
    rootView = createRoot(mount)
    await act(async () => {
      rootView!.render(React.createElement(CodexSettings))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })

    assert.match(mount.textContent || '', /ChatGPT \/ Codex/)
    assert.equal(mount.querySelector('input[type="password"]'), null)
    assert.equal(mount.querySelector('[role="dialog"]'), null)
    const login = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent === '使用 ChatGPT 登录')
    assert.ok(login, 'ChatGPT login button did not render')
    await act(async () => {
      login.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })
    assert.equal(loginCalls, 1)
    assert.match(mount.textContent || '', /已通过 ChatGPT 登录/)

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    const AttachmentDock = registered.get('agent-pi-attachments')
    const CreateOverlay = registered.get('tender-create')
    assert.equal(typeof AttachmentDock, 'function')
    assert.equal(typeof CreateOverlay, 'function')
    const blankSession = {
      sessionId: 'session-1', blank: true, running: false, queue: [], pendingSubmissions: [],
    }
    const blankSessions = { current: 'session-1', byId: { 'session-1': { cwd: 'C:/workspace', blank: true } } }
    await act(async () => {
      rootView!.render(React.createElement(React.Fragment, null,
        React.createElement(AttachmentDock, {
          sessionId: 'session-1', session: blankSession, input: { draft: '' },
          useSessions: (selector: (state: typeof blankSessions) => unknown) => selector(blankSessions),
        }),
        React.createElement(CreateOverlay, {
          sessionId: 'session-1',
          useSessions: (selector: (state: typeof blankSessions) => unknown) => selector(blankSessions),
        }),
      ))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })
    assert.match(mount.textContent || '', /新建专业工作台项目/)
    assert.match(mount.textContent || '', /投标项目/)
    assert.match(mount.textContent || '', /项管项目/)
    assert.match(mount.textContent || '', /投资项目/)
    const tenderStarter = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent === '投标项目')
    assert.ok(tenderStarter)
    await act(async () => {
      tenderStarter.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })
    assert.match(mount.textContent || '', /新建.*投标.*项目/)

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    dom.window.localStorage.setItem('ap-wb-session-binding:session-1', JSON.stringify({
      sessionId: 'session-1', cwd: 'C:/workspace', module: 'tender', projectId: 'p1',
    }))
    let originalSubmitCalls = 0
    const inputActions = { submit: () => { originalSubmitCalls += 1 } }
    await act(async () => {
      rootView!.render(React.createElement(AttachmentDock, {
        sessionId: 'session-1', session: { ...blankSession, blank: false },
        input: { draft: '只修改重大风险结论，不要重做已完成的招标文件解析。' },
        inputActions,
        useSessions: (selector: (state: typeof blankSessions) => unknown) => selector(blankSessions),
      }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })
    await act(async () => {
      inputActions.submit()
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(originalSubmitCalls, 1)
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 0, 'submit wrapping must not alter the native composer lifecycle')
    await act(async () => {
      sessionSnapshot.nodes.push({
        kind: 'user', seq: 1,
        content: [{ type: 'text', text: '只修改重大风险结论，不要重做已完成的招标文件解析。' }],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 1, 'the bound session observer must record the confirmed user message once')
    assert.equal(fetchCalls.find((call) => call.action === 'record_requirement')?.text, '只修改重大风险结论，不要重做已完成的招标文件解析。')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-2', time: Date.now(), text: '新增要求：只抽查受影响的合规项。', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2)
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').at(-1)?.text, '新增要求：只抽查受影响的合规项。')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-status', time: Date.now(), text: '进度如何？', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2, 'status questions must not become blocking project requirements')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-product', time: Date.now(),
        text: '【用户要求账本 — 优先级高于默认工作台写法】\n【阶段切换 — 请在本项目主会话继续】', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2, 'product-generated stage prompts must never re-enter the user-requirement ledger')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-execution-alignment', time: Date.now(),
        text: '【执行账本对齐 — 请在本项目主会话继续】\n只处理执行态与事实态差异。', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2, 'execution-ledger alignment prompts must never become user requirements')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-closeout', time: Date.now(),
        text: '【用户验收口径已确认 — 只做硬门禁收口】\n不得恢复旧软门禁。', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2, 'product-generated acceptance closeout must never re-enter the user-requirement ledger')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-stage-closeout', time: Date.now(),
        text: '【阶段已收口 — 盘面复核】\n不要再次调用 complete_stage，必须等待用户再次点击继续推进。', images: [],
      })
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-pricing-diligence', time: Date.now(),
        text: '【补齐组价当地情报 — 请在本项目主会话继续】\n必须读取供应商资料。', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 2, 'internal closeout and pricing prompts must never self-trigger as user requirements')
    await act(async () => {
      sessionSnapshot.pendingSubmissions.push({
        requestId: 'rpc-repeat', time: Date.now(),
        text: '只修改重大风险结论，不要重做已完成的招标文件解析。', images: [],
      })
      sessionListeners.forEach((listener) => listener())
      await new Promise((resolveTick) => setTimeout(resolveTick, 20))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'record_requirement').length, 3, 'a later explicit repeat of the same instruction must reach the project again')

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    const FilesRail = registered.get('tender-files')
    assert.equal(typeof FilesRail, 'function')
    const sessions = { current: 'session-1', byId: { 'session-1': { cwd: 'C:\\workspace' } } }
    await act(async () => {
      rootView!.render(React.createElement(FilesRail, {
        sessionId: 'session-1',
        useSessions: (selector: (state: typeof sessions) => unknown) => selector(sessions),
      }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 0))
    })
    assert.ok(mount.querySelector('.ap-files-dock'), 'right-side files rail did not render for an active session')
    assert.match(mount.textContent || '', /资源文件/)

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    const Workbench = registered.get('workbench')
    assert.equal(typeof Workbench, 'function')
    await act(async () => {
      rootView!.render(React.createElement(Workbench, {
        sessionId: 'session-1',
        useSessions: (selector: (state: typeof sessions) => unknown) => selector(sessions),
        openView: (view: string, focus: string) => fetchCalls.push({ url: 'open-view:' + view + ':' + focus }),
      }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 30))
    })
    const rendered = mount.textContent || ''
    assert.match(rendered, /知识面导航与证据/)
    assert.match(rendered, /影子树 1 份/)
    assert.ok(rendered.includes('五域覆盖：有未读节点/证据/结论缺口'))
    assert.match(rendered, /结构化证据 2 条/)
    assert.match(rendered, /默认切换仍受真实项目 80–120 项评测/)
    assert.ok(rendered.includes('[kb:…]/[src:…]/[ev:…]'))
    assert.match(rendered, /执行态（主智能体回写）/)
    assert.match(rendered, /事实态（系统核验）/)
    assert.match(rendered, /登记并核验投标资料/)
    assert.match(rendered, /资料齐套检查/)
    assert.match(rendered, /用户要求（最高优先级）/)
    assert.match(rendered, /只修改重大风险结论，不要重做已完成的招标文件解析/)
    const satisfyRequirement = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent === '标记已落实')
    assert.ok(satisfyRequirement)
    await act(async () => {
      satisfyRequirement.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    const acceptRequirement = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent === '采用为验收口径')
    assert.ok(acceptRequirement)
    await act(async () => {
      acceptRequirement.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    assert.equal(fetchCalls.filter((call) => call.action === 'satisfy_requirement').length, 1)
    assert.equal(fetchCalls.filter((call) => call.action === 'accept_requirement').length, 1)
    assert.match(mount.textContent || '', /已采用为验收口径/)
    const continueProject = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent?.includes('继续推进'))
    assert.ok(continueProject, 'workbench continue action did not render')
    await act(async () => {
      continueProject.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    assert.deepEqual(promptTexts, ['【专业项目启动】请依据已登记资料完成项目对齐并继续当前阶段。'])
    assert.equal(fetchCalls.filter((call) => call.action === 'mark_dispatched').length, 1)
    assert.equal(fetchCalls.filter((call) => call.url.startsWith('open-view:chat:')).length, 1)

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    dom.window.sessionStorage.setItem('ap-wb-module', 'modules')
    sessionSnapshot.blank = true
    await act(async () => {
      rootView!.render(React.createElement(Workbench, {
        sessionId: 'session-1',
        session: { ...blankSession, blank: true },
        useSessions: (selector: (state: typeof blankSessions) => unknown) => selector(blankSessions),
      }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    const distill = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent?.includes('做过一单'))
    assert.ok(distill, 'native module-create entry did not render')
    await act(async () => {
      distill.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    assert.deepEqual(presetSelectCalls, [{ sessionId: 'session-1', preset: 'cordis' }])
    assert.match(promptTexts.at(-1) || '', /DSH 原生「创造模式」/)
    assert.match(promptTexts.at(-1) || '', /不能把“文件存在”当成“用户认可”/)
    assert.match(promptTexts.at(-1) || '', /来源会话：session-1/)

    await act(async () => rootView!.unmount())
    rootView = createRoot(mount)
    dom.window.sessionStorage.setItem('ap-wb-module', 'modules')
    sessionSnapshot.blank = false
    const nonblankSessions = { current: 'session-1', byId: { 'session-1': { cwd: 'C:/workspace', blank: false } } }
    await act(async () => {
      rootView!.render(React.createElement(Workbench, {
        sessionId: 'session-1',
        session: { ...blankSession, blank: false },
        useSessions: (selector: (state: typeof nonblankSessions) => unknown) => selector(nonblankSessions),
      }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    const custom = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent?.includes('步骤就不一样'))
    assert.ok(custom, 'custom module-create entry did not render')
    await act(async () => {
      custom.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await new Promise((resolveTick) => setTimeout(resolveTick, 40))
    })
    assert.deepEqual(sessionCreateCalls, [{ cwd: 'C:/workspace', agentPreset: 'cordis' }])
    assert.equal(openedSessionIds.at(-1), 'session-create-mode')
    assert.match(promptTexts.at(-1) || '', /项目根目录：C:[\\/]workspace/)
  } finally {
    if (rootView) await act(async () => rootView!.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete (globalThis as Record<string, unknown>)[key]
    }
  }
})
