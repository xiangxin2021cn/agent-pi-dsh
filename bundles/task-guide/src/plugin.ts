import { createHash } from 'node:crypto'
import { createTaskStore, markChangedDeliverables } from '../../../packages/professional-tasks/task.ts'
import { CapabilityRegistry, assessCapability, toolCapabilities } from '../../../packages/professional-tasks/capabilities.ts'
import { calculateBoq, deriveCrewConsumption, resourcePeaks } from '../../../packages/professional-tasks/calculations.ts'
import { auditTask, inspectWriting, writingPreset } from '../../../packages/professional-tasks/quality.ts'
import type { Capability, ProfessionalTask } from '../../../packages/professional-tasks/types.ts'
import { parseTaskSource } from './sources.ts'
import { professionalTaskContext, isTaskStatusRequest, taskWebDiligenceCommand } from './context.ts'
import { projectForBoundSession, loadBoard, recordProjectUserRequirement, approvalStageFingerprint } from '../../tender-host/src/orchestration.ts'
import { workflowFor } from '../../tender-host/src/modules.ts'
import { setPendingTaskSync, loadUserRequirementLedger } from '../../tender-host/src/user-requirements.ts'
import { officialStageDir } from '../../tender-host/src/outputs.ts'
import { join } from 'node:path'

export const TASK_GUIDANCE = `Agent Pi professional task guidance. The selected main executor owns understanding, clarification, execution, feedback and stopping. Product task state is our shared record, never another agent loop or a prerequisite form.
Use the main conversation to gradually understand the user's goal. Classify each actual message semantically as a goal, supplemental fact, correction, scope change, progress question or control request. Read supplied material first; proceed with independent useful work and only ask questions that change the execution path or acceptance. A clear request runs directly. Update shared understanding via professional_task apply_understanding with partial brief fields, intent and provenance; identify explicit user text, located source facts and provisional inferences. Do not silently replace the project-wide goal with a current-stage goal. Ordinary status questions do not change requirements or invalidate completed work.
During execution, record meaningful professional findings with professional_task record_finding: stable id, fact/summary, evidenceIds, goalImpact, actions and importance. Explain the finding's implication and next step in the main chat; batch routine findings into stage summaries. Tools being called are activity, not professional conclusions. Preserve conflicts and missing material. Use native questions and native approvals; a timeout, permission approval, generic 'okay' or model-generated answer is not customer acceptance or stage approval. Native question projections are authoritative. When user feedback changes scope or delivery, update only affected dependencies and explain the concrete change. For a bound workbench, apply_understanding projectChange=true synchronizes the actual latest human request into the existing requirement ledger; do not use it for progress inquiries. Children contribute evidence/findings to the parent's task; only the main executor revises the shared goal. professional depth is a user-only quality policy, with advanced settings optional; turning it off preserves check history and workbench gates.
For a substantive professional task, call professional_task status and create/update the task brief from the actual user request, selected inputs and current conversation before substantial work. Small clear edits and ordinary questions can proceed directly. Read existing materials before asking; ask only questions that change scope, methods or delivery. Use native ask_user/userQuestions when needed. The model selects methods semantically; the capability catalogue checks actual tools, skills, module state and declared applicability. A matching domain name never proves fitness. Use native skills/tools or workflow for execution, and keep ordinary tasks independent of workbench project creation.
Identify profession, output/audience, scope, input versions and project country/location/employer/procurement/funding/contract/measurement/standards. Do not infer jurisdiction from currency alone. Load country/domain rules only when their scope and versions are supported by project evidence; unknown systems need targeted diligence. Resolve source precedence from the current contract, not a universal template. When an installed tool/plugin is unavailable, state the concrete gap and use available native alternatives or propose the required supplement; never invent tool calls.
Tender tasks proceed by dependencies: (1) full document/page/table/drawing/attachment/addendum coverage and source-located requirements; (2) local diligence on actual gaps; (3) every actual BOQ item's scope, measurement, method/productivity, resource consumption, cost and reconciliation; (4) detailed implementation planning from that basis; (5) all actual tender returnables and scoring responses, including forms/declarations/deviations and signature state. Partial assignments execute only the requested scope. Register unreadable or missing source units rather than claim full coverage. Use calculate_boq/derive_crew/resource_peaks to verify numeric results, alongside native calculation tools; distinguish physical resources, commercial transfer items, internal cost and tender quotation. Resource consumption is not peak configuration. Use the actual schedule and payment conditions for cashflow.
Drawing/quantity/method tasks first establish drawing version, units, professional scope, measurement basis, site conditions and intended use. Keep drawing location/component/dimension/formula/quantity links; separate extracted geometry from visual interpretation. Detect duplicate views, unsupported formats and missing project conditions. Method statements contain this project's steps/resources/parameters/inspection/abnormal-condition handling.
Separate source facts, verified web evidence, engineering derivations, assumptions and unresolved conflicts. Public read-only diligence on task-relevant gaps is allowed by default, unless the user restricts it. The current task brief's webDiligence is authoritative: allowed permits relevant public research; ask requires user authorization before research; forbidden prohibits it, including market-rate searches. Web investigation uses real pages with URL, access/effective date, locality and applicability. Public data cannot prove private project geology, bidder capacity/experience, confidential conditions or formal supplier replies. Only the user can change a diligence restriction, record customer acceptance and confirm signatures. Investigate task-relevant gaps without repeated permission questions; uploading private data, contacting others, purchasing or installing additions requires actual authorization. Material unsupported assumptions stay provisional, with calculation basis/range/sensitivity. A model cannot turn an assumption into a verified fact. Use native web_search/web_fetch if AnySearch is unavailable.
Search is discovery, not verification. Prefer official procurement, government, standards bodies and original project or supplier sources; verify the opened page, jurisdiction, effective date, project applicability and source locator before using a result as evidence. Search ranking, snippets, AI summaries and a successful extraction request do not establish reliability or source authenticity. Query the actual country, project and authority explicitly: AnySearch zone cn/intl is a routing setting, not a country or legal-system filter. Call anysearch_capabilities before advanced/batch searches and use only advertised parameters; limit maxResults to 10. Distinguish retrieved text, calculations and provisional inferences; keep conflicting, missing, paywalled or truncated evidence explicit. Retain source URL, accessed date and applicable document/page/section in the workpaper. An invalid Key or quota failure is a service failure, not evidence that no relevant sources exist; report its sanitized status and use available authorized alternatives. Never place API keys or upstream credential-bearing error messages in chat, reports or logs.
Automatically apply the current professional writing preset; use the user's template/language/terms, precise project reasoning, real calculations and executable steps. Strip filler, repeated prose and internal system tours; never invent specificity. Review actual files for technical meaning, numerical and cross-file consistency, requirement/score/form coverage and format. professional_task check inspects real files; writing checks are advisory and never replace professional review. Update only affected work after new user instructions/evidence, respect revisions, and preserve existing workbench project snapshots. Present actual files through DSH present. Generated files do not establish submission readiness; only customer acceptance and real signature/authority checks complete final returnables.`

