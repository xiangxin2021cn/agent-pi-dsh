import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { BusinessProjectRecord } from '../../../packages/business-projects/index.ts'
import type { Coverage, Deliverable, Evidence, PlanStep, ProfessionalTask, TaskFinding, TaskRequirement } from '../../../packages/professional-tasks/types.ts'
import { collectStageReality, executionControlState, loadBoard } from '../../tender-host/src/orchestration.ts'
import { executionForSession } from '../../tender-host/src/execution-ledger.ts'
import { auditProjectCitations } from '../../tender-host/src/citations.ts'
import { usesTenderControlProfile, workflowFor } from '../../tender-host/src/modules.ts'
import { listSetupRestores, setupSourceStatus } from '../../tender-host/src/setup-restore.ts'
import { loadUserRequirementLedger } from '../../tender-host/src/user-requirements.ts'
import { loadEvidenceLedger } from '../../tender-host/src/structured-evidence.ts'
import { loadAnalysisCoverage } from '../../tender-host/src/analysis-coverage.ts'
import { loadWorkspace, workspacePaths } from '../../tender-host/src/workspace.ts'
import { CAPABILITY_FILE_NAMES, readJson } from '../../tender-host/src/fsutil.ts'
import { listOfficialOutputs, officialStageDir } from '../../tender-host/src/outputs.ts'
import { refreshStageMemorySnapshot } from '../../tender-host/src/stage-memory.ts'

const key = (path: string, cwd: string) => resolve(cwd, path).replace(/\\/g, '/').toLowerCase()
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const same = isDeepStrictEqual

export const isWorkbenchRecord = (id: string) => id.startsWith('workbench:')

