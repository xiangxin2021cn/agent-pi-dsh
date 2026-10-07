export const tenderResponseCss = `
.ap-tender-response{border:1px solid var(--border,#d5dae1);border-radius:10px;margin:16px 0;padding:16px;min-width:0;color:var(--text-primary,#273240);font-size:13px}.ap-tender-response h3{font-size:15px;margin:0 0 10px}.ap-tender-response p{margin:6px 0;line-height:1.6;overflow-wrap:anywhere}.ap-tender-response-counts{display:flex;flex-wrap:wrap;gap:6px 16px}.ap-tender-response-muted{color:var(--text-secondary,#687280)}.ap-tender-response-scroll{max-width:100%;overflow:auto;margin-top:12px}.ap-tender-response table{border-collapse:collapse;width:100%;min-width:680px;table-layout:fixed}.ap-tender-response th,.ap-tender-response td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--border,#d5dae1);overflow-wrap:anywhere}.ap-tender-response th{background:var(--bg-secondary,#f4f6f8)}.ap-tender-response button{font:inherit;text-align:left;padding:5px 8px;border:1px solid var(--border,#d5dae1);border-radius:6px;background:var(--bg-secondary,#f4f6f8);color:inherit;cursor:pointer;max-width:100%;overflow-wrap:anywhere}.ap-tender-response-state{display:inline-block;border-radius:4px;padding:2px 6px;background:var(--bg-secondary,#f4f6f8)}.ap-tender-response-state[data-state=stale],.ap-tender-response-state[data-state=blocked],.ap-tender-response-state[data-state=failed]{color:#a23a2e}.ap-tender-response details{margin-top:8px}.ap-tender-response summary{cursor:pointer}.ap-tender-response-compact{border:0;border-top:1px solid var(--border,#d5dae1);border-radius:0;padding:9px 0 0;margin:10px 0 0}.ap-tender-response-compact h3{font-size:13px;margin-bottom:6px}
@media(max-width:600px){.ap-tender-response{padding:10px}.ap-tender-response-compact{padding:9px 0 0}}
`

