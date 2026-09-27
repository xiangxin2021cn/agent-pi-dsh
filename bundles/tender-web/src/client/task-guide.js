export const taskGuideCss = `
.ap-task-guide{position:relative;width:100%;height:100%;min-height:0;min-width:0;box-sizing:border-box;padding-bottom:var(--dsh-composer-height,180px);background:var(--bg-primary,#fff);color:var(--text-primary,#273240);display:flex;flex-direction:column;font-size:14px}
.ap-task-guide header,.ap-task-guide footer{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border,#d5dae1)}
.ap-task-guide header h2{margin:0;font-size:18px}.ap-task-guide nav{display:flex;gap:6px;padding:12px 24px;flex-wrap:wrap}.ap-task-guide button{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;padding:7px 12px;cursor:pointer}.ap-task-guide button[aria-selected=true]{background:var(--accent,#285c7b);color:#fff}.ap-task-guide button:disabled{opacity:.5;cursor:default}
.ap-task-guide main{padding:8px 24px 24px;overflow:auto;flex:1}.ap-task-guide label{display:flex;flex-direction:column;gap:6px;margin:12px 0}.ap-task-guide input,.ap-task-guide textarea,.ap-task-guide select{font:inherit;border:1px solid var(--border,#d5dae1);border-radius:6px;padding:9px;background:var(--bg-secondary,#fafbfc);color:inherit;width:100%;box-sizing:border-box}.ap-task-guide textarea{min-height:75px;resize:vertical}.ap-task-guide p{line-height:1.6}.ap-task-guide article{border:1px solid var(--border,#d5dae1);border-radius:8px;padding:12px 16px;margin:12px 0}.ap-task-guide article h3{font-size:15px;margin:0 0 8px}.ap-task-guide article p{margin:6px 0;overflow-wrap:anywhere}.ap-task-guide .ap-guide-muted{color:var(--text-secondary,#687280);font-size:12px}.ap-task-guide .ap-guide-error{color:#b74434}.ap-task-guide footer{border-top:1px solid var(--border,#d5dae1);border-bottom:0}.ap-task-guide pre{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){.ap-task-guide header,.ap-task-guide footer{padding:12px 16px}.ap-task-guide main{padding:4px 16px 20px}.ap-task-guide nav{padding:10px 16px}.ap-task-guide footer{flex-wrap:wrap}}
`

const labels = {
  zh: { title:'本次任务', close:'关闭', goal:'目标与需求', basis:'项目依据', plan:'执行计划', capabilities:'可用能力', delivery:'交付检查', objective:'本次要完成什么', scope:'工作范围与边界', audience:'成果给谁使用', formats:'输出格式（逗号分隔）', language:'交付语言', deadline:'期限', profession:'专业方向', country:'项目国家/地区', location:'项目地点', employer:'业主/委托方', procurement:'采购体系', funding:'资金来源', contract:'合同及版本', measurement:'计量计价依据', standards:'已登记规范', webDiligence:'公共网络尽调', save:'保存需求', saving:'正在保存…', refresh:'读取最新状态', saved:'已保存，后续执行将采用本次需求。', waiting:'尚未登记执行计划。明确任务后，智能体会评估能力并按依赖推进。', noTask:'此对话尚未就绪，请先开始对话。', missing:'待补足', ready:'已通过登记的交付检查', review:'仍有待复核事项', accepted:'客户已验收', accept:'确认验收全部成果', signature:'确认此文件已签署/授权', signatures:'待签署/授权', source:'来源覆盖', evidence:'证据状态', unanswered:'待明确的问题', empty:'尚未登记', reminder:'来源抽取、专业复核和客户验收分别记录。修改条件后，受影响的计算与文件会待复核。' },
  en: { title:'Current task', close:'Close', goal:'Goal & brief', basis:'Project basis', plan:'Execution plan', capabilities:'Capabilities', delivery:'Delivery checks', objective:'What should this task accomplish?', scope:'Scope and boundaries', audience:'Audience', formats:'Output formats (comma separated)', language:'Delivery language', deadline:'Deadline', profession:'Professional field', country:'Project country/region', location:'Project location', employer:'Employer/client', procurement:'Procurement system', funding:'Funding source', contract:'Contract and version', measurement:'Measurement and pricing basis', standards:'Registered standards', webDiligence:'Public web diligence', save:'Save brief', saving:'Saving…', refresh:'Read latest state', saved:'Saved. Subsequent execution will use this brief.', waiting:'No execution plan yet. Once the brief is clear, the agent will assess capabilities and follow dependencies.', noTask:'This conversation is not ready. Start a conversation first.', missing:'Gaps to resolve', ready:'Registered delivery checks passed', review:'Review items remain', accepted:'Customer accepted', accept:'Accept all deliverables', signature:'Confirm this file is signed/authorized', signatures:'Signature/authorization pending', source:'Source coverage', evidence:'Evidence status', unanswered:'Open questions', empty:'Not registered', reminder:'Extraction, professional review and customer acceptance are recorded separately. Changed conditions require affected calculations and files to be reviewed.' },
}
const professions = ['general','tender','drawing','quantity','method','research','report','spreadsheet']
const professionZh = ['通用企业任务','投标','施工图读图','工程量计算','施工方案','调研','汇报','表格']

