export const taskInteractionCss = `
.ap-task-interaction{margin:10px 0;min-width:0}.ap-task-interaction-controls{display:flex;gap:8px;flex-wrap:wrap}.ap-task-interaction button{font:inherit;padding:7px 10px;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;cursor:pointer}.ap-task-interaction button:disabled{opacity:.5;cursor:default}.ap-task-interaction-editor{margin-top:10px;padding:12px;border:1px solid var(--border,#d5dae1);border-radius:8px}.ap-task-interaction-editor label{display:block;margin-bottom:8px}.ap-task-interaction textarea{display:block;box-sizing:border-box;width:100%;min-height:84px;margin:8px 0;padding:9px;font:inherit;color:inherit;background:var(--bg-primary,#fff);border:1px solid var(--border,#d5dae1);border-radius:6px;resize:vertical}.ap-task-interaction p{line-height:1.55;overflow-wrap:anywhere}.ap-task-interaction-error{color:#b42318}.ap-task-interaction-state{color:var(--text-secondary,#687280);font-size:12px}
`

/** Explicit human actions use one host command, shared by chat and Current task. */
export function createTaskInteraction({ React, api, cwd, language, onUserAction }) {
  const h = React.createElement
  return function TaskInteraction({ sessionId, result, finding, disabled = false, onChanged, onOpenChat }) {
    const [editor,setEditor] = React.useState(''), [text,setText] = React.useState('')
    const [busy,setBusy] = React.useState(false), [error,setError] = React.useState(''), [receipt,setReceipt] = React.useState(null)
    const flight = React.useRef(null)
    const activeSession = React.useRef(sessionId)
    activeSession.current=sessionId
    const zh = String(language?.() || 'zh').startsWith('zh')
    const task = result?.task, state = result?.interactionState || {}
    const paused = state.paused ?? task?.control?.paused ?? false
    const unavailable = disabled || busy || !sessionId || !task
    React.useEffect(() => {setEditor('');setText('');setError('');setReceipt(null);setBusy(false);flight.current=null},[sessionId,finding?.id])
    const perform = async (kind, extra = {}) => {
      if (unavailable || flight.current) return
      const payload = { sessionId, revision:task.revision, operationId:crypto.randomUUID(), command:{kind,...extra} }
      flight.current = payload
      setBusy(true);setError('');setReceipt(null)
      try {
        const next = onUserAction
          ? await onUserAction(payload)
          : await api(`/api/agent-pi/professional-task?sessionId=${encodeURIComponent(sessionId)}`,cwd(),{method:'POST',body:JSON.stringify({action:'user_action',command:payload.command,revision:payload.revision,operationId:payload.operationId})})
        if (activeSession.current!==payload.sessionId) return
        if (!next?.task || !next.interaction) throw new Error(zh?'未收到任务操作结果，请读取最新状态后核对。':'No task action receipt was returned. Read the latest state to check the result.')
        setReceipt(next.interaction)
        await onChanged?.(next)
        if (!['blocked','requires_executor','prepared'].includes(next.interaction.dispatch)) {setEditor('');setText('')}
      } catch (err) {if(activeSession.current===payload.sessionId)setError(String(err.message || err))}
      finally {if(flight.current===payload){flight.current=null;setBusy(false)}}
    }
    const edit = kind => {setEditor(kind);setText('');setError('');setReceipt(null)}
    const last = receipt || (!finding && task?.control?.lastAction)
    const failed = ['blocked','requires_executor'].includes(last?.dispatch)
    const stateLabel = paused&&state.running ? (zh?'自动接续已暂停，当前执行仍在停止或处理中。':'Automatic continuation is paused; the current execution is still stopping or processing.')
      : paused&&state.pending ? (zh?'自动接续已暂停，仍有执行操作待确认。':'Automatic continuation is paused; an execution action still needs confirmation.')
      : paused ? (zh?'任务已暂停；已有依据和成果保留。':'Task paused; existing evidence and deliverables are preserved.')
      : state.running ? (zh?'执行中；新的调整会交给当前执行器。':'Running; adjustments go to the current executor.')
        : state.pending ? (zh?'已有任务操作等待执行。':'A task action is waiting to run.') : ''
    return h('section',{className:'ap-task-interaction','aria-label':finding?(zh?'处理这项发现':'Respond to this finding'):(zh?'任务交互':'Task actions'),'data-task-control-paused':String(paused)},
      !finding&&stateLabel&&h('p',{className:'ap-task-interaction-state'},stateLabel),
      h('div',{className:'ap-task-interaction-controls'},finding
        ? h('button',{type:'button',disabled:unavailable||finding.status!=='open',onClick:()=>edit('respond_finding')},zh?'补充或调整处理':'Respond or adjust next steps')
        : h(React.Fragment,null,
          ['provisional','conflict'].includes(task?.briefProvenance?.objective?.status)&&h('button',{type:'button',disabled:unavailable,onClick:()=>perform('confirm_understanding')},zh?'确认当前理解':'Confirm this understanding'),
          h('button',{type:'button',disabled:unavailable||!!state.running,onClick:()=>perform('continue')},paused?(zh?'继续任务':'Resume task'):(zh?'继续当前任务':'Continue task')),
          h('button',{type:'button',disabled:unavailable||!state.running&&!state.pending,onClick:()=>perform('pause')},zh?'暂停执行':'Pause execution'),
          h('button',{type:'button',disabled:unavailable,onClick:()=>edit('adjust_request')},zh?'补充或调整要求':'Add or adjust requirements'),
          h('button',{type:'button',disabled:unavailable,onClick:()=>edit('replan')},zh?'重新规划':'Replan'),
          h('button',{type:'button',disabled:unavailable||!task?.deliverables?.length,onClick:()=>perform('check_deliverables')},zh?'核验已登记成果':'Check registered deliverables'))),
      editor&&h('div',{className:'ap-task-interaction-editor'},
        h('label',null,editor==='respond_finding'?(zh?'对这项发现的补充、决定或处理要求':'Your information, decision or instructions about this finding'):editor==='replan'?(zh?'重新规划时需要采用哪些调整？':'What should the revised plan take into account?'):(zh?'直接说明需要补充或改变的内容':'Describe what to add or change'),
          h('textarea',{'aria-label':zh?'任务调整内容':'Task adjustment',autoFocus:true,value:text,maxLength:12000,onChange:e=>setText(e.target.value),placeholder:zh?'例如：先核对工期与资源，报告改给项目经理使用，保留已核实的数据。':'For example: check schedule and resources first; keep verified data.'})),
        editor==='respond_finding'&&h('p',{className:'ap-task-interaction-state'},zh?'你的意见将交给执行器处理；提交不代表问题已解决。':'Your response goes to the executor. Submitting does not resolve the finding.'),
        h('div',{className:'ap-task-interaction-controls'},h('button',{type:'button',disabled:unavailable||editor!=='replan'&&!text.trim(),onClick:()=>perform(editor,{...(text.trim()?{text:text.trim()}:{}),...(finding?{findingId:finding.id}:{})})},busy?(zh?'提交中…':'Submitting…'):(zh?'提交给当前任务':'Apply to current task')),h('button',{type:'button',disabled:busy,onClick:()=>{setEditor('');setText('')}},zh?'取消':'Cancel'))),
      task?.latestRequest&&last?.messageId===task.latestMessageId&&['adjust_request','replan','respond_finding'].includes(last?.kind)&&h('p',{className:'ap-task-interaction-state'},zh?'最近提交的要求：':'Latest submitted requirements: ',task.latestRequest.length>420?task.latestRequest.slice(0,420)+'…':task.latestRequest),
      last?.reason&&h('p',{role:failed?'alert':'status',className:failed?'ap-task-interaction-error':'ap-task-interaction-state','data-task-dispatch':last.dispatch},last.reason),
      error&&h('p',{role:'alert',className:'ap-task-interaction-error'},error),
      (failed||error)&&onOpenChat&&h('button',{type:'button',onClick:onOpenChat},zh?'返回主对话核对':'Review in the conversation'))
  }
}