/** Render the server projection without inferring approval or keeping another task ledger. */
export function renderTenderResponseCoverage(h, coverage, { locale = 'zh', compact = false, onOpenFile, onOpenTask } = {}) {
  if (!coverage) return null
  const zh = !locale.startsWith('en'), t = (cn, en) => zh ? cn : en
  const title = t('投标响应对照', 'Tender response coverage')
  if (coverage.error) return h('section', { className: 'ap-tender-response', 'aria-label': title }, h('h3', null, title), h('p', { role: 'alert' }, t('响应记录暂时无法读取：', 'Response records could not be read: ') + coverage.error))
  const states = {
    unplanned: t('尚无响应计划', 'No response plan'), planned: t('已规划', 'Planned'), drafted: t('已有成稿', 'Draft available'),
    reviewed: t('当前稿已记录复核', 'Current draft review recorded'), needs_review: t('待复核', 'Review needed'), stale: t('变更待复核', 'Changed; review needed'), blocked: t('存在缺口', 'Gaps remain'),
    ready: t('登记检查已通过', 'Registration checks passed'), passed: t('已通过', 'Passed'), review: t('待复核', 'Review needed'), failed: t('未通过', 'Failed'),
  }
  const state = value => h('span', { className: 'ap-tender-response-state', 'data-state': value }, states[value] || t('待核实', 'Unverified'))
  const link = (item, label) => item?.path && onOpenFile
    ? h('button', { type: 'button', title: [item.path, item.locator].filter(Boolean).join(' · '), onClick: () => onOpenFile(item.path, item.locator) }, label || item.title || item.path)
    : h('span', { className: 'ap-tender-response-muted' }, label || item?.title || t('尚无定位', 'No location registered'))
  const rows = coverage.rows || [], counts = coverage.summary || {}
  const sourceGaps = coverage.sourceCoverage?.gaps || []
  const pending = rows.filter(row => ['unplanned', 'needs_review', 'stale', 'blocked'].includes(row.status))
  return h('section', { className: 'ap-tender-response' + (compact ? ' ap-tender-response-compact' : ''), 'aria-label': title, 'data-response-revision': coverage.revision, 'data-response-project': coverage.projectId },
    h('h3', null, title),
    h('div', { className: 'ap-tender-response-counts' },
      [[t('要求', 'Requirements'), counts.requirements], [t('评分项', 'Criteria'), counts.criteria], [t('响应计划', 'Response plans'), counts.planned], [t('已有成稿', 'Drafts'), counts.drafted], [t('依据登记就绪', 'Evidence registered'), counts.evidenced], [t('当前稿已记录复核', 'Draft reviews recorded'), counts.reviewed], [t('变更待复核', 'Stale responses'), counts.stale], [t('存在缺口', 'Blocked responses'), counts.blocked]].map(([label, value]) => h('span', { key: label }, label + ' ' + (value ?? 0)))),
    !rows.length && h('p', null, t('尚未登记项目要求。请在主对话中读取招标文件及补遗，形成响应计划。', 'No project requirements are registered. Read the tender documents and addenda in the conversation to establish a response plan.')),
    coverage.sourceCoverage?.complete !== true && h('p', { className: 'ap-tender-response-muted' }, t('资料完整性尚未确认；登记项的进展不代表整份标书已覆盖。', 'Source completeness is unconfirmed. Progress on registered items does not establish full tender coverage.')),
    !compact && sourceGaps.map((gap, index) => h('p', { key: 'source-' + index, className: 'ap-tender-response-muted' }, gap)),
    compact && pending.slice(0, 2).map(row => h('p', { key: row.kind + ':' + row.id }, state(row.status), ' ', row.title, row.gaps?.[0] ? '：' + row.gaps[0] : '')),
    compact && pending.length > 2 && h('p', { className: 'ap-tender-response-muted' }, t('另有 ' + (pending.length - 2) + ' 项待处理，详见响应对照。', (pending.length - 2) + ' more items need attention; see response coverage.')),
    compact && onOpenTask && h('button', { type: 'button', onClick: onOpenTask }, t('查看响应对照', 'View response coverage')),
    !compact && rows.length > 0 && h('div', { className: 'ap-tender-response-scroll', tabIndex: 0, role: 'region', 'aria-label': t('要求、章节、证据和成稿检查', 'Requirements, chapters, evidence and draft checks') }, h('table', null,
      h('thead', null, h('tr', null, ...[t('要求与评分依据', 'Requirement and criterion'), t('响应章节与成果', 'Response and artifact'), t('材料与工程依据', 'Materials and engineering evidence'), t('当前成稿检查', 'Current draft checks')].map(label => h('th', { key: label, scope: 'col' }, label)))),
      h('tbody', null, ...rows.map(row => h('tr', { key: row.kind + ':' + row.id, 'data-response-row': row.id },
        h('td', null, h('strong', null, row.title), h('p', null, row.kind === 'criterion' ? t('评分项', 'Criterion') : t('项目要求', 'Requirement'), row.mandatory ? t(' · 必须响应', ' · Mandatory response') : '', row.method ? ' · ' + ({ pass_fail: t('通过 / 不通过', 'Pass / fail'), threshold: t('门槛评分', 'Threshold'), weighted: t('加权评分', 'Weighted') })[row.method] : '', row.weight !== undefined ? ' · ' + row.weight : ''),
          row.source && h('p', null, link(row.source), row.source.locator && h('span', { className: 'ap-tender-response-muted' }, ' · ' + row.source.locator)),
          (row.text || row.rubric) && h('details', null, h('summary', null, t('原文与评分细则', 'Source text and scoring rules')), row.text && h('p', null, row.text),
            row.rubric?.text && row.rubric.text !== row.text && h('p', null, row.rubric.text),
            ...(row.rubric?.points || []).map(point => h('p', { key: point.id }, point.text, point.evidenceNeeded?.length ? t('；需提供：', '; Evidence needed: ') + point.evidenceNeeded.join('；') : '')),
            ...(row.rubric?.bands || []).map(band => h('p', { key: band.id }, band.label, band.score !== undefined ? t('（规则分档 ' + band.score + '）', ' (Scoring band ' + band.score + ')') : '', '：' + band.text)))),
        h('td', null, !(row.responses || []).length && state('unplanned'), ...(row.responses || []).map(response => h('div', { key: response.id }, h('p', null, h('strong', null, response.title)), response.section && h('p', null, response.section), response.generationMode && h('p', { className: 'ap-tender-response-muted' }, ({ reuse: t('原件或既有内容复用', 'Reused material'), adapt: t('条件化复用', 'Adapted material'), generate: t('项目生成', 'Project-specific writing') })[response.generationMode] || response.generationMode), h('p', null, link(response, response.path ? t('查看当前成果', 'Open current artifact') : t('尚未关联实际文件', 'No actual file linked'))), h('p', null, state(response.status))))),
        h('td', null, ...(row.responses || []).map(response => h('div', { key: response.id }, (row.responses || []).length > 1 && h('p', null, response.title), !(response.evidence || []).length && h('p', { className: 'ap-tender-response-muted' }, t('尚未登记支持材料', 'No supporting material registered')), ...(response.evidence || []).map((item, index) => h('div', { key: index }, h('p', null, link(item), item.locator ? ' · ' + item.locator : ''), h('p', null, state(item.status)), item.reason && h('p', { className: 'ap-tender-response-muted' }, item.reason)))))),
        h('td', null, state(row.status), ...(row.gaps || []).map((gap, index) => h('p', { key: 'gap-' + index }, gap)), ...(row.responses || []).map(response => response.checks?.length > 0 && h('details', { key: response.id }, h('summary', null, response.title + t(' · 检查依据', ' · Check details')), ...response.checks.map((check, index) => h('p', { key: index }, state(check.status), ' ', check.message))))),
      ))))),
    !compact && h('p', { className: 'ap-tender-response-muted' }, t('响应计划、成稿、证据和复核分别统计；检查结果不预测得分，也不代替评审或最终提交确认。', 'Plans, drafts, evidence and review are counted separately. Checks do not predict scores or replace evaluation and final submission approval.')),
  )
}
