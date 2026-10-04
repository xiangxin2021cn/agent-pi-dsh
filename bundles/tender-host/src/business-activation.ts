import { projectForBoundSession } from './orchestration.ts'

type Agent = {
  id?: string
  session?: { id?: string; header?: { cwd?: string; parentSession?: string } }
  ctx?: { tools?: { restrict: (filter: { deny: string[] }) => () => void }; get?: (name: string) => any }
}

/** A workspace containing a project does not activate that project in every chat. */
export function businessProjectForAgent(agent?: Agent) {
  let session = agent?.session
  let sessionId = session?.id || agent?.id
  const seen = new Set<string>()
  while (session?.header?.cwd && sessionId && !seen.has(sessionId)) {
    seen.add(sessionId)
    const cwd = session.header.cwd
    const project = projectForBoundSession(cwd, sessionId)
    if (project) return project
    const parentId = session.header.parentSession
    if (!parentId) break
    const parentProject = projectForBoundSession(cwd, parentId)
    if (parentProject) return parentProject
    session = agent?.ctx?.get?.('sessions')?.get?.(parentId)
      ?? agent?.ctx?.get?.('agents')?.get?.(parentId)?.session
    sessionId = parentId
  }
  return null
}

/** Keep business execution tools out of unbound native Standard/PTC conversations. */
export function registerBusinessActivation(ctx: {
  tools: { schemas: () => Array<{ name: string }> }
  on: (event: string, listener: (...args: any[]) => unknown) => unknown
  effect?: (install: () => (() => void)) => unknown
  get?: (name: string) => { list?: () => Agent[] } | undefined
}) {
  const restrictions = new Map<Agent, { signature: string; dispose: () => void }>()
  ctx.effect?.(() => () => { for (const item of restrictions.values()) item.dispose(); restrictions.clear() })
  const sync = (agent?: Agent) => {
    if (!agent?.ctx?.tools) return
    const tools = ctx.tools.schemas().map((tool) => tool.name)
      .filter((name) => name.startsWith('tender_') && name !== 'tender_project')
    const signature = tools.join('\n')
    if (businessProjectForAgent(agent) || !tools.length) {
      restrictions.get(agent)?.dispose()
      restrictions.delete(agent)
    } else if (restrictions.get(agent)?.signature !== signature) {
      restrictions.get(agent)?.dispose()
      restrictions.set(agent, { signature, dispose: agent.ctx.tools.restrict({ deny: tools }) })
    }
  }
  ctx.on('agent/created', ({ agent }) => sync(agent))
  ctx.on('agent-pi/business-activation-sync', ({ agent }) => sync(agent))
  ctx.on('agent/pre-step', (payload, next) => {
    sync(payload.agent)
    return typeof next === 'function' ? next() : { kind: 'enter', messages: payload.messages || [] }
  })
  ctx.on('agent/disposed', ({ agent }) => {
    restrictions.get(agent)?.dispose()
    restrictions.delete(agent)
  })
  for (const agent of ctx.get?.('agents')?.list?.() || []) sync(agent)
}

/** Preserve the official goal lifecycle while the bound workbench owns continuation. */
export function withBusinessGoalBoundary(ctx: Record<string, any>) {
  const goals = new Proxy(ctx.goals, {
    get(target, key) {
      if (key === 'get') return (agent: Agent) => ctx.get?.('workbench') && businessProjectForAgent(agent) ? undefined : target.get(agent)
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'goals') return goals
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