/** Project ledgers remain authoritative; this projection never writes them or grants approval. */
export function projectTaskPatch(state: ProfessionalTask, cwd: string, project: BusinessProjectRecord) {
  const prefix = `workbench:${digest(`${key(cwd, cwd)}:${project.module}:${project.projectId}`).slice(0, 16)}:`
  const id = (kind: string, value: string) => `${prefix}${kind}:${value}`
  const board = loadBoard(cwd, project.projectId, project.module)
  const memory = refreshStageMemorySnapshot(cwd, project, { persist: false })
  const workflow = workflowFor(project)
  const ledger = loadUserRequirementLedger(cwd, project)
  const evidence: Evidence[] = [], coverage: Coverage[] = [], requirements: TaskRequirement[] = [], plan: PlanStep[] = [], findings: TaskFinding[] = []
  const sourceIds = new Map<string, string>(), sourceVersions = new Map<string, string>()
  const sourceStatuses = new Map<string, ReturnType<typeof setupSourceStatus>>()
  const restores = listSetupRestores(cwd, project.projectId)
  const projectArtifact = (path: string) => [cwd, project.rootPath].some(root => key(path, cwd).startsWith(`${key(root, cwd)}/`))
  const readableArtifact = (path: string) => {
    try { return projectArtifact(path) && statSync(resolve(cwd, path)).isFile() && statSync(resolve(cwd, path)).size > 0 }
    catch { return false }
  }
  for (const path of project.inputPaths) {
    const status = setupSourceStatus(cwd, project.projectId, path, restores)
    const sourceId = id('source', digest(key(path, cwd)).slice(0, 16))
    sourceIds.set(key(path, cwd), sourceId)
    if (status.sha256) sourceVersions.set(key(path, cwd), status.sha256)
    sourceStatuses.set(key(path, cwd), status)
    evidence.push({ id: sourceId, kind: 'source', title: basename(path), value: status.extracted ? '已登记原文件及与当前版本对应的可读解析资料；专业结论需复核。' : status.reason || '已登记，尚无可用解析资料。', status: 'unverified', locator: status.sourcePath, sourcePath: status.sourcePath, ...(status.sha256 ? { sourceHash: status.sha256 } : {}) })
    const checked = status.extracted && state.coverage.find(row => row.kind === 'file' && row.status === 'parsed' && row.review === 'reviewed' && key(row.locator, cwd) === key(path, cwd) && row.version === status.sha256)
    coverage.push({ id: id('coverage', digest(key(path, cwd)).slice(0, 16)), title: basename(path), kind: 'file', locator: status.sourcePath, version: status.sha256 || 'unavailable', status: status.extracted ? 'parsed' : existsSync(status.sourcePath) ? 'unreadable' : 'missing', review: checked ? 'reviewed' : 'pending' })
  }
  const locate = (source: any): string[] => {
    const path = source?.documentId && workspace?.documents.find(row => row.id === source.documentId)?.path
    const known = path && sourceIds.get(key(path, cwd))
    return known ? [known] : []
  }
  let workspace: ReturnType<typeof loadWorkspace> | undefined
  if (usesTenderControlProfile(project) && existsSync(workspacePaths(cwd, project.projectId).model)) workspace = loadWorkspace(cwd, project.projectId)
  for (const claim of loadEvidenceLedger(cwd, project.projectId, project.module).claims) {
    const path = project.inputPaths.find(path => key(path, cwd) === key(claim.sourceId, cwd))
    const valid = path && sourceVersions.get(key(path, cwd)) === claim.sourceHash
    evidence.push({ id: id('claim', claim.claimId), title: claim.claim, value: claim.quote, kind: 'source', status: valid ? 'verified' : 'unverified', applicable: !!valid, locator: [claim.internalLocator, claim.section, claim.page ? `page ${claim.page}` : ''].filter(Boolean).join('；'), ...(path ? { sourcePath: resolve(cwd, path), sourceHash: claim.sourceHash } : {}) })
  }
  for (const row of ledger.requirements.filter(row => row.status !== 'dismissed')) requirements.push({ id: id('user-requirement', row.id), title: row.text, kind: 'acceptance', mandatory: true, evidenceIds: [] })
  for (const row of workspace?.requirements || []) requirements.push({ id: id('requirement', row.id), title: `${row.title}：${row.text}`, kind: 'condition', mandatory: row.type === 'mandatory' || row.type === 'qualification', evidenceIds: locate(row.source) })
  for (const row of workspace?.criteria || []) requirements.push({ id: id('criterion', row.id), title: row.title, kind: 'score', mandatory: row.method !== 'weighted', evidenceIds: locate(row.source) })
  for (const row of workspace?.deliverables || []) requirements.push({ id: id('returnable', row.id), title: row.title, kind: 'returnable', mandatory: true, evidenceIds: [] })
  let previous: string | undefined
  for (const stage of workflow.stages) {
    const slice = board.stages[stage.id]
    const unresolvedSources = stage.id === workflow.setupStageId ? [...sourceStatuses.values()].filter(row => !row.extracted) : []
    const stale = memory.stages[stage.id]?.status === 'stale'
    const approvalMissing = !!stage.approvalGate && slice?.approval?.decision !== 'approved'
    const status: PlanStep['status'] = stale || unresolvedSources.length ? 'needs_review' : slice?.status === 'done' ? approvalMissing ? 'needs_review' : 'done' : slice?.status === 'blocked' ? 'blocked' : slice?.status === 'running' ? 'working' : 'pending'
    plan.push({ id: id('stage', stage.id), title: stage.labelZh, capabilityIds: (stage.consumes || []).filter(row => row.kind === 'capability').map((row: any) => row.capability), dependsOn: previous ? [previous] : [], evidenceIds: [], requirementIds: ledger.requirements.filter(row => row.stageId === stage.id && row.status !== 'dismissed').map(row => id('user-requirement', row.id)), status, gaps: [...(slice?.blockedReason ? [slice.blockedReason] : []), ...(stale ? [memory.stages[stage.id].staleReason || '已批准阶段的实际成果或依据已变化，需要按当前版本复核并重新确认。'] : []), ...(approvalMissing && slice?.status === 'done' ? ['等待用户在主对话或专业工作台明确批准该阶段。'] : []), ...unresolvedSources.map(row => `${basename(row.sourcePath)}：${row.reason || '未完成解析'}`)], supplements: [], briefDependencies: [] })
    previous = id('stage', stage.id)
    for (const task of slice?.tasks || []) {
      const source = task.sourcePath && sourceStatuses.get(key(task.sourcePath, cwd))
      plan.push({ id: id('stage-task', `${stage.id}:${task.id}`), title: task.title, capabilityIds: [], dependsOn: [], evidenceIds: task.sourcePath && sourceIds.has(key(task.sourcePath, cwd)) ? [sourceIds.get(key(task.sourcePath, cwd))!] : [], requirementIds: [], status: task.status === 'done' ? source && !source.extracted ? 'needs_review' : 'done' : task.status === 'running' ? 'working' : task.status === 'error' ? 'blocked' : 'pending', gaps: [task.error, source && !source.extracted ? source.reason : undefined].filter(Boolean) as string[], supplements: [], briefDependencies: [] })
    }
  }
  const execution = executionForSession(cwd, project, state.sessionId)
  if (execution) {
    const reality = board.currentStageId && collectStageReality(cwd, project, board.currentStageId, board, auditProjectCitations(cwd, project, { persist: false }))
    const control = executionControlState(cwd, project, state.sessionId, { generatedAt: '', stages: reality ? [reality] : [] })
    const missingFiles = execution.plan.flatMap(row => row.artifactPaths || []).filter(path => !readableArtifact(path))
    const differences = [...(execution.stageId !== board.currentStageId ? ['执行记录对应的阶段与工作台当前阶段不同。'] : control.differences), ...(missingFiles.length ? [`执行记录声明的 ${missingFiles.length} 份成果尚未在项目目录核实：${missingFiles.slice(0, 3).join('；')}`] : [])]
    const executionStatus: PlanStep['status'] = differences.length && execution.status === 'completed' ? 'needs_review' : execution.status === 'working' ? 'working' : execution.status === 'completed' ? 'done' : ['failed', 'blocked'].includes(execution.status) ? 'blocked' : 'pending'
    plan.push({ id: id('execution', 'current'), title: execution.currentBatch || execution.objective || '当前执行记录', capabilityIds: [], dependsOn: [], evidenceIds: [], requirementIds: [], status: executionStatus, gaps: [...differences, ...(execution.blocker.reason ? [execution.blocker.reason] : [])], supplements: [execution.nextAction, execution.blocker.needed].filter(Boolean) as string[], briefDependencies: [] })
    for (const row of execution.plan || []) {
      const gaps = (row.artifactPaths || []).filter(path => !readableArtifact(path)).map(path => `尚未核实声明的项目成果：${path}`)
      plan.push({ id: id('execution', `plan:${row.id}`), title: row.title, capabilityIds: [], dependsOn: [], evidenceIds: [], requirementIds: [], status: row.status === 'in_progress' ? 'working' : row.status === 'done' ? gaps.length ? 'needs_review' : 'done' : row.status === 'blocked' ? 'blocked' : 'pending', gaps, supplements: row.artifactPaths || [], briefDependencies: [] })
    }
    for (const row of execution.assignments || []) plan.push({ id: id('execution', `assignment:${row.id}`), title: row.title, capabilityIds: [], dependsOn: [], evidenceIds: [], requirementIds: [], status: row.status === 'running' ? 'working' : row.status === 'done' ? 'done' : row.status === 'failed' ? 'blocked' : 'pending', gaps: [], supplements: row.expectedOutput ? [row.expectedOutput] : [], briefDependencies: [] })
  }
  const finding = (row: Omit<TaskFinding, 'createdRevision' | 'updatedRevision' | 'status'>) => {
    const old = state.findings.find(value => value.id === row.id)
    const unchanged = old && old.summary === row.summary && same(old.evidenceIds, row.evidenceIds)
    findings.push({ ...row, status: unchanged ? old.status : 'open', ...(unchanged && old.resolution ? { resolution: old.resolution } : {}), createdRevision: old?.createdRevision ?? state.revision + 1, updatedRevision: old?.updatedRevision ?? state.revision + 1, source: { engine: 'workbench' } })
  }
  const domainLedger = usesTenderControlProfile(project) && loadAnalysisCoverage(cwd, project.projectId)
  for (const domain of domainLedger && domainLedger.domains || []) {
    if (!domain.conclusion.trim()) continue
    finding({ id: id('domain', domain.domain), title: domain.labelZh, summary: domain.conclusion, goalImpact: `该分析直接关系到「${domain.labelZh}」的任务判断${domain.humanConfirmationRequired ? '，需要用户确认关键决策条件。' : '，相关结论应落实到计划与交付检查。'}`, evidenceIds: domain.evidenceClaimIds.map(value => id('claim', value)).filter(value => evidence.some(row => row.id === value)), importance: domain.humanConfirmationRequired ? 'critical' : 'normal' })
  }
  if (workspace) {
    const paths = workspacePaths(cwd, project.projectId)
    for (const [capability, name] of Object.entries(CAPABILITY_FILE_NAMES)) {
      const path = join(paths.packs, `${name}.json`)
      if (!existsSync(path)) continue
      const pack: any = readJson(path, null)
      if (!pack || pack.projectId !== project.projectId || pack.capability !== capability || !pack.data) continue
      const modelId = id('model', capability)
      evidence.push({ id: modelId, title: `${capability} 模型记录`, value: `工作台模型版本 ${pack.revision}；项目数据版本 ${pack.coreRevision}。模型内容与实际项目依据仍需专业复核。`, kind: 'source', status: 'unverified', locator: path, sourcePath: path, sourceHash: digest(readFileSync(path, 'utf8')) })
      if (capability === 'document_analysis') for (const section of pack.data.sections || []) {
        if (!section.summary?.trim() || (section.kind !== 'risk_gap' && section.status !== 'blocked')) continue
        finding({ id: id('analysis', section.id), title: section.title, summary: section.summary, goalImpact: '该风险或资料缺口影响项目判断；相关条件查清前，应保留结论的适用限制。', evidenceIds: [...new Set([modelId, ...(section.sourceRefs || []).flatMap(locate)])], stepIds: [id('stage', 'tender-document-analysis')].filter(value => plan.some(row => row.id === value)), importance: section.status === 'blocked' ? 'critical' : 'normal', actions: [{ label: '查看分析模型', kind: 'source', target: modelId }] })
      }
      const auditPath = join(paths.packs, `${name}.audit.json`)
      const audit: any = readJson(auditPath, null)
      const groups = new Map<string, any[]>()
      for (const issue of audit?.issues || []) {
        if (!issue.message?.trim()) continue
        const key = `${issue.code}:${issue.severity}`
        const rows = groups.get(key) || []
        rows.push(issue)
        groups.set(key, rows)
      }
      if (groups.size) evidence.push({ id: id('audit', capability), title: `${capability} 检查清单`, value: `工作台保存的实际检查清单，共 ${audit.issues.length} 项；单项实体、错误及警告见原始清单。`, kind: 'source', status: 'unverified', locator: auditPath, sourcePath: auditPath, sourceHash: digest(readFileSync(auditPath)) })
      for (const [key, issues] of groups) {
        const issue = issues[0]
        finding({ id: id('model-check', `${capability}:${key}`), title: `${capability}：${issue.code}（${issues.length} 项）`, summary: `此类检查共 ${issues.length} 项。代表记录：${issues.slice(0, 3).map(row => `${row.entityId || row.entityType || ''}：${row.message}`).join('；')}。完整逐项清单见检查依据。`, goalImpact: issue.severity === 'error' ? '该检查尚未满足，受影响的阶段与成果需要处理后才能确认交付。' : '该检查提示需要专业判断，并在相关交付中说明限制。', evidenceIds: [modelId, id('audit', capability)], importance: issue.severity === 'error' ? 'critical' : 'normal', actions: [{ label: '查看完整检查清单', kind: 'source', target: id('audit', capability) }] })
      }
    }
  }
  const artifactPaths = new Set(listOfficialOutputs(cwd, project.projectId, project.module).items.map(row => row.dest))
  for (const path of execution?.plan.flatMap(row => row.artifactPaths || []) || []) if (readableArtifact(path)) artifactPaths.add(resolve(cwd, path))
  for (const path of ledger.requirements.flatMap(row => row.evidencePaths || [])) if (readableArtifact(path)) artifactPaths.add(resolve(cwd, path))
  for (const stage of workflow.stages) {
    for (const row of board.stages[stage.id]?.tasks || []) if (row.markdownPath) artifactPaths.add(row.markdownPath)
    if (stage.summaryDeliverable) artifactPaths.add(join(officialStageDir(cwd, project.projectId, stage.id), stage.summaryDeliverable.fileName))
  }
  const deliverables: Deliverable[] = []
  for (const path of [...artifactPaths].sort()) {
    if (!existsSync(path) || !statSync(path).isFile() || !statSync(path).size) continue
    // Setup transcriptions are source coverage, not final customer deliverables.
    if ([...sourceStatuses.values()].some(row => row.restore && key(row.restore.manuscriptPath, cwd) === key(path, cwd))) continue
    const old = state.deliverables.find(row => key(row.path, cwd) === key(path, cwd))
    const fingerprint = digest(readFileSync(path))
    const previous = (old?.checks || []).find(row => row.kind === 'file')?.fingerprint
    const responses = workspace?.responses.filter(row => row.evidenceArtifacts?.some(value => key(value, cwd) === key(path, cwd))) || []
    const requirementIds = [...new Set([...(old?.requirementIds || []), ...ledger.requirements.filter(row => row.status !== 'dismissed' && row.evidencePaths?.some(value => key(value, cwd) === key(path, cwd))).map(row => id('user-requirement', row.id)), ...responses.flatMap(row => [...row.requirementIds.map(value => id('requirement', value)), ...row.criterionIds.map(value => id('criterion', value)), ...(row.deliverableId ? [id('returnable', row.deliverableId)] : [])])])].filter(value => state.requirements.some(row => row.id === value) || requirements.some(row => row.id === value))
    const evidenceIds = [...new Set([...(old?.evidenceIds || []), ...responses.flatMap(row => row.evidenceRefs.flatMap(locate))])]
    const stepIds = [...new Set([...(old?.stepIds || []), ...(execution?.plan.filter(row => row.artifactPaths?.some(value => key(value, cwd) === key(path, cwd))).map(row => id('execution', `plan:${row.id}`)) || [])])]
    deliverables.push(old ? { ...old, title: old.title || basename(path), requirementIds, evidenceIds, stepIds, checks: old.checks || [], ...(previous && previous !== fingerprint ? { status: 'stale', signature: old.signature === 'signed' ? 'pending' : old.signature, checks: [] } : {}) } : { id: id('artifact', digest(key(path, cwd)).slice(0, 16)), title: basename(path), path, status: 'draft', signature: 'not_required', requirementIds, evidenceIds, stepIds, checks: [{ kind: 'file', status: 'passed', detail: '已读取工作台实际成果文件；内容、响应性与签署仍需检查。', fingerprint }] })
  }
  const replace = <T extends { id: string }>(current: T[], projected: T[], retire: (row: T) => T) => [...current.filter(row => !row.id.startsWith(prefix) && !projected.some(value => value.id === row.id)), ...projected, ...current.filter(row => row.id.startsWith(prefix) && !projected.some(value => value.id === row.id)).map(retire)]
  const previousCoverage = state.coverage.map(row => !row.id.startsWith(prefix) && row.kind === 'file' && (project.inputPaths.some(path => key(row.locator.split('#')[0], cwd) === key(path, cwd) || basename(row.title) === basename(path)) || restores.some(restore => key(row.locator.split('#')[0], cwd) === key(restore.manuscriptPath, cwd))) ? { ...row, status: 'superseded' as const } : row)
  const previousFindings = state.findings.filter(row => !row.id.startsWith(`${prefix}model-issue:`))
  const patch = { evidence: replace(state.evidence, evidence, row => ({ ...row, status: 'unverified' })), coverage: replace(previousCoverage, coverage, row => ({ ...row, status: 'superseded' })), requirements: replace(state.requirements, requirements, row => ({ ...row, mandatory: false })), plan: replace(state.plan, plan, row => ({ ...row, status: 'needs_review' })), findings: replace(previousFindings, findings, row => ({ ...row, status: 'superseded' })), deliverables: replace(state.deliverables, deliverables, row => ({ ...row, status: 'stale', signature: row.signature === 'signed' ? 'pending' : row.signature, checks: [] })) }
  return Object.fromEntries(Object.entries(patch).filter(([field, rows]) => !same(rows, state[field as keyof ProfessionalTask])))
}