export function briefFromForm(brief, key, value) {
  return { ...brief, [key]: key === 'formats' ? value.split(/[,，]/).map(row => row.trim()).filter(Boolean) : value }
}

export function createTaskGuide({ React, api, cwd, language, subscribe }) {
  const h = React.createElement
  return function TaskGuide({ sessionId, onClose }) {
    const open = true
    const [tab,setTab] = React.useState('goal')
    const [result,setResult] = React.useState(null), [draft,setDraft] = React.useState(null)
    const [dirty,setDirty] = React.useState(false), [busy,setBusy] = React.useState(false), [message,setMessage] = React.useState(''), [error,setError] = React.useState('')
    const text = labels[language()?.startsWith('zh') ? 'zh' : 'en']
    const displayState = value => text === labels.zh ? ({available:'可用',conditional:'需核实适用条件',unavailable:'当前不可用',not_applicable:'不适用于本次任务',pending:'待处理',running:'进行中',done:'已完成',stale:'条件已变更，待复核',verified:'已核验',unverified:'待核实',conflict:'有冲突',parsed:'已抽取',reviewed:'已复核',missing:'缺失',unreadable:'不可读',draft:'草稿',ready:'待客户验收',accepted:'已验收',signed:'已签署',not_required:'无需签署',passed:'通过',failed:'未通过',review:'需复核'}[value] || value) : value.replaceAll('_',' ')
    const endpoint = '/api/agent-pi/professional-task?sessionId=' + encodeURIComponent(sessionId || '')
    React.useEffect(() => { setResult(null); setDraft(null); setDirty(false); setError('') },[sessionId])
    React.useEffect(() => {
      if (!open || !sessionId || dirty) return
      const controller = new AbortController()
      let loading = false
      const refresh = async () => {
        if (loading) return
        loading = true
        try { const next = await api(endpoint,cwd(),{signal:controller.signal}); if (!controller.signal.aborted) {setResult(next);setDraft(structuredClone(next.task));setError('')} }
        catch (e) {if (!controller.signal.aborted) setError(e.message)}
        finally {loading=false}
      }
      void refresh()
      const timer = setInterval(refresh,5000), dispose = subscribe?.(sessionId,refresh)
      return () => { controller.abort();clearInterval(timer);dispose?.() }
    },[open,sessionId,dirty,endpoint])
    async function save(patch) {
      setBusy(true);setError('');setMessage('')
      try { const next = await api(endpoint,cwd(),{method:'POST',body:JSON.stringify({revision:draft.revision,patch})});setDraft(next.task);setResult(next);setDirty(false);setMessage(text.saved) }
      catch (e) {setError(e.message)} finally {setBusy(false)}
    }
    async function reload() {
      setBusy(true);setError('');setMessage('')
      try {const next=await api(endpoint,cwd());setResult(next);setDraft(structuredClone(next.task));setDirty(false)}
      catch(e){setError(e.message)} finally{setBusy(false)}
    }
    const edit = (key,value,basis=false) => {setDraft({...draft,brief:basis ? {...draft.brief,basis:{...draft.brief.basis,[key]:value}} : briefFromForm(draft.brief,key,value)});setDirty(true);setMessage('')}
    const field = (key,basis=false,multiline=false) => h('label',{key},text[key],h(multiline?'textarea':'input',{value:(basis?draft.brief.basis[key]:key==='formats'?draft.brief.formats.join(', '):draft.brief[key]) || '',onChange:e=>edit(key,e.target.value,basis)}))
    const article = (id,title,body) => h('article',{key:id},h('h3',null,title),body)
    let body = null
    if (draft) {
      if (tab==='goal') body = h(React.Fragment,null,field('objective',false,true),field('scope',false,true),field('audience'),
        h('label',null,text.profession,h('select',{value:draft.brief.profession,onChange:e=>edit('profession',e.target.value)},professions.map((value,index)=>h('option',{key:value,value},text===labels.zh?professionZh[index]:value)))),
        field('formats'),field('language'),field('deadline'),h('label',null,text.webDiligence,h('select',{value:draft.brief.webDiligence,onChange:e=>edit('webDiligence',e.target.value)},[['allowed',text===labels.zh?'允许任务相关公开尽调':'Allow task-related public diligence'],['ask',text===labels.zh?'需要时询问':'Ask when needed'],['forbidden',text===labels.zh?'仅使用已提供资料':'Use supplied materials only']].map(([value,label])=>h('option',{key:value,value},label)))),
        h('h3',null,text.unanswered),draft.questions.map(row=>h('label',{key:row.id},row.question,h('textarea',{value:row.answer||'',onChange:e=>{setDraft({...draft,questions:draft.questions.map(q=>q.id===row.id?{...q,answer:e.target.value}:q)});setDirty(true)}}))))
      if (tab==='basis') body = h(React.Fragment,null,['country','location','employer','procurement','funding','contract','measurement'].map(key=>field(key,true)),h('h3',null,text.standards),draft.brief.basis.standards.map(row=>article(row.id,row.title,h('p',null,row.version+' · '+row.scope+' · '+row.evidenceId))),h('h3',null,text.evidence),draft.evidence.map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,row.value),h('p',{className:'ap-guide-muted'},row.kind+' · '+row.status+' · '+(row.locator||row.url||row.basis||''))))))
      if (tab==='plan') body = h(React.Fragment,null,h('p',null,draft.assessment||text.waiting),draft.plan.map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,row.status),h('p',{className:'ap-guide-muted'},row.dependsOn.join(' → ')),row.gaps.map((gap,index)=>h('p',{key:'g'+index},text.missing+': '+gap)),row.supplements.map((supplement,index)=>h('p',{key:'s'+index},supplement))))),h('h3',null,text.source),draft.coverage.map(row=>article(row.id,row.title,h('p',null,row.status+' · '+(row.review||'')+' · '+row.locator))))
      if (tab==='capabilities') body = result?.capabilities?.toSorted((a,b)=>['available','conditional','unavailable','not_applicable'].indexOf(a.status)-['available','conditional','unavailable','not_applicable'].indexOf(b.status)).map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,displayState(row.status)),h('p',null,row.description),h('p',{className:'ap-guide-muted'},row.owner+' · '+row.version),[...(row.reasons||[]),...(row.limitations||[]),...(row.supplements||[])].map((value,index)=>h('p',{key:index},value)))))
      if (tab==='delivery') body = h(React.Fragment,null,h('p',null,result?.audit?.customerAccepted?text.accepted:result?.audit?.readyForCustomerReview?text.ready:text.review),result?.audit?.issues?.map((row,index)=>h('p',{key:index,className:'ap-guide-error'},row.detail)),draft.deliverables.map(row=>article(row.id,row.title,h(React.Fragment,null,h('p',null,row.path),h('p',null,row.status+' · '+row.signature),row.checks.map((check,index)=>h('p',{key:index},check.kind+' · '+check.status+' — '+check.detail)),row.signature==='pending'?h('button',{disabled:busy||dirty,onClick:()=>save({deliverables:draft.deliverables.map(item=>item.id===row.id?{...item,signature:'signed'}:item)})},text.signature):null))),result?.audit?.readyForCustomerReview?h('button',{disabled:busy||dirty,onClick:()=>save({deliverables:draft.deliverables.map(row=>({...row,status:'accepted'}))})},text.accept):null)
    }
    return h('section',{className:'ap-task-guide','data-conversation-composer-overlay':'',role:'region','aria-label':text.title},h('header',null,h('h2',null,text.title),onClose?h('button',{onClick:onClose},text.close):null),h('nav',{'aria-label':text.title},['goal','basis','plan','capabilities','delivery'].map(key=>h('button',{key,role:'tab','aria-selected':tab===key,onClick:()=>setTab(key)},text[key]))),h('main',null,h('p',{className:'ap-guide-muted'},text.reminder),error?h('p',{role:'alert',className:'ap-guide-error'},error):null,message?h('p',{role:'status'},message):null,!sessionId?h('p',null,text.noTask):body),h('footer',null,h('button',{disabled:busy,onClick:reload},text.refresh),h('button',{disabled:busy||!dirty||!draft,onClick:()=>save({brief:draft.brief,questions:draft.questions})},busy?text.saving:text.save)))
  }
}

