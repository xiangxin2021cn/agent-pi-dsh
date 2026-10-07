import { localizeCapability } from './capability-labels.js'
import { createEngineeringPanel } from './engineering-panel.js'
import { createTaskStageControls, renderTaskFindings, sourceReference, taskOverviewModel } from './professional-task-summary.js'
import { renderTenderResponseCoverage } from './tender-response-panel.js'

export const taskGuideCss = `
.ap-task-guide{position:relative;width:100%;height:100%;min-height:0;min-width:0;box-sizing:border-box;padding-bottom:var(--dsh-composer-height,180px);background:var(--bg-primary,#fff);color:var(--text-primary,#273240);display:flex;flex-direction:column;font-size:14px}
.ap-task-guide header,.ap-task-guide footer{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border,#d5dae1)}
.ap-task-guide header h2{margin:0;font-size:18px}.ap-task-guide nav{display:flex;gap:6px;padding:12px 24px;flex-wrap:wrap}.ap-task-guide button{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;padding:7px 12px;cursor:pointer}.ap-task-guide button[aria-selected=true]{background:var(--accent,#285c7b);color:#fff}.ap-task-guide button:disabled{opacity:.5;cursor:default}
.ap-task-guide main{padding:8px 24px 24px;overflow:auto;flex:1}.ap-task-guide label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.ap-task-guide input,.ap-task-guide textarea,.ap-task-guide select{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;padding:9px;background:var(--bg-secondary,#fafbfc);color:inherit;width:100%;box-sizing:border-box}.ap-task-guide textarea{min-height:75px;resize:vertical}.ap-task-guide p{line-height:1.6}.ap-task-guide article{border:1px solid var(--border,#d5dae1);border-radius:8px;padding:12px 16px;margin:12px 0}.ap-task-guide article h3{font-size:15px;margin:0 0 8px}.ap-task-guide article p{margin:6px 0;overflow-wrap:anywhere}.ap-task-guide .ap-guide-muted{color:var(--text-secondary,#687280);font-size:12px}.ap-task-guide .ap-guide-error{color:#b74434}.ap-task-guide footer{border-top:1px solid var(--border,#d5dae1);border-bottom:0}.ap-task-guide pre{white-space:pre-wrap;overflow-wrap:anywhere}.ap-guide-progress{display:flex;gap:8px 20px;flex-wrap:wrap}.ap-guide-objective{font-size:18px;line-height:1.6}
@media(max-width:600px){.ap-task-guide header,.ap-task-guide footer{padding:12px 16px}.ap-task-guide main{padding:4px 16px 20px}.ap-task-guide nav{padding:10px 16px}.ap-task-guide footer{flex-wrap:wrap}}
`

