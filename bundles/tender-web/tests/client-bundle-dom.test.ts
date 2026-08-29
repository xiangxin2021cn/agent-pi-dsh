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

function requirePnpmPackage(name: string) {
  const folder = readdirSync(pnpm).find((entry) => entry === name || entry.startsWith(name + '@'))
  if (!folder) throw new Error(`Missing ${name} under the DSH pnpm store`)
  return createRequire(join(pnpm, folder, 'node_modules', name, 'package.json'))
}

test('generated client boots, ChatGPT login works, and the session file rail renders in a real React DOM', async () => {
  const dshRequire = createRequire(join(dsh, 'package.json'))
  const { JSDOM } = dshRequire('jsdom')
  const reactRequire = requirePnpmPackage('react')
  const reactDomRequire = requirePnpmPackage('react-dom')
  const React = reactRequire('react')
  const ReactDOM = reactDomRequire('react-dom')
  const { createRoot } = reactDomRequire('react-dom/client')
  const { act } = React
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
  })

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
    fetch: async () => ({
      ok: true,
      statusText: '',
      json: async () => ({ files: [], outputFiles: [] }),
    }),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    IS_REACT_ACT_ENVIRONMENT: true,
  }
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
      inject(_deps: unknown, callback: (scope: object) => void) { callback({}) },
      slots: {
        inject(_name: string, callback: () => void) { callback() },
        register(definition: { id?: string; name: string }, component: unknown) {
          registered.set(definition.id || definition.name, component)
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
  } finally {
    if (rootView) await act(async () => rootView!.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete (globalThis as Record<string, unknown>)[key]
    }
  }
})
