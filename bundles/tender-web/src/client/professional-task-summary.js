import { renderTenderResponseCoverage } from './tender-response-panel.js'

export const professionalTaskSummaryCss = `
.ap-task-summary{border:1px solid var(--border,#d5dae1);border-radius:10px;margin:12px 16px;padding:12px 14px;background:var(--bg-primary,#fff);font-size:13px;color:var(--text-primary,#273240);min-width:0;max-height:min(36vh,320px);overflow:auto;flex-shrink:0}.ap-task-summary-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ap-task-summary h3{font-size:14px;margin:0 0 6px}.ap-task-summary p{margin:5px 0;line-height:1.55;overflow-wrap:anywhere}.ap-task-summary button,.ap-task-finding button{font:inherit;padding:5px 9px;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;cursor:pointer}.ap-task-summary-muted{color:var(--text-secondary,#687280);font-size:12px}.ap-task-summary-facts{display:flex;gap:8px 14px;flex-wrap:wrap}.ap-task-finding{border:1px solid var(--border,#d5dae1);border-radius:8px;margin:10px 0;padding:12px}.ap-task-finding[data-importance=critical]{border-left:3px solid var(--accent,#285c7b)}.ap-task-finding h4{font-size:14px;margin:0 0 7px}.ap-task-finding p{margin:5px 0;line-height:1.55;overflow-wrap:anywhere}.ap-task-finding-sources,.ap-task-finding-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ap-task-finding a{color:var(--accent,#285c7b)}.ap-task-finding-resolved{opacity:.8}.ap-task-summary pre{white-space:pre-wrap;overflow-wrap:anywhere}.ap-task-summary .ap-task-finding{margin-bottom:0}.ap-task-summary-empty{margin:0;color:var(--text-secondary,#687280)}.ap-task-stage-controls{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.ap-task-stage-review{width:100%;padding:10px;border:1px solid var(--border,#d5dae1);border-radius:8px}.ap-task-stage-review button{margin-right:8px}.ap-task-stage-controls button:disabled{opacity:.5;cursor:default}
@media(max-width:600px){.ap-task-summary{margin:8px;padding:10px}.ap-task-summary-head{flex-wrap:wrap}}
`

export function visibleTaskFindings(task, includeResolved = false) {
  const latest = new Map()
  for (const row of task?.findings || []) {
    if (!row?.id) continue
    const previous = latest.get(row.id)
    if (!previous || (row.updatedRevision || 0) >= (previous.updatedRevision || 0)) latest.set(row.id, row)
  }
  return [...latest.values()].filter((row) => includeResolved || row.status === 'open').sort((a,b) =>
    Number(b.status === 'open') - Number(a.status === 'open') || Number(b.importance === 'critical') - Number(a.importance === 'critical') || (b.updatedRevision || 0) - (a.updatedRevision || 0))
}

export function taskOverviewModel(task) {
  const allCoverage = (task?.coverage || []).filter((row) => row.status !== 'superseded')
  const registeredSources = allCoverage.filter(row=>row.id?.startsWith('workbench:')&&row.kind==='file')
  const coverage = task?.binding&&registeredSources.length ? registeredSources : allCoverage
  const questions = (task?.questions || []).filter((row) => !row.answer && !['answered','expired','cancelled'].includes(row.status))
  const workbenchPlan = (task?.plan || []).filter(row=>row.id?.startsWith('workbench:'))
  const activePlan = task?.binding&&workbenchPlan.length ? workbenchPlan : task?.plan || []
  const currentExecution = activePlan.find(row=>row.id?.endsWith(':execution:current')&&['working','blocked','needs_review'].includes(row.status))
  const currentStep = currentExecution || activePlan.find((row) => row.status === 'working') || activePlan.find((row) => row.status === 'blocked' || row.status === 'needs_review')
  return {
    objective: task?.brief?.objective || '', questions, currentStep,
    constraints: (task?.directives || []).filter(row=>row.status==='active'&&['constraint','correction','scope'].includes(row.kind)),
    corrections: (task?.directives || []).filter(row=>['correction','revocation'].includes(row.kind)).slice(-8).reverse(),
    coverage: { total: coverage.length, parsed: coverage.filter((row) => row.status === 'parsed').length, reviewed: coverage.filter((row) => row.review === 'reviewed').length, unreadable: coverage.filter((row) => row.status === 'unreadable').length, missing: coverage.filter((row) => row.status === 'missing').length },
    delivery: { total: task?.deliverables?.length || 0, accepted: (task?.deliverables || []).filter((row) => row.status === 'accepted').length, stale: (task?.deliverables || []).filter((row) => row.status === 'stale').length },
    depthEnabled: !!task?.quality?.enabled,
    findings: visibleTaskFindings(task),
    changes: [...(task?.recentChanges || [])].sort((a,b) => (b.sequence || 0) - (a.sequence || 0)),
  }
}