export function registerTaskGuide(ctx: any, defineTool: (options: any) => unknown, home: string) {
  const store = createTaskStore(home)
  const registry = new CapabilityRegistry()
  const rootSession = (id: string) => {
    let session = ctx.get('sessions')?.get(id) || ctx.get('agents')?.get(id)?.session
    const seen = new Set<string>()
    while (session?.header?.parentSession && !seen.has(session.id)) {
      seen.add(session.id)
      const parent = ctx.get('sessions')?.get(session.header.parentSession) || ctx.get('agents')?.get(session.header.parentSession)?.session
      if (!parent) break
      session = parent
    }
    return session || { id }
  }
  const commit = (id: string, patch: any, revision: number, actor: any, options?: any) => {
    const state = store.update(rootSession(id).id, patch, revision, actor, options)
    ctx.emit?.('agent-pi/professional-task-changed', { sessionId: state.sessionId, revision: state.revision, sequence: state.recentChanges.at(-1)?.sequence })
    return state
  }
  const syncProject = (state: ProfessionalTask) => {
    if (!state.pendingProjectSync && state.binding?.cwd) {
      const project = projectForBoundSession(state.binding.cwd, state.sessionId)
      const pending = project && loadUserRequirementLedger(state.binding.cwd, project).pendingTaskSync?.[state.sessionId]
      if (pending) state = commit(state.sessionId, { pendingProjectSync: { ...pending, createdAt: new Date().toISOString() } }, state.revision, 'host', { summary: '恢复未完成的项目要求同步记录' })
    }
    if (!state.pendingProjectSync) return state
    if (!state.binding?.cwd) throw new Error('待同步任务缺少项目工作区。')
    const project = projectForBoundSession(state.binding.cwd, state.sessionId)
    if (!project || project.projectId !== state.binding.projectId || project.module !== state.binding.moduleId) throw new Error('工作台绑定已变化，不能把旧需求写入其他项目。')
    const pending = state.pendingProjectSync
    setPendingTaskSync(state.binding.cwd, project, state.sessionId, { ...pending, stageId: pending.stageId || '' })
    recordProjectUserRequirement(state.binding.cwd, project, { sessionId: state.sessionId, stageId: pending.stageId, text: pending.text, messageId: pending.messageId })
    const next = commit(state.sessionId, { pendingProjectSync: undefined }, state.revision, 'host', { summary: '任务变更已同步到工作台要求' })
    setPendingTaskSync(state.binding.cwd, project, state.sessionId)
    return next
  }
  const refreshBinding = (session: any) => {
    let state = store.read(session.id)
    const project = session.header?.cwd && projectForBoundSession(session.header.cwd, session.id)
    let binding: any
    if (project) {
      const board = loadBoard(session.header.cwd, project.projectId, project.module)
      const workflow = workflowFor(project)
      const stage = workflow.stages.find(row => row.id === board.currentStageId)
      binding = { cwd: session.header.cwd, projectId: project.projectId, moduleId: project.module, projectGoal: project.projectGoal || workflow.projectGoal, terminalDeliverables: project.terminalDeliverables || workflow.terminalDeliverables, workflowRevision: project.workflowSnapshot?.revision, stageId: stage?.id, stageLabel: stage?.labelZh }
    }
    if (state.pendingProjectSync && JSON.stringify(binding) !== JSON.stringify(state.binding)) return state
    if (JSON.stringify(binding) !== JSON.stringify(state.binding)) state = commit(session.id, { binding }, state.revision, 'host', { summary: binding ? '共同任务已关联当前工作台阶段' : '共同任务已解除工作台关联' })
    if (project && !state.pendingProjectSync) {
      const pending = loadUserRequirementLedger(session.header.cwd, project).pendingTaskSync?.[session.id]
      if (pending) state = commit(session.id, { pendingProjectSync: { ...pending, createdAt: new Date().toISOString() } }, state.revision, 'host', { summary: '恢复未完成的项目要求同步记录' })
    }
    return state
  }
  const readStatus = async (agent: any) => {
    const session = rootSession(agent.session.id)
    let state = refreshBinding(session)
    const projection = ctx.get('sessionProjections')?.stateOf(session, 'userQuestions')?.questions
    for (const call of projection?.active || []) service.linkNativeQuestion(session.id, { provider: 'dsh', callId: call.callId, questions: call.questions, status: call.state })
    for (const call of projection?.settled || []) {
      const current = store.read(session.id)
      const questions = current.questions.filter(row => row.provider === 'dsh' && row.callId === call.callId)
      const answers = Object.fromEntries(call.answers.map((row: any) => [row.id, [...row.selected, row.custom].filter(Boolean).join('；')]))
      if (questions.length) service.linkNativeQuestion(session.id, { provider: 'dsh', callId: call.callId, questions: questions.map(row => ({ ...row, id: row.id.slice(`dsh:${call.callId}:`.length) })), answers })
    }
    state = store.read(session.id)
    if (projection) {
      const active = new Set(projection.active.map((row: any) => String(row.callId)))
      const settled = new Map(projection.settled.map((row: any) => [String(row.callId), row.answers]))
      const questions = state.questions.map(row => row.provider === 'dsh' && !row.answer && !['cancelled', 'answered'].includes(row.status || '') && (!active.has(row.callId!) || settled.has(row.callId!)) ? { ...row, status: settled.has(row.callId!) && (settled.get(row.callId!) as any[])?.length ? 'answered' : 'cancelled' } : row)
      if (JSON.stringify(questions) !== JSON.stringify(state.questions)) state = commit(session.id, { questions }, state.revision, 'host', { summary: '按原生问答记录更新已结束的问题' })
    }
    const owner = ctx.get('agents')?.get(session.id)
    const fs = owner?.ctx?.get?.('fs') || (agent.session.id === session.id && agent.ctx !== ctx ? agent.ctx?.get?.('fs') : undefined)
    const paths = [...new Set([...state.deliverables.filter(row => row.checks.some(check => check.fingerprint)).map(row => row.path), ...state.quality.checks.filter(row => row.sha256 && row.path).map(row => row.path!)])]
    const verificationGaps: string[] = []
    if (!fs) verificationGaps.push(...paths)
    if (fs && session.id === agent.session.id) {
      const fingerprints: Record<string, string | null> = {}
      for (const path of paths) {
        try {
          const file = await fs.resolve(path, { cwd: session.header.cwd })
          const stat = await fs.stat(file)
          if (!stat || stat.type !== 'file') fingerprints[path] = null
          else fingerprints[path] = createHash('sha256').update(await fs.readBytes(file, undefined, 32 * 1024 * 1024)).digest('hex')
        } catch { verificationGaps.push(path) }
      }
      const changed = markChangedDeliverables(state, fingerprints)
      if (changed.changedPaths.length) state = commit(session.id, { deliverables: changed.deliverables, quality: changed.quality }, state.revision, 'host', { summary: '成果文件已变化，相关检查需要复核' })
    }
    const project = state.binding && projectForBoundSession(state.binding.cwd!, state.sessionId)
    const stage = project && workflowFor(project).stages.find(row => row.id === state.binding!.stageId)
    const board = project && loadBoard(state.binding!.cwd!, project.projectId, project.module)
    const approvalDeliverables = stage ? [...(board!.stages[stage.id]?.tasks || []).map(row => ({ title: row.title, path: row.markdownPath || row.reportPath, status: row.status })).filter(row => row.path), ...(stage.summaryDeliverable ? [{ title: stage.summaryDeliverable.fileName, path: join(officialStageDir(state.binding!.cwd!, project!.projectId, stage.id), stage.summaryDeliverable.fileName) }] : [])] : []
    return { task: state, binding: state.binding ? { ...state.binding, approvalGate: !!stage?.approvalGate, approvalFingerprint: stage?.approvalGate ? approvalStageFingerprint(state.binding.cwd!, project!, stage.id) : undefined, approvalDeliverables } : null, audit: auditTask(state), verificationGaps }
  }
  const taskContext = (agent: any) => {
    let session = agent?.session
    const seen = new Set<string>()
    while (session && !seen.has(session.id)) {
      seen.add(session.id)
      const state = store.read(session.id)
      if (!session.header.parentSession) return state
      session = ctx.get('sessions')?.get(session.header.parentSession)
    }
    return agent?.session ? store.read(agent.session.id) : undefined
  }
  const service = {
    apiVersion: 2, read: (id: string) => store.read(rootSession(id).id),
    status: readStatus,
    update: commit,
    context: (id: string) => professionalTaskContext(store.read(rootSession(id).id)),
    linkNativeQuestion(id: string, input: any) {
      const state = store.read(rootSession(id).id)
      const questions = [...state.questions]
      for (const row of input.questions || []) {
        const key = `${input.provider}:${input.callId}:${row.id}`
        const old = questions.find(value => value.id === key)
        const answer = input.answers?.[row.id]
        const question = { ...old, id: key, question: row.question, provider: input.provider, callId: String(input.callId), requestId: String(input.requestId || input.callId), askedRevision: old?.askedRevision ?? state.revision, status: answer !== undefined ? 'answered' : input.status || 'open', ...(answer !== undefined ? { answer: String(answer), answerSource: 'native' } : {}) }
        if (old) questions[questions.indexOf(old)] = question
        else questions.push(question)
      }
      return JSON.stringify(questions) === JSON.stringify(state.questions) ? state : commit(id, { questions }, state.revision, 'host', { summary: input.answers ? '用户已通过原生问答补充条件' : '原生提问与共同任务关联' })
    },
    async catalogue(agent?: any) {
      const tools = agent?.ctx?.get?.('tools') || ctx.tools
      const schemas = tools.schemas(agent)
      const skillService = agent?.ctx?.get?.('skills') || ctx.get?.('skills')
      const skills = skillService ? await skillService.list({ cwd: agent?.session?.header?.cwd, scope: agent, signal: undefined }) : []
      const capabilities: Capability[] = [...registry.list(), ...toolCapabilities(schemas)]
      for (const skill of skills.filter((row: any) => row.invocation?.modelInvocable !== false)) capabilities.push({
        id: `skill:${skill.name}`, owner: skill.provider || 'dsh-native-skill-adapter', version: 'runtime', title: skill.name,
        description: skill.description || skill.name, professions: ['general'], tools: ['skill'], skills: [skill.name], inputs: ['See skill instructions'], outputs: ['See skill instructions'],
        limitations: ['A method skill does not supply missing executable tools or project facts'], supplements: ['Load the native skill and inspect its prerequisites'],
      })
      const workbench = ctx.get?.('workbench')
      let enabledModules: string[] | undefined
      if (workbench) {
        const { listWorkbenchModules } = await import('../../tender-host/src/modules.ts')
        const modules = workbench.run(() => listWorkbenchModules().modules)
        enabledModules = modules.filter((row: any) => !row.disabled).map((row: any) => row.id)
        for (const module of modules) capabilities.push({
          id: `module:${module.id}`, owner: workbench.list().find((row: any) => row.workflow.module === module.id)?.owner || 'dsh-agent-pi-workbench:user-definition', version: module.revision || 'snapshot',
          title: module.labelZh, description: module.workflow.projectGoal || module.label, professions: ['general'], tools: ['tender_project'], skills: [],
          inputs: ['Task-specific project sources'], outputs: module.workflow.terminalDeliverables || module.workflow.stages.map((row: any) => row.labelZh),
          limitations: ['Workflow needs task suitability evaluation; JSON does not provide executable code'], supplements: ['Adapt the requested scope and check installed stage skills'], module: module.id,
        })
      }
      const available = { tools: schemas.map((row: any) => row.name), skills: skills.filter((row: any) => row.invocation?.modelInvocable !== false).map((row: any) => row.name), enabledModules }
      const state = taskContext(agent)
      return capabilities.map(capability => assessCapability(capability, state?.brief || store.read('catalogue').brief, available))
    },
  }
  ctx.provide('taskGuide', service)
  ctx.provide('professionalCapabilities', registry)
  ctx.systemPrompt.section({ name: 'agent-pi:professional-task-guide', order: 41, text: TASK_GUIDANCE })
  ctx.systemPrompt.section({ name: 'agent-pi:professional-task', order: 47, interpolate: false, text: ({ agent }: any) => {
    if (!agent?.session) return ''
    const state = taskContext(agent)!
    return professionalTaskContext(state) + (state.brief.objective ? '\n' + writingPreset(state.brief.profession, state.brief.language) : '')
  } })

  async function check(agent: any, state: ProfessionalTask, input: any, signal?: AbortSignal) {
    const fs = agent.ctx.get('fs')
    const rows = structuredClone(state.deliverables)
    for (const row of rows) {
      signal?.throwIfAborted()
      const retained = row.checks.filter(check => !['file', 'writing'].includes(check.kind))
      try {
        const target = await fs.resolve(row.path, { cwd: agent.session.header.cwd, signal })
        const stat = await fs.stat(target, signal)
        if (!stat || stat.type !== 'file') throw new Error('成果文件不存在。')
        const bytes = await fs.readBytes(target, signal, 32 * 1024 * 1024)
        if (!bytes.length) throw new Error('成果文件为空。')
        const fingerprint = createHash('sha256').update(bytes).digest('hex')
        const previous = row.checks.find(check => check.kind === 'file')?.fingerprint
        if (previous && previous !== fingerprint) { row.status = 'stale'; retained.length = 0 }
        const { inspectDeliverable } = await import('../../tender-host/src/deliverable-format.ts')
        const content = await inspectDeliverable(bytes, row.path)
        retained.push({ kind: 'file', status: 'passed', detail: content.evidence, fingerprint })
        if (content.text !== null) {
          const writing = inspectWriting(content.text, state.brief.profession)
          retained.push({ kind: 'writing', status: writing.findings.length ? 'review' : 'passed', detail: writing.findings.length ? JSON.stringify(writing.findings) : '已读取实际文件，未发现已定义的套话、内部说明和重复段落；专业内容需另行复核。', fingerprint })
        } else retained.push({ kind: 'writing', status: 'review', detail: '需要提取并检查实际正文，当前格式不支持自动文本检查。', fingerprint })
      } catch (error) { retained.push({ kind: 'file', status: 'failed', detail: String((error as Error).message) }) }
      row.checks = retained
    }
    const next = commit(state.sessionId, { deliverables: rows }, input.revision, 'agent')
    return { task: next, audit: auditTask(next) }
  }

  ctx.tools.register(defineTool({
    name: 'professional_task', description: '专业任务引导：status 读取持久任务及真实能力；update 保存任务、项目适用依据、证据、全文覆盖、要求、计划及成果；assess 评估实际能力；parse_source 按页抽取选定源文件并登记全文覆盖与缺口；check 检查真实成果；inspect_writing 检查正文；calculate_boq / derive_crew / resource_peaks 做确定性计算。执行继续使用 DSH 原生工具。',
    parameters: {
      action: { type: 'string', required: true, description: 'status | apply_understanding | record_finding | resolve_finding | link_question | sync_project | update | assess | parse_source | check | inspect_writing | calculate_boq | derive_crew | resource_peaks' },
      operationId: { type: 'string', description: 'Stable operation ID for replay-safe mutations; reuse only for the same payload.' },
      revision: { type: 'number', description: 'Required on update/check, from latest status' },
      patch: { type: 'json', description: 'Task fields to replace in full: brief(objective,scope,audience,formats,language,deadline,profession,basis(country,location,employer,procurement,funding,contract,measurement,standards[],precedence[]),webDiligence); questions; evidence; requirements; coverage; plan; deliverables; assessment; needsAssessment. Read status for existing shape. Sources and calculations must be real.' },
      input: { type: 'json', description: 'apply_understanding: {intent:goal|supplement|correction|scope_change|status|control,brief:{partial fields},provenance:{field:{evidenceIds:[]}},summary,projectChange?:boolean}. record_finding: {id,title,summary,goalImpact,evidenceIds:[],requirementIds?:[],stepIds?:[],importance?:critical|normal,actions?:[{label,kind:source|question|action,target?}]}. resolve_finding:{id,resolution}; link_question:{id,question,purpose}. parse_source: {id,path,startPage?,endPage?}, 1–20 PDF pages per call, requires revision. Text/Office files extracted locally; scanned pages/drawings require native OCR/vision/CAD review. Calculation input or {text,profession}. calculate_boq: {items:[{id,code,quantity,unit,kind,scope,method,measurement,evidenceIds,resources:[{id,title,unit,rateUnit,consumption,rate,evidenceIds,status}],transferAmount?,percentage?,percentageBase?}]}. derive_crew: {quantity,dailyOutput,workingHours,crew:[{id,count}]}. resource_peaks: {allocations:[{id,start,end,resources:[{id,count}]}]}.' },
      capabilityIds: { type: 'array', description: 'Optional capability IDs to assess; unknown IDs are returned as unavailable.' },
    },
    output: { schema: { type: 'json' }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: any, exec: any) {
      const agent = exec.agent
      if (!agent?.session) throw new Error('Task requires a live session')
      const state = store.read(rootSession(agent.session.id).id)
      if (agent.session.id !== state.sessionId && ['apply_understanding', 'link_question', 'sync_project', 'check'].includes(args.action)) throw new Error('子任务只贡献证据和发现，共同目标与交付检查由主执行者更新。')
      if (args.operationId && ['apply_understanding', 'record_finding', 'resolve_finding', 'link_question', 'update'].includes(args.action)) {
        const replay = store.replay(state.sessionId, args.operationId, { action: args.action, input: args.input, patch: args.patch }, args.action === 'apply_understanding' ? 'host' : 'agent')
        if (replay) return replay.pendingProjectSync ? syncProject(replay) : replay
      }
      const operationOptions = { operationId: args.operationId, operationPayload: { action: args.action, input: args.input, patch: args.patch } }
      if (args.action === 'status') {
        return { ...await readStatus(agent), capabilities: await service.catalogue(agent) }
      }
      if (args.action === 'update') {
        if (agent.session.id !== state.sessionId && Object.keys(args.patch || {}).some(key => !['evidence', 'coverage', 'findings'].includes(key))) throw new Error('子任务不能修改共同目标、计划或用户决策。')
        return commit(state.sessionId, args.patch || {}, args.revision, 'agent', operationOptions)
      }
      if (args.action === 'apply_understanding') {
        const input = args.input || {}
        if (input.brief?.webDiligence !== undefined && input.brief.webDiligence !== state.brief.webDiligence) throw new Error('网络尽调授权只能由真实用户修改。')
        if (!['goal', 'supplement', 'correction', 'scope_change', 'status', 'control'].includes(input.intent)) throw new Error('请说明本轮用户消息的作用。')
        if (['status', 'control'].includes(input.intent)) return state
        const brief = { ...state.brief, ...input.brief, basis: { ...state.brief.basis, ...input.brief?.basis } }
        const provenance = { ...state.briefProvenance }
        for (const key of Object.keys(input.brief || {})) {
          const proposed = input.provenance?.[key]
          const explicit = typeof brief[key] === 'string' && brief[key] && state.latestRequest.includes(brief[key])
          provenance[key] = { origin: explicit ? 'user' : proposed?.evidenceIds?.length ? 'source' : 'inference', status: explicit ? 'explicit' : 'provisional', messageId: state.latestMessageId, evidenceIds: proposed?.evidenceIds || [], updatedRevision: state.revision + 1 }
        }
        const binding = state.binding
        const briefChanged = JSON.stringify(brief) !== JSON.stringify(state.brief)
        const pending = (input.projectChange || briefChanged) && binding && state.latestMessageId ? { id: args.operationId || `message:${state.latestMessageId}`, text: state.latestRequest, messageId: state.latestMessageId, stageId: binding.stageId, createdAt: new Date().toISOString() } : undefined
        const project = pending && projectForBoundSession(binding.cwd!, state.sessionId)
        if (project) setPendingTaskSync(binding.cwd!, project, state.sessionId, { ...pending, stageId: pending.stageId || '' })
        let next
        try { next = commit(state.sessionId, { brief, briefProvenance: provenance, needsAssessment: false, assessment: input.summary || state.assessment, ...(pending ? { pendingProjectSync: pending } : {}) }, args.revision, 'host', { ...operationOptions, summary: input.summary || '已根据主对话更新任务理解' }) }
        catch (error) { if (project && !store.read(state.sessionId).pendingProjectSync) setPendingTaskSync(binding.cwd!, project, state.sessionId); throw error }
        if (pending) next = syncProject(next)
        return next
      }
      if (args.action === 'sync_project') return syncProject(state)
      if (args.action === 'record_finding') {
        const input = args.input || {}
        const old = state.findings.find(row => row.id === input.id)
        const finding = { ...input, createdRevision: old?.createdRevision ?? state.revision + 1, updatedRevision: state.revision + 1, status: input.status || 'open', source: { engine: String(exec.callId || '').startsWith('codex-') ? 'codex' : 'dsh', toolCallId: exec.callId } }
        return commit(state.sessionId, { findings: [...state.findings.filter(row => row.id !== finding.id), finding] }, args.revision, 'agent', { ...operationOptions, summary: `发现：${finding.title}` })
      }
      if (args.action === 'resolve_finding') {
        if (!state.findings.some(row => row.id === args.input?.id)) throw new Error('未找到发现记录。')
        return commit(state.sessionId, { findings: state.findings.map(row => row.id === args.input.id ? { ...row, status: 'resolved', resolution: args.input.resolution, updatedRevision: state.revision + 1 } : row) }, args.revision, 'agent', { ...operationOptions, summary: '已更新发现的处理结果' })
      }
      if (args.action === 'link_question') {
        const input = args.input || {}
        return commit(state.sessionId, { questions: [...state.questions.filter(row => row.id !== input.id), { id: input.id, question: input.question, purpose: input.purpose, status: 'pending', askedRevision: state.revision }] }, args.revision, 'agent', operationOptions)
      }
      if (args.action === 'check') return check(agent, state, args, exec.signal)
      if (args.action === 'parse_source') {
        const { patch, ...result } = await parseTaskSource(agent, state, args.input, exec.signal)
        const task = commit(state.sessionId, patch, args.revision, 'agent')
        return { ...result, task, audit: auditTask(task) }
      }
      if (args.action === 'assess') {
        const catalogue = await service.catalogue(agent)
        return args.capabilityIds?.length ? args.capabilityIds.map((id: string) => catalogue.find(row => row.id === id) || { id, status: 'unavailable', reasons: ['Capability is not currently registered'], supplements: ['Find an available alternative or install a suitable native plugin'] }) : catalogue
      }
      if (args.action === 'calculate_boq') {
        for (const item of args.input.items) {
          for (const id of [...item.evidenceIds, ...item.resources.flatMap((row: any) => row.evidenceIds)]) if (!state.evidence.some(row => row.id === id)) throw new Error(`Unknown calculation evidence: ${id}`)
          for (const resource of item.resources) if (resource.status === 'sourced' && resource.evidenceIds.some((id: string) => !state.evidence.some(row => row.id === id && row.status === 'verified' && row.applicable === true && row.kind !== 'assumption'))) throw new Error('Sourced resources require applicable verified evidence; otherwise use scenario/unverified')
        }
        return calculateBoq(args.input.items)
      }
      if (args.action === 'derive_crew') return deriveCrewConsumption(args.input)
      if (args.action === 'resource_peaks') return resourcePeaks(args.input.allocations)
      if (args.action === 'inspect_writing') return inspectWriting(args.input.text, args.input.profession || state.brief.profession)
      throw new Error('Unknown professional task action')
    },
  }))
  ctx.on('agent/inbox/claimed', ({ agent, message }: any) => {
    if (!agent?.session) return
    if (message?.source?.kind === 'user-question-reply') { void readStatus(agent).catch(() => {}); return }
    if (message?.source?.kind !== 'user') return
    const session = rootSession(agent.session.id)
    if (session.id !== agent.session.id) return
    const state = refreshBinding(session)
    const text = (message.content || []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n')
    if (!text.trim()) return
    if (message.id && state.latestMessageId === message.id) return
    const brief = structuredClone(state.brief)
    const diligence = taskWebDiligenceCommand(text)
    if (diligence) brief.webDiligence = diligence
    commit(session.id, { latestRequest: text, latestMessageId: message.id, needsAssessment: isTaskStatusRequest(text) ? state.needsAssessment : true, brief }, state.revision, 'user', { summary: isTaskStatusRequest(text) ? '用户询问进展或调整执行状态' : '收到用户的新表达，主对话将更新任务理解' })
  })
  ctx.inject(['webServer'], (scope: any) => {
    scope.effect(() => scope.webServer.register({ kind: 'exact', path: '/api/agent-pi/professional-task', async handler(req: any, res: any) {
      const send = (code: number, value: any) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
      try {
        const url = new URL(req.url, 'http://127.0.0.1')
        const sessionId = url.searchParams.get('sessionId') || ''
        const session = ctx.get('sessions')?.get(sessionId)
        if (!session) return send(404, { error: '当前对话尚未就绪。' })
        const agent = ctx.get('agents')?.get(sessionId) || { session, ctx }
        if (req.method === 'GET') {
          if (url.searchParams.get('action') === 'source') {
            const state = store.read(rootSession(sessionId).id)
            const evidence = state.evidence.find(row => row.id === url.searchParams.get('evidenceId'))
            if (!evidence) throw new Error('未找到该任务中的出处。')
            if (evidence.url && /^https?:\/\//i.test(evidence.url)) return send(200, { url: evidence.url, locator: evidence.locator })
            const sourcePath = evidence.sourcePath || evidence.locator?.split('#')[0]
            if (!sourcePath) throw new Error('此依据未登记原稿路径。')
            const sourceOwner = ctx.get('agents')?.get(state.sessionId)
            if (!sourceOwner) throw new Error('请先打开这条依据所属的主对话，再查看原稿。')
            const fs = sourceOwner.ctx.get('fs')
            const target = await fs.resolve(sourcePath, { cwd: sourceOwner.session.header.cwd })
            const bytes = await fs.readBytes(target, undefined, 64 * 1024 * 1024)
            const path = fs.processPath(target)
            const hash = createHash('sha256').update(bytes).digest('hex')
            const expected = evidence.sourceHash || state.coverage.find(row => row.locator === evidence.locator || row.locator.startsWith(sourcePath + '#'))?.version
            if (expected && /^[a-f0-9]{64}$/i.test(expected) && expected.toLowerCase() !== hash) throw new Error('当前原稿已变化，无法重现这条发现的旧版本出处，请先重新分析。')
            return send(200, { path, cwd: sourceOwner.session.header.cwd, locator: evidence.locator, versionVerified: !!expected })
          }
          const result = await readStatus(agent)
          const cursor = url.searchParams.get('cursor')
          const activity = cursor === null ? undefined : store.activity(result.task.sessionId, Number(cursor))
          return send(200, { ...result, capabilities: await service.catalogue(agent), ...(activity ? { cursor: activity.cursor, reset: activity.reset, changes: activity.changes } : { cursor: result.task.revision }) })
        }
        if (req.method !== 'POST') return send(405, { error: 'method not allowed' })
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(403, { error: 'foreign origin' })
        req.setEncoding('utf8')
        let text = ''
        for await (const chunk of req) { text += chunk; if (text.length > 2_000_000) return send(413, { error: 'Task update too large' }) }
        const input = JSON.parse(text)
        if (input.patch?.latestRequest !== undefined || input.patch?.latestMessageId !== undefined) throw new Error('任务消息来源只能由真实对话准入记录，不能由表单改写。')
        if (input.action === 'sync_project') {
          syncProject(store.read(rootSession(sessionId).id))
          return send(200, { ...await readStatus(agent), capabilities: await service.catalogue(agent) })
        }
        if (input.operationId) {
          const replay = store.replay(rootSession(sessionId).id, input.operationId, input.patch, 'user')
          if (replay) {
            if (replay.pendingProjectSync) syncProject(replay)
            return send(200, { ...await readStatus(agent), capabilities: await service.catalogue(agent) })
          }
        }
        const status = await readStatus(agent)
        const current = status.task
        if (input.patch?.deliverables?.some((row: any) => row.status === 'accepted' && current.deliverables.find(old => old.id === row.id)?.status !== 'accepted')) {
          if (input.revision !== current.revision) throw new Error('文件或任务已变化，请读取最新状态后验收。')
          if (status.verificationGaps.length) throw new Error('当前成果文件尚不能核验，请先恢复文件读取权限并重新检查。')
          for (const row of input.patch.deliverables.filter((row: any) => row.status === 'accepted')) {
            const existing = current.deliverables.find(old => old.id === row.id)
            if (!existing || JSON.stringify(row.checks) !== JSON.stringify(existing.checks) || row.path !== existing.path) throw new Error('请先由执行者检查当前真实文件，再由用户确认验收。')
          }
        }
        const patch = { ...input.patch }
        if (patch.brief) patch.briefProvenance = { ...current.briefProvenance, ...Object.fromEntries(Object.keys(patch.brief).filter(key => JSON.stringify(patch.brief[key]) !== JSON.stringify(current.brief[key])).map(key => [key, { origin: 'user', status: 'confirmed', updatedRevision: current.revision + 1 }])) }
        const briefChanged = patch.brief && JSON.stringify(patch.brief) !== JSON.stringify(current.brief)
        if (briefChanged && current.pendingProjectSync) throw new Error('请先完成上一次任务变更与项目要求的同步。')
        const project = briefChanged && current.binding && projectForBoundSession(current.binding.cwd!, current.sessionId)
        const correction = project ? { id: input.operationId || `correction:${current.revision}`, messageId: `task-correction:${input.operationId || current.revision}`, stageId: current.binding!.stageId || '', text: '用户在本次任务中修正：' + Object.keys(patch.brief).filter(key => JSON.stringify(patch.brief[key]) !== JSON.stringify(current.brief[key])).map(key => `${key}=${JSON.stringify(patch.brief[key])}`).join('；'), createdAt: new Date().toISOString() } : undefined
        if (project) setPendingTaskSync(current.binding!.cwd!, project, current.sessionId, correction)
        let task
        try { task = commit(sessionId, patch, input.revision, 'user', { operationId: input.operationId, operationPayload: input.patch, summary: '用户修正了共同任务记录' }) }
        catch (error) { if (project && !store.read(current.sessionId).pendingProjectSync) setPendingTaskSync(current.binding!.cwd!, project, current.sessionId); throw error }
        if (correction) task = syncProject(commit(current.sessionId, { pendingProjectSync: correction }, task.revision, 'host', { summary: '任务修正待同步到工作台要求' }))
        return send(200, { ...await readStatus(agent), capabilities: await service.catalogue(agent) })
      } catch (error) { return send(409, { error: String((error as Error).message) }) }
    } }))
  })
  return service
}