const labels = {
  zh: { title:'本次任务', close:'返回对话', overview:'任务概览', goal:'修正目标', basis:'项目依据', plan:'执行计划', capabilities:'可用能力', delivery:'交付检查', objective:'本次要完成什么', scope:'工作范围与边界', audience:'成果给谁使用', formats:'输出格式（逗号分隔）', language:'交付语言', deadline:'期限', profession:'专业方向', country:'项目国家/地区', location:'项目地点', employer:'业主/委托方', procurement:'采购体系', funding:'资金来源', contract:'合同及版本', measurement:'计量计价依据', standards:'已登记规范', webDiligence:'公共网络尽调', save:'保存修正', saving:'正在保存…', refresh:'读取最新状态', saved:'已保存，后续执行将采用本次需求。', waiting:'尚未登记执行计划。明确任务后，智能体会评估能力并按依赖推进。', noTask:'此对话尚未就绪，请先开始对话。', missing:'待补足', ready:'已通过登记的交付检查', review:'仍有待复核事项', accepted:'客户已验收', accept:'确认验收全部成果', signature:'确认此文件已签署/授权', signatures:'待签署/授权', source:'来源覆盖', evidence:'证据状态', unanswered:'待明确的问题', empty:'尚未登记', reminder:'通过主对话理解目标、补充资料和调整方向；这里持续记录共同理解、执行发现与交付检查。' },
  en: { title:'Current task', close:'Return to conversation', overview:'Task overview', goal:'Correct goal', basis:'Project basis', plan:'Execution plan', capabilities:'Capabilities', delivery:'Delivery checks', objective:'What should this task accomplish?', scope:'Scope and boundaries', audience:'Audience', formats:'Output formats (comma separated)', language:'Delivery language', deadline:'Deadline', profession:'Professional field', country:'Project country/region', location:'Project location', employer:'Employer/client', procurement:'Procurement system', funding:'Funding source', contract:'Contract and version', measurement:'Measurement and pricing basis', standards:'Registered standards', webDiligence:'Public web diligence', save:'Save corrections', saving:'Saving…', refresh:'Read latest state', saved:'Saved. Subsequent execution will use this brief.', waiting:'No execution plan yet. Once the brief is clear, the agent will assess capabilities and follow dependencies.', noTask:'This conversation is not ready. Start a conversation first.', missing:'Gaps to resolve', ready:'Registered delivery checks passed', review:'Review items remain', accepted:'Customer accepted', accept:'Accept all deliverables', signature:'Confirm this file is signed/authorized', signatures:'Signature/authorization pending', source:'Source coverage', evidence:'Evidence status', unanswered:'Open questions', empty:'Not registered', reminder:'Use the main conversation to explain your goal, provide materials and adjust direction. This view records shared understanding, findings and delivery checks.' },
}
const professions = ['general','tender','drawing','quantity','method','research','report','spreadsheet']
const professionZh = ['通用企业任务','投标','施工图读图','工程量计算','施工方案','调研','汇报','表格']

export function briefFromForm(brief, key, value) {
  return { ...brief, [key]: key === 'formats' ? value.split(/[,，]/).map(row => row.trim()).filter(Boolean) : value }
}

function briefField(brief,key) {
  return key.startsWith('basis.') ? brief.basis?.[key.slice(6)] : brief[key]
}

/** Merge field drafts with the latest task without overwriting unrelated updates. */
export function mergeTaskBriefEdits(task, edits, allowConflicts = false) {
  const brief = {...task.brief,basis:{...task.brief.basis}}
  const conflicts = []
  for (const [key,edit] of Object.entries(edits)) {
    if (key.startsWith('question.')) continue
    if (JSON.stringify(briefField(task.brief,key)) !== JSON.stringify(edit.baseValue)) conflicts.push(key)
    if (key.startsWith('basis.')) brief.basis[key.slice(6)] = edit.value
    else brief[key] = edit.value
  }
  return {brief:conflicts.length && !allowConflicts ? null : brief,conflicts}
}

