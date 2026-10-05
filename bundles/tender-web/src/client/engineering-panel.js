export const engineeringPanelCss = `
.ap-engineering{border:1px solid var(--border,#d5dae1);border-radius:10px;padding:16px;margin:16px 0;min-width:0;color:var(--text-primary,#273240)}
.ap-engineering h3{margin:0 0 10px}.ap-engineering p{line-height:1.6;overflow-wrap:anywhere}.ap-engineering .ap-engineering-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ap-engineering button{font:inherit;padding:6px 10px;border:1px solid var(--border,#d5dae1);border-radius:6px;color:inherit;background:var(--bg-secondary,#f4f6f8);cursor:pointer}.ap-engineering button[aria-pressed=true]{background:var(--accent,#285c7b);color:#fff}.ap-engineering small{color:var(--text-secondary,#687280)}.ap-engineering details{margin:12px 0;border-top:1px solid var(--border,#d5dae1);padding-top:10px}.ap-engineering summary{cursor:pointer}.ap-engineering-scroll{overflow:auto;max-width:100%}.ap-engineering table{border-collapse:collapse;width:100%;font-size:13px}.ap-engineering th,.ap-engineering td{text-align:left;padding:8px;border-bottom:1px solid var(--border,#d5dae1);white-space:normal;min-width:70px}.ap-engineering [role=alert]{color:#b74434}
`

export function latestEngineeringRuns(runs) {
  const scope = row => (row.dependencies || []).map(ref => JSON.stringify([ref.kind, ref.id, ref.parameter || ''])).sort().join('|')
  return [...new Map((runs || []).map(row => [row.providerId + ':' + (row.input?.action || '') + ':' + scope(row), row])).values()]
}