export function sourceReference(h, evidence, onOpenSource, locale = 'zh') {
  const title = evidence?.title || evidence?.id || (String(locale).startsWith('zh') ? '查看依据' : 'View source')
  if (onOpenSource && (evidence?.locator || evidence?.url)) return h('button', { key: evidence.id, type:'button', onClick: () => onOpenSource(evidence), title: evidence.locator || evidence.url }, title)
  if (/^https?:\/\//i.test(evidence?.url || '')) return h('a', { key: evidence.id, href:evidence.url, target:'_blank', rel:'noopener noreferrer' }, title)
  return h('span', { key:evidence?.id, className:'ap-task-summary-muted' }, title, evidence?.locator ? ` · ${evidence.locator}` : '')
}

export function renderTaskFindings(h, task, locale, onOpenSource, { includeResolved = false, limit, onOpenChat } = {}) {
  const zh = String(locale || '').startsWith('zh')
  const evidence = new Map((task?.evidence || []).map((row) => [row.id,row]))
  const rows = visibleTaskFindings(task, includeResolved)
  return (limit ? rows.slice(0,limit) : rows).map((row) => h('article', { key:row.id, className:`ap-task-finding${row.status !== 'open' ? ' ap-task-finding-resolved' : ''}`, 'data-finding-id':row.id, 'data-importance':row.importance || 'normal' },
    h('h4', null, row.title),
    h('p', null, row.summary),
    h('p', null, h('strong', null, zh ? '对当前目标的影响：' : 'Impact on this goal: '), row.goalImpact),
    h('div', { className:'ap-task-finding-sources' }, h('span', { className:'ap-task-summary-muted' }, zh ? '依据：' : 'Sources: '), ...(row.evidenceIds || []).map((id) => sourceReference(h,evidence.get(id) || {id},onOpenSource,locale))),
    (row.actions || []).length > 0 && h('div', { className:'ap-task-finding-actions' }, h('span', { className:'ap-task-summary-muted' }, zh ? '下一步：' : 'Next: '), ...row.actions.map((action,index) => {
      if (action.kind === 'source' && evidence.has(action.target)) return sourceReference(h,evidence.get(action.target),onOpenSource,locale)
      if (action.kind === 'question' && onOpenChat) return h('button', { key:action.id || index, type:'button', onClick:onOpenChat }, action.label)
      return h('span', { key:action.id || index }, action.label)
    })),
    row.resolution && h('p', null, zh ? '处理结果：' : 'Resolution: ', row.resolution),
    row.status !== 'open' && h('p', { className:'ap-task-summary-muted' }, row.status === 'resolved' ? (zh ? '已处理' : 'Resolved') : (zh ? '已被后续发现替代' : 'Superseded')),
  ))
}

export function createTaskStageControls({ React, api, cwd, language, onOpenWorkbench }) {
  const h = React.createElement
  return function TaskStageControls({ sessionId, task, binding, onChanged }) {
    const [review,setReview] = React.useState(null), [busy,setBusy] = React.useState(false), [error,setError] = React.useState(''), [approved,setApproved] = React.useState(false)
    const zh = String(language?.() || 'zh').startsWith('zh')
    React.useEffect(() => {setReview(null);setError('');setApproved(false)},[sessionId,binding?.projectId,binding?.stageId])
    if (!binding?.projectId) return null
    const approve = async () => {
      if (!review?.binding?.approvalFingerprint || busy || binding.canApprove===false || task?.pendingProjectSync) return
      setBusy(true);setError('')
      try {
        await api('/api/agent-pi/stage',review.binding.cwd || cwd(),{method:'POST',body:JSON.stringify({action:'approve_gate',module:review.binding.moduleId,projectId:review.binding.projectId,stageId:review.binding.stageId,sessionId,approvalFingerprint:review.binding.approvalFingerprint})})
        setApproved(true);setReview(null);await onChanged?.()
      } catch(e) {setError(e.message)} finally {setBusy(false)}
    }
    return h('div',{className:'ap-task-stage-controls'},
      onOpenWorkbench&&h('button',{type:'button',onClick:()=>onOpenWorkbench(binding,sessionId)},approved?(zh?'前往工作台继续':'Continue in the workbench'):(zh?'查看工作台阶段':'View workbench stage')),
      approved&&h('p',{role:'status',className:'ap-task-summary-muted'},zh?'阶段批准已记录，可前往工作台继续当前项目。':'Stage approval was recorded. Continue this project in the workbench.'),
      error&&!review&&h('p',{role:'alert'},error),
      binding.approvalGate&&(binding.canApprove===false||binding.waitingHuman!==false)&&h('button',{type:'button',disabled:busy||binding.canApprove===false,title:binding.approvalReason,onClick:()=>{setReview({binding:structuredClone(binding),task:structuredClone(task)});setError('')}},zh?'查看并批准当前阶段':'Review and approve current stage'),
      binding.approvalGate&&binding.canApprove===false&&binding.approvalReason&&h('p',{className:'ap-task-summary-muted'},binding.approvalReason),
      review&&h('div',{className:'ap-task-stage-review',role:'region','aria-label':zh?'阶段审批确认':'Stage approval confirmation'},
        h('h4',null,zh?'确认本阶段的成果与范围':'Confirm the results and scope of this stage'),
        h('p',null,(zh?'项目总目标：':'Project goal: ')+(review.binding.projectGoal || '')),
        h('p',null,(zh?'当前阶段：':'Current stage: ')+(review.binding.stageLabel || review.binding.stageId)),
        h('p',null,(zh?'本次任务：':'Current task: ')+(review.task?.brief?.objective || '')),
        ...(review.binding.approvalDeliverables || review.task?.deliverables || []).map(row=>h('div',{key:row.id || row.path},h('p',null,(row.title || row.path?.split(/[\\/]/).pop() || row.id)+' · '+row.path+(row.status?' · '+row.status:'')),...(row.checks || []).map((check,index)=>h('p',{key:index,className:'ap-task-summary-muted'},(check.kind || check.title || '')+' · '+check.status+' · '+(check.detail || ''))))),
        review.task?.pendingProjectSync&&h('p',{role:'alert'},zh?'用户需求尚未完整同步，暂不能批准。':'User requirements are not fully synchronized; approval is unavailable.'),
        error&&h('p',{role:'alert'},error),
        h('button',{type:'button',disabled:busy||binding.canApprove===false||!review.binding.approvalFingerprint||!!task?.pendingProjectSync,onClick:approve},zh?'确认批准此阶段':'Confirm approval of this stage'),
        h('button',{type:'button',disabled:busy,onClick:()=>setReview(null)},zh?'返回核对':'Return to review'),
      ),
    )
  }
}

export function createProfessionalTaskSummary({ React, api, cwd, language, subscribe, onOpenTask, onOpenSource, onOpenWorkbench, onTask }) {
  const h = React.createElement
  const StageControls = createTaskStageControls({React,api,cwd,language,onOpenWorkbench})
  return function ProfessionalTaskSummary({ sessionId, taskResult, binding, onOpenTask: openTask, visible = true }) {
    const [result,setResult] = React.useState(null)
    const revision = React.useRef(-1)
    React.useEffect(() => {
      setResult(null)
      revision.current=-1
      if (taskResult) {revision.current=taskResult.task.revision;onTask?.(sessionId,taskResult.task,taskResult.binding)}
      if (!sessionId || taskResult) return
      const controller = new AbortController()
      let loading = false, pending = false
      const refresh = async () => {
        if (loading) {pending=true;return}
        pending=false
        loading = true
        try {
          const next = await api(`/api/agent-pi/professional-task?sessionId=${encodeURIComponent(sessionId)}`,cwd(),{signal:controller.signal})
          if (!controller.signal.aborted && next.task.revision >= revision.current) {revision.current=next.task.revision;setResult(next);onTask?.(sessionId,next.task,next.binding)}
        } catch {} finally { loading = false;if(pending&&!controller.signal.aborted)void refresh() }
      }
      void refresh()
      const timer = setInterval(refresh,5000)
      const dispose = subscribe?.(sessionId,refresh)
      return () => { controller.abort();clearInterval(timer);dispose?.() }
    },[sessionId,taskResult])
    const task = (taskResult || result)?.task
    if (!visible || !task) return null
    const model = taskOverviewModel(task)
    const responseCoverage = (taskResult || result)?.responseCoverage
    if (!model.objective && !model.questions.length && !model.findings.length && !task.latestRequest && !model.depthEnabled && !responseCoverage) return null
    const locale = language?.() || 'zh', zh = locale.startsWith('zh')
    const project = binding || (taskResult || result)?.binding || task.binding
    const openSource = onOpenSource ? (evidence)=>onOpenSource(evidence,sessionId) : undefined
    const goalStatus = task.briefProvenance?.objective?.status
    const open = openTask || onOpenTask
    return h('section', { className:'ap-task-summary', 'aria-label':zh ? '共同任务理解' : 'Shared task understanding', 'data-task-revision':task.revision },
      h('div', { className:'ap-task-summary-head' }, h('div', null, h('h3', null, zh ? '本次目标' : 'Current goal'), h('p', null, model.objective || (zh ? '正在结合你的表达和资料整理目标。' : 'Understanding your goal from the conversation and materials.')), goalStatus && h('span', { className:'ap-task-summary-muted' }, goalStatus === 'provisional' || goalStatus === 'conflict' ? (zh ? '暂定理解，可在对话中纠正' : 'Provisional; correct this in the conversation') : (zh ? '来自当前任务要求' : 'From the current task requirements'))), open && h('button', { type:'button', onClick:() => open(sessionId) }, zh ? '查看本次任务' : 'View current task')),
      project && h('p', { className:'ap-task-summary-muted' }, project.projectGoal ? `${zh ? '项目总目标：' : 'Project goal: '}${project.projectGoal} · ` : '', project.stageLabel || project.stageId || ''),
      project && h(StageControls,{sessionId,task,binding:project,onChanged:async()=>{const next=await api(`/api/agent-pi/professional-task?sessionId=${encodeURIComponent(sessionId)}`,cwd());revision.current=next.task.revision;setResult(next);onTask?.(sessionId,next.task,next.binding)}}),
      h('div', { className:'ap-task-summary-facts' }, model.currentStep && h('span', null, `${zh ? '正在解决：' : 'Current focus: '}${model.currentStep.title}`), model.questions.length > 0 && h('span', null, `${model.questions.length}${zh ? ' 个问题待明确' : ' questions to clarify'}`), h('span', { className:'ap-task-summary-muted' }, model.depthEnabled ? (zh ? '专业深度已启用' : 'Professional depth on') : (zh ? '基础专业检查' : 'Core professional checks'))),
      model.constraints.length>0&&h('p',{className:'ap-task-summary-muted'},zh?'当前约束：':'Current constraints: ',model.constraints.slice(-3).map(row=>row.text.length>120?row.text.slice(0,120)+'…':row.text).join('；'),model.constraints.length>3?(zh?'；更多约束见本次任务。':'; More in Current task.'):''),
      model.corrections[0]&&h('p',{className:'ap-task-summary-muted'},zh?'最近明确修正：':'Latest explicit correction: ',model.corrections[0].text.length>160?model.corrections[0].text.slice(0,160)+'…':model.corrections[0].text),
      (model.coverage.total>0||model.delivery.total>0)&&h('div',{className:'ap-task-summary-facts'},
        model.coverage.total>0&&h('span',null,`${zh?'资料抽取：':'Source extraction: '}${model.coverage.parsed}/${model.coverage.total}`),
        model.coverage.total>0&&h('span',null,`${zh?'专业复核：':'Professional review: '}${model.coverage.reviewed}/${model.coverage.total}`),
        model.delivery.total>0&&h('span',null,`${zh?'成果登记：':'Registered deliverables: '}${model.delivery.total}`)),
      renderTenderResponseCoverage(h,responseCoverage,{locale,compact:true,onOpenTask:open?()=>open(sessionId):undefined}),
      ...renderTaskFindings(h,task,locale,openSource,{limit:3}),
      model.findings.length > 3 && h('p', { className:'ap-task-summary-muted' }, `${zh ? '另有 ' : 'Plus '}${model.findings.length - 3}${zh ? ' 项发现，可在本次任务中查看。' : ' findings in Current task.'}`),
      model.changes[0]?.summary && h('p', { className:'ap-task-summary-muted' }, `${zh ? '最近调整：' : 'Latest adjustment: '}${model.changes[0].summary}`),
    )
  }
}