export function createTaskGuide({ React, api, cwd, language, subscribe, onOpenSource, onOpenWorkbench, onTask }) {
  const h = React.createElement
  const EngineeringPanel = createEngineeringPanel({ React, api, language,
    onOpenFile: (path, cwd) => window.dispatchEvent(new CustomEvent('agent-pi-open-file', { detail: { cwd, path } })),
  })
  const StageControls=createTaskStageControls({React,api,cwd,language,onOpenWorkbench})
  return function TaskGuide({ sessionId, onClose, binding }) {
    const open = true
    const [tab,setTab] = React.useState('overview')
    const [result,setResult] = React.useState(null), [draft,setDraft] = React.useState(null)
    const fieldEdits = React.useRef({})
    const taskRevision = React.useRef(-1)
    const [conflicts,setConflicts] = React.useState([])
    const [dirty,setDirty] = React.useState(false), [busy,setBusy] = React.useState(false), [message,setMessage] = React.useState(''), [error,setError] = React.useState('')
    const text = labels[language()?.startsWith('zh') ? 'zh' : 'en']
    const openSource = onOpenSource ? (evidence)=>onOpenSource(evidence,sessionId) : undefined
    const displayState = value => (text === labels.zh
      ? {available:'可用',conditional:'需核实适用条件',unavailable:'当前不可用',not_applicable:'不适用于本次任务',pending:'待处理',working:'进行中',blocked:'需补足条件',needs_review:'待复核',running:'进行中',done:'已完成',stale:'条件已变更，待复核',verified:'已核验',unverified:'待核实',conflict:'有冲突',parsed:'已抽取',reviewed:'已复核',missing:'缺失',unreadable:'不可读',draft:'草稿',ready:'待客户验收',accepted:'已验收',signed:'已签署',not_required:'无需签署',passed:'通过',failed:'未通过',review:'需复核'}
      : {available:'Available',conditional:'Check applicability',unavailable:'Unavailable',not_applicable:'Not applicable to this task',pending:'Pending',working:'In progress',blocked:'Missing conditions',needs_review:'Review required',running:'In progress',done:'Completed',stale:'Changed conditions; review required',verified:'Verified',unverified:'Unverified',conflict:'Conflict',parsed:'Extracted',reviewed:'Reviewed',missing:'Missing',unreadable:'Unreadable',draft:'Draft',ready:'Ready for customer review',accepted:'Accepted',signed:'Signed',not_required:'No signature required',passed:'Passed',failed:'Failed',review:'Review required'})[value] || String(value || '').replaceAll('_',' ')
    const endpoint = '/api/agent-pi/professional-task?sessionId=' + encodeURIComponent(sessionId || '')
    React.useEffect(() => { setResult(null); setDraft(null); setDirty(false); setError('');setTab('overview');fieldEdits.current={};taskRevision.current=-1;setConflicts([]) },[sessionId])
    React.useEffect(() => {
      if (!open || !sessionId) return
      const controller = new AbortController()
      let loading = false, pending = false
      const refresh = async () => {
        if (loading) {pending=true;return}
        pending=false
        loading = true
        try { const next = await api(endpoint,cwd(),{signal:controller.signal}); if (!controller.signal.aborted&&next.task.revision>=taskRevision.current) {taskRevision.current=next.task.revision;setResult(next);const task=structuredClone(next.task);task.brief=mergeTaskBriefEdits(task,fieldEdits.current,true).brief;task.questions=(task.questions || []).map(row=>fieldEdits.current['question.'+row.id]&&!row.provider?{...row,answer:fieldEdits.current['question.'+row.id].value}:row);setDraft(task);setError('');onTask?.(sessionId,next.task,next.binding)} }
        catch (e) {if (!controller.signal.aborted) setError(e.message)}
        finally {loading=false;if(pending&&!controller.signal.aborted)void refresh()}
      }
      void refresh()
      const timer = setInterval(refresh,5000), dispose = subscribe?.(sessionId,refresh)
      return () => { controller.abort();clearInterval(timer);dispose?.() }
    },[open,sessionId,endpoint])
    async function save(patch, allowConflicts=false) {
      setBusy(true);setError('');setMessage('')
      try {
        const latest=await api(endpoint,cwd());taskRevision.current=latest.task.revision;setResult(latest);onTask?.(sessionId,latest.task,latest.binding)
        if (patch.brief) {
          const merged=mergeTaskBriefEdits(latest.task,fieldEdits.current,allowConflicts)
          if (!merged.brief) {setConflicts(merged.conflicts);throw new Error(text===labels.zh?'这些字段在编辑期间有新变化，请核对后保留你的修正，或取消草稿采用最新内容。':'These fields changed while you were editing. Review before keeping your corrections or discarding the draft.')}
          patch={brief:merged.brief,questions:latest.task.questions.map(row=>fieldEdits.current['question.'+row.id]&&!row.provider?{...row,answer:fieldEdits.current['question.'+row.id].value}:row)}
        } else if (patch.deliverables) {
          const updates=new Map(patch.deliverables.map(row=>[row.id,row]))
          const accepting=latest.task.deliverables.some(row=>updates.get(row.id)?.status==='accepted'&&row.status!=='accepted')
          patch={deliverables:latest.task.deliverables.map(row=>({...row,...(updates.get(row.id)?.signature==='signed'?{signature:'signed'}:{}),...(updates.get(row.id)?.status==='accepted'?{status:'accepted'}:{})}))}
          if(accepting&&!latest.audit?.readyForCustomerReview)throw new Error(text===labels.zh?'交付状态已变化，请按最新检查结果复核。':'Delivery state changed. Review the latest checks.')
        }
        const next=await api(endpoint,cwd(),{method:'POST',body:JSON.stringify({revision:latest.task.revision,patch})})
        taskRevision.current=next.task.revision;fieldEdits.current={};setConflicts([]);setDraft(next.task);setResult(next);setDirty(false);setMessage(text.saved);onTask?.(sessionId,next.task,next.binding)
      }
      catch (e) {setError(e.message)} finally {setBusy(false)}
    }
    async function reload() {
      setBusy(true);setError('');setMessage('')
      try {const next=await api(endpoint,cwd());if(next.task.revision<taskRevision.current)return;taskRevision.current=next.task.revision;setResult(next);const task=structuredClone(next.task);task.brief=mergeTaskBriefEdits(task,fieldEdits.current,true).brief;task.questions=(task.questions || []).map(row=>fieldEdits.current['question.'+row.id]&&!row.provider?{...row,answer:fieldEdits.current['question.'+row.id].value}:row);setDraft(task);onTask?.(sessionId,next.task,next.binding)}
      catch(e){setError(e.message)} finally{setBusy(false)}
    }
    async function taskAction(action, values) {
      setBusy(true);setError('');setMessage('')
      try {
        const latest=await api(endpoint,cwd())
        const next=await api(endpoint,cwd(),{method:'POST',body:JSON.stringify({action,...values,revision:latest.task.revision,...(action==='directive_revoke'?{operationId:crypto.randomUUID()}: {})})})
        if(next.task.revision<taskRevision.current)return
        taskRevision.current=next.task.revision;setResult(next);setDraft(structuredClone(next.task));onTask?.(sessionId,next.task,next.binding)
        setMessage(action==='verify'?(text===labels.zh?'已核验实际成果，请查看审核结果和待解决项。':'Actual artifact verified. Review the receipt and unresolved items.'):(text===labels.zh?'已撤销该约束，后续执行与审核将采用最新要求。':'Constraint revoked. Execution and review will use the latest requirements.'))
      } catch(e){setError(e.message)} finally{setBusy(false)}
    }
    const edit = (key,value,basis=false) => {const path=basis?'basis.'+key:key;fieldEdits.current[path]={baseValue:fieldEdits.current[path]?.baseValue??briefField(result.task.brief,path),value:key==='formats'?value.split(/[,，]/).map(row=>row.trim()).filter(Boolean):value};setDraft({...draft,brief:mergeTaskBriefEdits(result.task,fieldEdits.current,true).brief});setDirty(true);setMessage('');setConflicts([])}
    const field = (key,basis=false,multiline=false) => h('label',{key},text[key],h(multiline?'textarea':'input',{value:(basis?draft.brief.basis?.[key]:key==='formats'?(draft.brief.formats || []).join(', '):draft.brief[key]) || '',onChange:e=>edit(key,e.target.value,basis)}))
    const article = (id,title,body) => h('article',{key:id},h('h3',null,title),body)
    let body = null
    if (draft) {
      const task=result?.task||draft, model=taskOverviewModel(task), zh=text===labels.zh
      const project=binding||result?.binding||task.binding
      const provenance=task.briefProvenance?.objective
      const origin=zh?{user:'用户表达',source:'资料提取',inference:'系统推测',legacy:'已有记录'}:{user:'User request',source:'Source material',inference:'Inferred',legacy:'Previous record'}
      const status=zh?{explicit:'明确要求',confirmed:'已确认',provisional:'暂定理解',conflict:'存在冲突'}:{explicit:'Explicit',confirmed:'Confirmed',provisional:'Provisional',conflict:'Conflict'}
      if(tab==='overview') body=h(React.Fragment,null,
        article('understanding',zh?'共同理解的目标':'Shared understanding of the goal',h(React.Fragment,null,
          h('p',{className:'ap-guide-objective'},task.brief.objective||(zh?'把目的告诉主对话，系统会结合资料逐步明确。':'Describe your purpose in the conversation. The system will clarify it from the materials.')),
          provenance&&h('p',{className:'ap-guide-muted'},origin[provenance.origin]+' · '+status[provenance.status]),
          task.brief.scope&&h('p',null,text.scope+'：'+task.brief.scope),task.brief.audience&&h('p',null,text.audience+'：'+task.brief.audience),
          h('button',{onClick:()=>setTab('goal')},zh?'修正某项理解':'Correct an item'),onClose&&h('button',{onClick:onClose},zh?'继续在对话中说明':'Continue in the conversation'))),
        project&&article('binding',zh?'与专业化工作台的关联':'Professional workbench connection',h(React.Fragment,null,
          project.projectGoal&&h('p',null,(zh?'项目总目标：':'Project goal: ')+project.projectGoal),
          h('p',null,(zh?'当前阶段：':'Current stage: ')+(project.stageLabel||project.stageId||text.empty)),
          h('p',{className:'ap-guide-muted'},zh?'本次任务为当前阶段贡献成果，项目总目标与阶段审批由工作台保留。':'This task contributes to the current stage. The workbench retains the project goal and stage approvals.'),h(StageControls,{sessionId,task,binding:project,onChanged:reload}))),
        article('quality',zh?'专业执行口径':'Professional execution policy',h(React.Fragment,null,
          h('p',null,model.depthEnabled?(zh?'专业深度已启用：加强方法、证据与验收项审阅。':'Professional depth is on: enhanced methods, evidence and acceptance review.'):(zh?'基础专业检查持续生效；可在输入区主动开启专业深度。':'Core professional checks apply. Turn on professional depth in the composer for additional review.')),
          h('p',{className:'ap-guide-muted'},zh?'调整开关会保留已有依据、发现和检查记录。':'Changing the switch preserves evidence, findings and check records.'))),
        (model.constraints.length>0||model.corrections.length>0)&&article('constraints',zh?'持续生效的约束与最新修正':'Persistent constraints and latest corrections',h(React.Fragment,null,
          h('p',{className:'ap-guide-muted'},zh?'这些要求跨压缩保留；资料引用不构成用户指令，撤销会使相关成果重新待核验。':'These requirements survive compaction. Quoted documents do not establish user authority; revocation requires affected results to be checked again.'),
          ...model.constraints.map(row=>h('div',{key:row.id,'data-directive-id':row.id},h('p',null,row.text),h('p',{className:'ap-guide-muted'},(zh?'来自用户 · 任务版本 ':'From user · Task revision ')+row.updatedRevision),h('button',{disabled:busy||dirty,onClick:()=>taskAction('directive_revoke',{directiveId:row.id})},zh?'撤销这项约束':'Revoke this constraint'))),
          ...model.corrections.filter(row=>!model.constraints.some(active=>active.id===row.id)).map(row=>h('p',{key:row.id,className:'ap-guide-muted'},(row.kind==='revocation'?(zh?'已明确撤销：':'Explicitly revoked: '):(zh?'修正记录：':'Correction: '))+row.text)))),
        model.questions.length>0&&article('questions',text.unanswered,h(React.Fragment,null,
          ...model.questions.map(row=>h('div',{key:row.id},h('p',null,row.question),row.purpose&&h('p',{className:'ap-guide-muted'},row.purpose),row.provider&&h('p',{className:'ap-guide-muted'},zh?'请在主对话的原生问答卡中回答。':'Answer in the native question card in the conversation.'))),
          onClose&&h('button',{onClick:onClose},zh?'在主对话中回答':'Answer in the conversation'))),
        h('h3',null,zh?'围绕目标的发现':'Findings related to your goal'),
        task.findings?.length?renderTaskFindings(h,task,language(),openSource,{includeResolved:true,onOpenChat:onClose}):h('p',{className:'ap-guide-muted'},zh?'实际分析形成的发现会记录在这里，并说明依据、目标影响和下一步。':'Findings from actual analysis appear here with their sources, impact on the goal and next action.'),
        renderTenderResponseCoverage(h,result?.responseCoverage,{locale:language(),compact:true,onOpenTask:()=>setTab('responses')}),
        h(EngineeringPanel,{sessionId,cwd:cwd(),hideEmpty:true}),
        article('progress',zh?'实际工作进展':'Actual work progress',h(React.Fragment,null,
          model.currentStep&&h('p',null,(zh?'当前重点：':'Current focus: ')+model.currentStep.title),
          h('div',{className:'ap-guide-progress'},h('span',null,(zh?'资料抽取：':'Source extraction: ')+model.coverage.parsed+'/'+model.coverage.total),
            h('span',null,(zh?'专业复核：':'Professional review: ')+model.coverage.reviewed+'/'+model.coverage.total),
            h('span',null,(zh?'缺失 / 不可读：':'Missing / unreadable: ')+model.coverage.missing+' / '+model.coverage.unreadable),
            h('span',null,(zh?'客户验收：':'Customer acceptance: ')+model.delivery.accepted+'/'+model.delivery.total)),
          model.coverage.total===0&&h('p',{className:'ap-guide-muted'},zh?'尚未登记资料检查对象，不推算完成率。':'No source inspection objects have been registered yet.'),
          h('button',{onClick:()=>setTab('plan')},text.plan),h('button',{onClick:()=>setTab('delivery')},text.delivery))),
        model.changes.length>0&&article('changes',zh?'调整记录':'Adjustment history',h(React.Fragment,null,...model.changes.slice(0,8).map(row=>h('div',{key:row.sequence},h('p',null,row.summary),row.affectedRefs?.length>0&&h('p',{className:'ap-guide-muted'},(zh?'受影响：':'Affected: ')+row.affectedRefs.join('、')))))),
      )
      if (tab==='responses') body = renderTenderResponseCoverage(h,result?.responseCoverage,{locale:language(),onOpenFile:(path,locator)=>window.dispatchEvent(new CustomEvent('agent-pi-open-file',{detail:{cwd:cwd(),path,locator}}))}) || h('p',{className:'ap-guide-muted'},zh?'当前项目尚未建立投标响应记录，可在主对话中继续。':'This project has no tender response record yet. Continue in the conversation.')
      if (tab==='goal') body = h(React.Fragment,null,field('objective',false,true),field('scope',false,true),field('audience'),
        h('label',null,text.profession,h('select',{value:draft.brief.profession,onChange:e=>edit('profession',e.target.value)},professions.map((value,index)=>h('option',{key:value,value},text===labels.zh?professionZh[index]:value)))),
        field('formats'),field('language'),field('deadline'),h('label',null,text.webDiligence,h('select',{value:draft.brief.webDiligence,onChange:e=>edit('webDiligence',e.target.value)},[['allowed',text===labels.zh?'允许任务相关公开尽调':'Allow task-related public diligence'],['ask',text===labels.zh?'需要时询问':'Ask when needed'],['forbidden',text===labels.zh?'仅使用已提供资料':'Use supplied materials only']].map(([value,label])=>h('option',{key:value,value},label)))),
        h('h3',null,text.unanswered),(draft.questions || []).filter(row=>!row.provider&&row.status!=='cancelled').map(row=>h('label',{key:row.id},row.question,h('textarea',{value:row.answer||'',onChange:e=>{fieldEdits.current['question.'+row.id]={value:e.target.value};setDraft({...draft,questions:draft.questions.map(q=>q.id===row.id?{...q,answer:e.target.value}:q)});setDirty(true)}}))))
      if (tab==='basis') body = h(React.Fragment,null,['country','location','employer','procurement','funding','contract','measurement'].map(key=>field(key,true)),h('h3',null,text.standards),(draft.brief.basis?.standards || []).map(row=>article(row.id || row.evidenceId+'-'+(row.title || row.name),row.title || row.name,h('p',null,[row.version,row.scope,row.evidenceId].filter(Boolean).join(' · ')))),h('h3',null,text.evidence),(draft.evidence || []).map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,row.value),h('p',{className:'ap-guide-muted'},row.kind+' · '+displayState(row.status)+' · '+(row.basis||'')),sourceReference(h,row,openSource,language())))))
      if (tab==='plan') {
        const workbenchPlan=(draft.plan || []).filter(row=>row.id?.startsWith('workbench:')&&!row.id.includes(':execution:'))
        const executionPlan=(draft.plan || []).filter(row=>!row.id?.startsWith('workbench:')||row.id.includes(':execution:'))
        const planRows=rows=>rows.map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,displayState(row.status)),h('p',{className:'ap-guide-muted'},(row.dependsOn || []).join(' → ')),(row.gaps || []).map((gap,index)=>h('p',{key:'g'+index},text.missing+': '+gap)),(row.supplements || []).map((supplement,index)=>h('p',{key:'s'+index},supplement)))))
        body=h(React.Fragment,null,h('p',null,draft.assessment||text.waiting),
          workbenchPlan.length>0&&h('section',{'aria-label':zh?'工作台阶段与实际门禁':'Workbench stages and actual gates'},h('h3',null,zh?'工作台阶段与实际门禁':'Workbench stages and actual gates'),...planRows(workbenchPlan)),
          executionPlan.length>0&&h('section',{'aria-label':workbenchPlan.length?(zh?'执行者登记的工作进度':'Agent-registered work progress'):text.plan},
            workbenchPlan.length>0&&h('h3',null,zh?'执行者登记的工作进度':'Agent-registered work progress'),
            workbenchPlan.length>0&&h('p',{className:'ap-guide-muted'},zh?'这些记录反映执行者登记的工作进度；完成不等于阶段审批或成果验收，不合计为项目完成率。':'These records reflect work registered by the agent. Completion does not establish stage approval or deliverable acceptance, and is not added to project completion.'),...planRows(executionPlan)),
          h('h3',null,text.source),(draft.coverage || []).map(row=>article(row.id,row.title,h('p',null,displayState(row.status)+' · '+(row.review||'')+' · '+row.locator))))
      }
      if (tab==='capabilities') body = result?.capabilities?.toSorted((a,b)=>['available','conditional','unavailable','not_applicable'].indexOf(a.status)-['available','conditional','unavailable','not_applicable'].indexOf(b.status)).map(capability=>{ const row=localizeCapability(capability,language());return article(row.id,row.title,h(React.Fragment,null,h('p',null,displayState(row.status)),h('p',null,row.description),h('p',{className:'ap-guide-muted'},row.owner+' · '+row.version),[...(row.reasons||[]),...(row.limitations||[]),...(row.supplements||[])].map((value,index)=>h('p',{key:index},value)))) })
      if (tab==='delivery') body = h(React.Fragment,null,
        h('p',null,result?.audit?.customerAccepted?text.accepted:result?.audit?.readyForCustomerReview?text.ready:text.review),
        result?.audit?.issues?.map((row,index)=>h('p',{key:index,className:'ap-guide-error'},row.detail)),
        (draft.deliverables || []).map(row=>article(row.id,row.title || row.path?.split(/[\\/]/).pop() || row.id,h(React.Fragment,null,
          h('p',null,row.path),h('p',null,displayState(row.status)+' · '+displayState(row.signature)),
          h('button',{disabled:busy||dirty,onClick:()=>taskAction('verify',{deliverableId:row.id})},zh?'核验实际成果':'Verify actual artifact'),
          row.verification?h('div',{'data-verification-status':row.verification.status},
            h('p',null,(zh?'审核凭据：':'Verification receipt: ')+displayState(row.verification.status)+' · '+row.verification.ruleVersion),
            h('p',{className:'ap-guide-muted'},(zh?'成果 SHA：':'Artifact SHA: ')+(row.verification.artifactSha256||'—')),
            h('p',{className:'ap-guide-muted'},(zh?'输入任务版本：':'Input task revision: ')+row.verification.taskRevision+' · '+(row.verification.inputFingerprint||'').slice(0,16)),
            ...Object.entries(row.verification.sourceHashes||{}).map(([path,hash])=>h('p',{key:path,className:'ap-guide-muted'},path+' · '+(hash|| (zh?'无法核验':'Unverified')))),
            ...(row.verification.unresolved||[]).map((value,index)=>h('p',{key:index,className:'ap-guide-error'},value)))
            :h('p',{className:'ap-guide-muted'},zh?'尚无实际文件审核凭据，不能验收；登记完成不代表已通过。':'No actual-file verification receipt yet. A completion record does not establish acceptance.'),
          (row.checks || []).map((check,index)=>h('p',{key:index},check.kind+' · '+displayState(check.status)+' — '+check.detail)),
          row.signature==='pending'?h('button',{disabled:busy||dirty,onClick:()=>save({deliverables:draft.deliverables.map(item=>item.id===row.id?{...item,signature:'signed'}:item)})},text.signature):null))),
        result?.audit?.readyForCustomerReview&&draft.deliverables?.every(row=>row.verification?.status==='passed'&&!row.verification.unresolved?.length)&&!result?.audit?.customerAccepted?h('button',{disabled:busy||dirty,onClick:()=>save({deliverables:draft.deliverables.map(row=>({...row,status:'accepted'}))})},text.accept):null)
    }
    return h('section',{className:'ap-task-guide','data-conversation-composer-overlay':'',role:'region','aria-label':text.title},h('header',null,h('h2',null,text.title),onClose?h('button',{onClick:onClose},text.close):null),h('nav',{'aria-label':text.title},['overview',...(result?.responseCoverage?['responses']:[]),'goal','basis','plan','capabilities','delivery'].map(key=>h('button',{key,role:'tab','aria-selected':tab===key,onClick:()=>setTab(key)},key==='responses'?(text===labels.zh?'响应对照':'Response coverage'):text[key]))),h('main',null,h('p',{className:'ap-guide-muted'},text.reminder),error?h('p',{role:'alert',className:'ap-guide-error'},error):null,message?h('p',{role:'status'},message):null,conflicts.length>0?h('div',null,h('p',null,conflicts.join('、')),h('button',{disabled:busy,onClick:()=>save({brief:draft.brief,questions:draft.questions},true)},text===labels.zh?'保留我的修正并保存':'Keep my corrections and save')):null,!sessionId?h('p',null,text.noTask):body),h('footer',null,h('button',{disabled:busy,onClick:reload},text.refresh),dirty?h('button',{disabled:busy,onClick:()=>{fieldEdits.current={};setDraft(structuredClone(result.task));setDirty(false);setConflicts([]);setError('')}},text===labels.zh?'取消草稿':'Discard draft'):null,dirty?h('button',{disabled:busy||!draft,onClick:()=>save({brief:draft.brief,questions:draft.questions})},busy?text.saving:text.save):null))
  }
}

