import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'
import { bindProjectSession, projectForBoundSession } from '../src/orchestration.ts'
import { businessProjectForAgent, registerBusinessActivation, withBusinessGoalBoundary } from '../src/business-activation.ts'
import { registerPrompt } from '../src/prompt.ts'
import { registerTools } from '../src/tools.ts'

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-business-activation-'))
  const project = createBusinessProject({ workspaceRootPath: cwd, projectId: 'explicit-bid', module: 'tender', name: 'Explicit bid', rootPath: cwd, workflowId: 'tender-main', createDirectory: false })
  const sessions = new Map<string, any>()
  const denied = new Map<string, string[]>()
  const agent = (id: string, parentSession?: string) => {
    const session = { id, header: { cwd, ...(parentSession ? { parentSession } : {}) } }
    sessions.set(id, session)
    return { id, session, ctx: {
      get: (name: string) => name === 'sessions' ? { get: (id: string) => sessions.get(id) } : undefined,
      tools: { restrict: ({ deny }: { deny: string[] }) => { denied.set(id, deny); return () => { denied.delete(id) } } },
    } }
  }
  return { cwd, project, agent, denied }
}

test('business prompt activates only the explicitly bound session and its actual descendant lineage', () => {
  const f = fixture()
  const ordinary = f.agent('ordinary')
  const parent = f.agent('project-parent')
  f.agent('worker', parent.id)
  const grandchild = f.agent('nested-worker', 'worker')
  const sections = new Map<string, any>()
  registerPrompt({ systemPrompt: { section: (entry) => sections.set(entry.name, entry) } }, () => ({}))
  const render = sections.get('agent-pi:tender').text
  assert.equal(render({ agent: ordinary }), '')
  assert.equal(render({ agent: parent }), '')
  bindProjectSession(f.cwd, f.project, parent.id)
  assert.equal(render({ agent: ordinary }), '', 'sharing the workspace must not activate tender')
  assert.match(render({ agent: parent }), /tender_stage/)
  assert.match(render({ agent: grandchild }), /tender_stage/)
  assert.equal(businessProjectForAgent(f.agent('unrelated')), null)
  const cycle = f.agent('cycle-a', 'cycle-b')
  f.agent('cycle-b', 'cycle-a')
  assert.equal(businessProjectForAgent(cycle), null)
})

test('native tool scopes stay independent and explicit binding lifts only its business restriction', async () => {
  const f = fixture()
  const ordinary = f.agent('ordinary')
  const selected = f.agent('selected')
  const listeners = new Map<string, Function>()
  registerBusinessActivation({
    tools: { schemas: () => ['read', 'run_code', 'create_goal', 'tender_stage', 'tender_knowledge', 'tender_project', 'kb_search'].map((name) => ({ name })) },
    on: (event, listener) => listeners.set(event, listener),
  })
  for (const agent of [ordinary, selected]) listeners.get('agent/created')!({ agent })
  assert.deepEqual(f.denied.get(ordinary.id), ['tender_stage', 'tender_knowledge'])
  bindProjectSession(f.cwd, f.project, selected.id)
  const decision = { kind: 'enter', messages: [{ text: 'user message' }] }
  assert.equal(await listeners.get('agent/pre-step')!({ agent: selected }, () => decision), decision)
  assert.equal(f.denied.has(selected.id), false)
  assert.equal(f.denied.has(ordinary.id), true)
  listeners.get('agent/disposed')!({ agent: ordinary })
  assert.equal(f.denied.has(ordinary.id), false)
})

test('official goal driver sees ordinary goals while bound projects cannot start a second continuation loop', () => {
  const f = fixture()
  const ordinary = f.agent('ordinary')
  const selected = f.agent('selected')
  const active = { phase: 'active', activation: 'armed' }
  const goals = { calls: 0, get() { this.calls += 1; return active }, disarm() { this.calls += 1 } }
  const original = { goals, marker: 7, readMarker() { return this.marker } }
  const wrapped = withBusinessGoalBoundary(original)
  assert.equal(wrapped.goals.get(ordinary), active)
  bindProjectSession(f.cwd, f.project, selected.id)
  assert.equal(wrapped.goals.get(selected), undefined)
  assert.equal(goals.calls, 1)
  wrapped.goals.disarm(ordinary)
  assert.equal(goals.calls, 2)
  assert.equal(wrapped.readMarker(), 7)
  assert.equal(original.goals, goals)
})

test('only explicit project create or bind activates the caller; listing and unknown actions do not', async () => {
  const f = fixture()
  const definitions = new Map<string, any>()
  registerTools({ tools: { register: (definition: any) => definitions.set(definition.name, definition) } }, (definition) => definition)
  const tool = definitions.get('tender_project')
  const agent = f.agent('explicit-user')
  await tool.execute({ action: 'list' }, { agent })
  assert.equal(projectForBoundSession(f.cwd, agent.id), null)
  await assert.rejects(tool.execute({ action: 'unknown' }, { agent }), /Unknown tender_project action/)
  assert.equal(projectForBoundSession(f.cwd, agent.id), null)
  await tool.execute({ action: 'bind', projectId: f.project.projectId }, { agent })
  assert.equal(projectForBoundSession(f.cwd, agent.id)?.projectId, f.project.projectId)
  const created = f.agent('create-user')
  await tool.execute({ action: 'create', projectId: 'new-business', name: 'New business' }, { agent: created })
  assert.equal(projectForBoundSession(f.cwd, created.id)?.projectId, 'new-business')
  assert.match(tool.description, /Never use this for an ordinary chat, coding task, or generic software project/)
})

test('product profile preserves native preset tools and routes only the goal driver through the business boundary', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /id: goal-round-driver\s+name: dsh-tender-host\/goal-round-driver/)
  assert.doesNotMatch(patch, /id: (?:goal|tool-goal|command-goal|plan-mode|tool-todo)\s+disabled: true/)
})
