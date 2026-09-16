/** Only a direct human request can activate the report-writing guidance. */
export function isReportWritingRequest(message: any): boolean {
  if (message?.source?.kind !== 'user') return false
  const text = (message.content || []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n')
    .replace(/```[\s\S]*?```/g, '').replace(/^\s*>.*$/gm, '')
  return text.split(/[。！？!?；;\n]/u).some((clause: string) => {
    if (/(?:不要|不用|无需|不需要|别).{0,12}(?:写|编制|生成|报告|huashu)|\b(?:do not|don't|no need to)\s+(?:write|create|draft|revise)/i.test(clause)) return false
    if (/(?:如何|怎么|怎样).{0,12}(?:写|编制|生成)|(?:解释|介绍|讲解).{0,30}(?:写|编制|生成)|\b(?:how\s+(?:do|to|can)|explain|describe)\b/i.test(clause)) return false
    // A request to inspect existing material is not a writing instruction,
    // even when that material happens to mention writing a report.
    if (/^\s*(?:请|帮我|请帮我)?\s*(?:阅读|读一下|总结|分析|审核|审阅|检查|翻译|打开|看看|查看|修复|修好)|^\s*(?:please\s+)?(?:read|summari[sz]e|review|analyse|analyze|translate|open|debug|fix)\b/i.test(clause)) return false
    return /(?:编制|撰写|起草|生成|制作|出具|修订|完善|重写|写|做).{0,80}(?:报告|白皮书|调研报告|研究论文|投标文件|技术标)/u.test(clause)
      || /(?:报告|白皮书|研究论文|投标文件|技术标).{0,20}(?:请|帮我|需要|要求).{0,12}(?:编制|撰写|起草|生成|制作|修订|完善|重写|写)/u.test(clause)
      || /\b(?:write|draft|prepare|create|revise|produce)\b.{0,80}\b(?:report|white\s*paper|research\s*paper|technical\s*proposal)\b/i.test(clause)
      || /(?:使用|调用|启用|用)\s*huashu-report/i.test(clause)
  })
}

export const REPORT_SKILL_GUIDANCE = '用户本次要求编制专业报告。执行前使用 DSH 原生 skill 工具加载 huashu-report，并读取其 AGENT-PI-ADAPTATION.md；按需读取参考资料。先明确用途和证据口径，再写作、制作图表并检查实际交付物。已有用户要求和招标文件格式优先，不强制套用研究报告模板。不启用额外投标流程、不自动加载知识库、不自动保存复用模板。'

export function registerReportSkillRouting(ctx: any) {
  const active = new WeakMap<object, boolean>()
  ctx.on('agent/inbox/claimed', ({ agent, message }: any) => {
    if (message?.source?.kind === 'user') active.set(agent, isReportWritingRequest(message))
  })
  ctx.systemPrompt?.context?.({
    name: 'agent-pi:report-skill', order: 46,
    text: ({ agent }: any) => agent && active.get(agent) ? REPORT_SKILL_GUIDANCE : '',
  })
}