export function createEngineeringPanel({ React, api, language, onOpenFile }) {
  const h = React.createElement
  const BimPreview = createBimPreview({ React })
  return function EngineeringPanel({ sessionId, cwd, expectedProjectKey, hideEmpty = false }) {
    const [state, setState] = React.useState(null), [error, setError] = React.useState('')
    const [selected, setSelected] = React.useState(''), [refresh, setRefresh] = React.useState(0)
    const [selectedBimId, setSelectedBimId] = React.useState('')
    const zh = !language?.()?.startsWith('en'), t = (cn, en) => zh ? cn : en
    React.useEffect(() => {
      setState(null); setError(''); setSelected(''); setSelectedBimId('')
      if (!sessionId) return
      const controller = new AbortController()
      let loading = false
      const load = async () => {
        if (loading || controller.signal.aborted) return
        loading = true
        try {
          const next = await api('/api/agent-pi/engineering?sessionId=' + encodeURIComponent(sessionId), cwd, { signal: controller.signal })
          if (!controller.signal.aborted) { setState(next); setError('') }
        } catch (e) { if (!controller.signal.aborted) setError(e.message) }
        finally { loading = false }
      }
      void load()
      const timer = setInterval(load, 5000)
      return () => { controller.abort(); clearInterval(timer) }
    }, [sessionId, cwd, refresh])
    if (!sessionId || hideEmpty && (!state || !state.runs.length && !state.project.objects.length)) return null
    if (expectedProjectKey && state?.project.id !== expectedProjectKey) return null
    const table = (headers, rows) => h('div', { className: 'ap-engineering-scroll' }, h('table', null,
      h('thead', null, h('tr', null, headers.map((text, index) => h('th', { key: index, scope: 'col' }, text)))),
      h('tbody', null, rows.map((row, index) => h('tr', { key: index, style: selectedBimId && row.includes(selectedBimId) ? { background: '#d7eef2', color: '#203b44' } : undefined }, row.map((cell, i) => h('td', { key: i }, cell)))))))
    const value = number => number === null || number === undefined ? t('待核实', 'Unknown') : String(number)
    const project = state?.project, objects = project?.objects || []
    const sources = project?.sources || []
    const object = objects.find(row => row.id === selected)
    const visibleSources = object ? sources.filter(row => object.sources.some(ref => ref.sourceId === row.id) || Object.values(object.parameters).some(parameter => parameter.sources.some(ref => ref.sourceId === row.id))) : sources
    const basisLabel = { geometry: t('几何', 'Geometry'), measurement: t('计量', 'Measurement'), fabrication: t('加工', 'Fabrication') }
    return h('section', { className: 'ap-engineering', 'aria-label': t('工程数据与计算', 'Engineering data and calculations') },
      h('div', { className: 'ap-engineering-tools' }, h('h3', null, t('工程数据与计算', 'Engineering data and calculations')), h('button', { onClick: () => setRefresh(value => value + 1) }, t('刷新工程记录', 'Refresh engineering records'))),
      error && h('p', { role: 'alert' }, error),
      !state ? h('p', null, t('正在读取工程记录…', 'Reading engineering records…')) : h(React.Fragment, null,
        h('p', null, t('来源 ', 'Sources ') + sources.length + t(' · 构件 ', ' · Objects ') + objects.length + t(' · 采用规则 ', ' · Adopted rules ') + project.ruleAdoptions.length),
        h('small', null, t('在主对话中补充或修正条件，这里同步显示依据、数量和缺口。计算结果仍需专业复核与加工批准。', 'Clarify conditions in the conversation. Sources, quantities and gaps update here. Calculations still require professional review and fabrication approval.')),
        objects.length > 0 && h('div', { className: 'ap-engineering-tools', style: { marginTop: 12 } },
          h('button', { 'aria-pressed': !selected, onClick: () => setSelected('') }, t('全部构件', 'All objects')),
          ...objects.map(row => h('button', { key: row.id, 'aria-pressed': selected === row.id, onClick: () => setSelected(row.id) }, row.title))),
        object && table([t('参数', 'Parameter'), t('值', 'Value'), t('核实状态', 'Review state')], Object.entries(object.parameters).map(([key, row]) => [zh ? ({length:'长度',width:'宽度',height:'高度',thickness:'厚度',diameter:'直径',count:'数量'})[key] || key : key, value(row.value) + (row.unit ? ' ' + row.unit : ''), row.status === 'confirmed' ? t('已确认', 'Confirmed') : t('待复核', 'Review required')])),
        project.quantities.length > 0 && h('details', null, h('summary', null, t('构件数量与算式', 'Object quantities and formulae')), table([t('数量', 'Quantity'), t('口径', 'Basis'), t('值', 'Value'), t('算式', 'Formula'), t('状态', 'Status')], project.quantities.filter(row => !selected || row.objectIds.includes(selected)).map(row => [row.title, ({ geometric: t('几何', 'Geometry'), contract: t('合同计量', 'Contract'), fabrication: t('下料', 'Fabrication'), procurement: t('采购', 'Procurement') })[row.purpose], value(row.value) + ' ' + row.unit, row.formula, row.status === 'reviewed' ? t('已复核', 'Reviewed') : row.status === 'stale' ? t('待重算', 'Recalculate') : t('待核实', 'Review required')]))),
        project.ruleAdoptions.length > 0 && h('details', null, h('summary', null, t('项目锁定的规则版本', 'Project-pinned rule versions')), table([t('规则包', 'Rule pack'), t('采用版本', 'Adopted version'), t('范围', 'Scope'), t('内容指纹', 'Content fingerprint')], project.ruleAdoptions.map(row => [row.packId, row.version, [row.scope.country, row.scope.region, row.scope.discipline].filter(Boolean).join(' · '), row.contentHash.slice(0, 16)]))),
        visibleSources.length > 0 && h('details', null, h('summary', null, t('原图与资料依据', 'Drawing and source references')),
          ...visibleSources.map(row => h('p', { key: row.id }, row.path && onOpenFile ? h('button', { onClick: () => onOpenFile(row.path, cwd) }, row.title) : row.title, h('small', null, ' · ' + (row.revision || row.sha256.slice(0, 12)) + ' · ' + (row.status === 'active' ? t('当前版', 'Current') : t('需检查版本', 'Check version')))))),
        project.coverage.length > 0 && h('details', null, h('summary', null, t('独立范围检查清单', 'Independent scope checklist')), table([t('检查对象', 'Scope item'), t('状态', 'Status'), t('说明', 'Reason')], project.coverage.map(row => [row.title, ({ pending: t('待处理', 'Pending'), reviewed: t('已复核', 'Reviewed'), missing: t('缺失', 'Missing'), excluded: t('明确排除', 'Excluded'), stale: t('变更待复核', 'Changed; review') })[row.status], row.reason || '—']))),
        ...latestEngineeringRuns(state.runs).map(run => {
          const details = run.output.details, calculation = details?.calculation || details, rows = calculation?.rows || []
          return h('details', { key: run.id, open: true, 'data-engineering-provider': run.providerId },
            h('summary', null, run.title + (run.status === 'stale' ? t(' · 依据变化，待重算', ' · Inputs changed; recalculate') : '')),
            h('p', null, run.output.summary),
            (!run.providerAvailable || run.providerChanged) && h('p', { role: 'alert' }, !run.providerAvailable ? t('插件已停用，历史结果保留。', 'Plugin unavailable; historical result retained.') : t('插件版本已变化，请复核采用版本。', 'Plugin version changed; review adopted version.')),
            calculation?.totalsByBasis && table([t('数量口径', 'Quantity basis'), t('已知长度 / m', 'Known length / m'), t('已知质量 / kg', 'Known mass / kg'), t('不完整钢筋组', 'Incomplete groups')], Object.entries(calculation.totalsByBasis).map(([basis, row]) => [basisLabel[basis] || basis, row.knownLengthM, row.knownMassKg, row.incompleteRows])),
            calculation?.totalsByBasis && calculation.coverage && h('p', null, calculation.coverage.declared ? t('本次计算范围：', 'Calculation scope: ') + calculation.coverage.calculated + ' / ' + calculation.coverage.expected + t(' 组已计算；仍须专业复核。', ' groups calculated; review still required.') : t('尚未建立独立范围清单，不能据此判断全图完整。', 'No independent scope inventory; whole-drawing completeness is unknown.')),
            rows.some(row => row.quantities) && table([t('钢筋组', 'Bar group'), t('根数', 'Count'), t('直径 / mm', 'Diameter / mm'), t('加工单根长 / m', 'Fabrication length / m'), t('问题', 'Gaps')], rows.filter(row => row.quantities).map(row => [row.mark || row.id, value(row.count), value(row.diameterMm), value(row.quantities.fabrication.singleLengthM), (row.missingInputs || []).join('；') || t('待专业复核', 'Review required')])),
            details?.responseMatrix && table([t('招标要求', 'Requirement'), t('响应状态', 'Response'), t('依据与缺口', 'Evidence and gaps')], details.responseMatrix.map(row => [row.title, ({ supported: t('已有支持证据', 'Supported'), conflict: t('存在矛盾', 'Conflict'), needs_evidence: t('待补证据', 'Evidence needed'), needs_review: t('待复核', 'Review required') })[row.status], row.reasons.join('；')])),
            details?.boqComparison && h('p', null, t('与原始清单比较：', 'Original BOQ comparison: ') + details.boqComparison.differences.length + t(' 项差异；原始清单保持独立。', ' differences; original baseline retained.')),
            run.providerId === 'road' && details?.subtotals && table([t('线路与工作范围', 'Alignment and work scope'), t('已知几何体积 / m³', 'Known geometry / m³'), t('已计分段', 'Included intervals'), t('未解决分段', 'Unresolved intervals')], details.subtotals.map(row => [row.scope, row.knownVolumeM3, row.includedIntervals, row.unresolvedIntervals])),
            run.providerId === 'road' && Array.isArray(details?.coverage) && table([t('范围', 'Scope'), t('桩号区间 / m', 'Station range / m'), t('未覆盖区间', 'Missing ranges')], details.coverage.map(row => [row.scope, row.startM + ' — ' + row.endM, row.status === 'excluded' ? row.reason : row.gaps.map(gap => gap.startM + ' — ' + gap.endM).join('；') || t('所列范围已计算，待复核', 'Declared range calculated; review pending')])),
            run.recordKind === 'observation' && details?.inventory && h('p', null, t('已登记图纸目录：', 'Drawing inventory: ') + details.inventory.length + t(' 项；本次读取 ', ' items; inspected in this operation: ') + details.observedIds.length + t(' 项。读取记录与专业复核分开保存。', ' items. Reading and professional review are separate.')),
            details?.details?.imagePath && onOpenFile && h('button', { onClick: () => onOpenFile(details.details.imagePath, cwd) }, t('查看本次高清图纸区域', 'Open inspected drawing region')),
            run.providerId === 'bim-ifc' && details?.source?.path && onOpenFile && h('button', { onClick: () => onOpenFile(details.source.path, cwd) }, t('查看 IFC 文件', 'Open IFC file')),
            run.providerId === 'bim-ifc' && details?.elements?.some(row => row.mesh) && h(BimPreview, { elements: details.elements, zh, selectedId: selectedBimId, onSelect: setSelectedBimId }),
            run.providerId === 'bim-ifc' && details?.elements?.some(row => 'netVolumeM3' in row) && table([t('构件', 'Element'), 'GlobalId', t('几何净体积 / m³', 'Net geometry / m³'), t('几何毛体积 / m³', 'Gross geometry / m³'), t('扣除开口 / m³', 'Opening subtraction / m³'), t('复核状态', 'Review')], details.elements.map(row => [h('button', { onClick: () => setSelectedBimId(row.globalId) }, row.name || row.type), row.globalId, value(row.netVolumeM3), value(row.grossVolumeM3), value(row.openingVolumeM3), row.status === 'failed' ? t('计算失败，保留缺口', 'Failed; unresolved') : t('待专业复核', 'Review required')])),
            run.providerId === 'bim-ifc' && details?.elements?.some(row => row.nativeQuantities?.length) && table([t('构件', 'Element'), t('原生数量名称', 'Authored quantity'), t('原生值', 'Authored value'), t('单位依据', 'Unit basis')], details.elements.flatMap(row => (row.nativeQuantities || []).map(quantity => [row.name || row.globalId, quantity.set + ' / ' + quantity.name, value(quantity.value), quantity.unit ? JSON.stringify(quantity.unit) : quantity.unitBasis]))),
            run.providerId === 'bim-ifc' && details?.page && h('p', null, t('本次返回构件 ', 'Returned elements ') + details.page.returned + ' / ' + details.page.totalMatched + (details.page.nextOffset !== null ? t('；尚有下一页，不代表全模型覆盖。', '; more pages remain.') : t('；仍需核对模型与图纸完整性。', '; drawing and model completeness still need review.'))),
            run.providerId === 'civil-quantities' && details?.rows && table([t('对象', 'Object'), t('数量', 'Quantity'), t('单位', 'Unit'), t('算式与依据', 'Formula and basis'), t('缺口', 'Gaps')], details.rows.map(row => [row.title, value(row.quantity), row.unit, row.formula, row.issues.map(issue => issue.message).join('；') || t('待专业复核', 'Review required')])),
            run.providerId === 'civil-quantities' && details?.totals && table([t('对象类型', 'Object type'), t('数量口径', 'Basis'), t('完整对象小计', 'Complete-object subtotal'), t('已知部分小计', 'Known partial subtotal'), t('单位', 'Unit')], details.totals.map(row => [({ pipe: t('管线', 'Pipe'), drain: t('排水沟', 'Drain'), road_layer: t('道路结构层', 'Road layer'), rectangular: t('矩形构件', 'Rectangular solid'), count: t('构筑物计数', 'Asset count') })[row.kind], ({ plan_2d: t('平面投影', 'Plan projection'), spatial_3d: t('空间路径', 'Spatial path'), plan_area_thickness: t('平面面积×厚度', 'Plan area × thickness'), rectangular_solid: t('矩形几何体', 'Rectangular solid'), count: t('明确计数', 'Explicit count'), unknown: t('待核实', 'Unknown') })[row.quantityBasis], value(row.completeSubtotal), value(row.knownPartialSubtotal), row.unit])),
            run.providerId === 'civil-quantities' && details?.action === 'calibrate_pdf' && h('p', null, details.status === 'calibrated' ? t('当前图纸视口已标定；更换页面、版本或缩放范围后需重新核对。', 'Current drawing viewport calibrated; verify again after page, revision or viewport changes.') : t('比例尚未可靠确定，不能据此算量。', 'Scale remains unresolved; quantities cannot rely on it.')),
            run.sourceIssues?.length > 0 && h('p', { role: 'alert' }, run.sourceIssues.map(row => row.message).join('；')),
            run.output.issues.length > 0 && h('details', null, h('summary', null, t('待核实与检查提示：', 'Review items: ') + run.output.issues.length), h('ul', null, ...run.output.issues.map((row, index) => h('li', { key: index }, row.message)))),
            h('small', null, run.createdAt.replace('T', ' ').slice(0, 19) + ' · ' + run.providerVersion))
        }),
        !state.runs.length && h('p', null, t('尚无工程计算。主对话读取实际图纸、料表或招标资料后，会在这里记录计算及缺口。', 'No calculations yet. Results appear here after the conversation examines project drawings, schedules or tender documents.')),
        h('details', null, h('summary', null, t('已启用的专业插件', 'Enabled professional plugins')), ...state.providers.map(row => h('div', { key: row.id }, h('p', null, row.title + ' · ' + row.version), h('ul', null, ...row.limitations.map((text, index) => h('li', { key: index }, text))))))))
  }
}
import { createBimPreview } from './engineering-bim-view.js'
