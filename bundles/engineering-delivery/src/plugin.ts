import { exportEngineeringFiles } from './export.ts'
import type { ExportState } from './tables.ts'

const snapshotState = (state: any) => JSON.stringify({ projectId: state.project.id, revision: state.revision, sources: (state.sourceChecks || []).map((row: any) => ({ id: row.sourceId, status: row.status, actualHash: row.actualHash })), runs: state.runs.map((run: any) => ({ id: run.id, status: run.status, providerAvailable: run.providerAvailable, providerChanged: run.providerChanged })) })

export function registerEngineeringDelivery(ctx: any, defineTool: (definition: any) => any) {
  ctx.tools.register(defineTool({
    name: 'engineering_export', description: '从当前主对话的真实工程账本导出新工程计算书、XLSX、CSV及完整JSON快照，登记任务交付证据。保存分口径数量、专业逐项结果与未解决项；不授予验收或加工批准。',
    parameters: { outputBasename: { type: 'string', description: '可选新交付目录名称前缀，默认工程计算交付；仅文字/数字/下划线/短横线，不能传目录路径。' } },
    output: { schema: { type: 'json' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args: any, exec: any) {
      const session = exec.agent?.session
      if (!session?.id || !session.header?.cwd) throw new Error('工程交付需要实际主对话及工作目录。')
      const state = structuredClone(ctx.engineering.status(session.id)) as ExportState
      if (state.scope?.sessionId !== session.id || session.header.parentSession) throw new Error('工程交付由所属主对话生成；子任务先提交结果。')
      if (args.project !== undefined || args.state !== undefined || args.cwd !== undefined) throw new Error('导出只能读取本会话工程账本，不能使用调用者提供的项目 JSON 或工作目录。')
      exec.signal?.throwIfAborted()
      const result = exportEngineeringFiles(session.header.cwd, state, args.outputBasename)
      const after = ctx.engineering.status(session.id), changed = snapshotState(state) !== snapshotState(after)
      if (changed) result.warnings.push('导出期间工程来源、版本或能力状态发生变化；此包为历史快照，待按最新状态重新生成。')
      let synchronization: { status: string; message?: string } = { status: 'unavailable', message: '本次任务服务未启用；文件已生成，尚未登记交付证据。' }
      const guide = ctx.get?.('taskGuide')
      if (guide && after.project.id === state.project.id) {
        try {
          ctx.engineering.syncTask?.(session.id)
          const task = guide.read(session.id), id = `engineering-delivery:${result.exportId}`
          const stateEvidenceId = ctx.engineering.stateEvidenceId?.(session.id)
          const dependsOn = stateEvidenceId && task.evidence.some((row: any) => row.id === stateEvidenceId) ? [stateEvidenceId] : []
          if (!dependsOn.length) result.warnings.push('工程尚未登记可追踪状态版本；本次文件未建立工程变更自动复核关联。')
          const mainFiles = result.files.filter(file => file.mimeType === 'text/html' || file.mimeType.includes('spreadsheetml') || file.path.endsWith('source-snapshot.json'))
          const snapshot = mainFiles.find(file => file.path.endsWith('source-snapshot.json'))!
          const evidence = mainFiles.map(file => ({ id: `${id}:${file.title}`, title: file.title, kind: 'derived', status: 'unverified', value: `工程快照 r${result.revision} 导出；待专业复核。`, basis: `工程项目 ${state.project.id} r${result.revision} 的来源、对象、采用规则、分口径数量及历史运行投影；完整数据快照 ${snapshot.path}，SHA256 ${snapshot.sha256}。`, dependsOn, sourcePath: file.path, sourceHash: file.sha256, locator: file.path }))
          const deliverables = mainFiles.map((file, i) => ({ id: `${id}:${i}`, title: file.title, path: file.path, requirementIds: [], stepIds: [], evidenceIds: [evidence[i].id], status: changed ? 'stale' : 'draft', signature: 'not_required', checks: [{ kind: 'file', status: 'passed', detail: `已生成文件，SHA256 ${file.sha256}` }, { kind: 'professional', status: 'review', detail: '由工程账本快照派生，仍需专业复核；不构成客户验收或加工批准。' }] }))
          const finding = { id, title: '工程计算交付包已生成', summary: `工程版本 r${result.revision} 已导出 ${result.files.length} 个文件。${result.warnings.join(' ')}`, goalImpact: '不同数量口径、历史运行、未知项和来源版本分别保留，交付包等待专业复核。', evidenceIds: evidence.map(row => row.id), status: 'open', importance: changed ? 'critical' : 'normal', createdRevision: task.revision + 1, updatedRevision: task.revision + 1, source: { engine: 'engineering-delivery', toolCallId: result.exportId }, actions: mainFiles.map((file, i) => ({ kind: 'source', label: `查看${file.title}`, target: evidence[i].id })) }
          guide.update(session.id, { evidence: [...task.evidence, ...evidence], deliverables: [...task.deliverables, ...deliverables], findings: [...task.findings, finding] }, task.revision, 'host', { summary: '工程计算书和工作簿已生成，待专业复核' })
          synchronization = { status: 'recorded' }
        } catch (error) { synchronization = { status: 'failed', message: `文件已生成，交付记录同步失败：${String(error)}` } }
      } else if (after.project.id !== state.project.id) synchronization = { status: 'failed', message: '对话绑定项目已切换，旧项目交付文件未写入新任务。' }
      return { ...result, synchronization, snapshotChanged: changed, openHint: '返回实际绝对文件路径。优先用原生文件预览打开 HTML；若 univer_import 可用，将 engineering-workbook.xlsx 导入 Office。CSV 和 JSON 为独立真实文件，不替代原始清单。' }
    },
  }))
  ctx.systemPrompt.section({ name: 'agent-pi:engineering-delivery', order: 46, text: '用户需要工程计算书或 Office 交付时，先核查 engineering_project 当前来源、对象、规则、口径和缺口，再 engineering_export 从当前账本生成新文件。不要向导出工具传入自行重建的 project JSON。返回 XLSX 是真实工作簿，可用实际可用的 univer_import 打开；HTML 用原生文件预览。导出不自动消除 stale、未知、漏项或专业复核，客户验收和加工批准必须保留独立。' })
  ctx.inject?.(['professionalCapabilities'], (scope: any) => scope.effect(() => scope.professionalCapabilities.register({
    id: 'engineering-delivery:export', owner: 'dsh-agent-pi-engineering-delivery', version: '5.8.0', title: '工程计算书与 Office 交付', description: '从同一工程账本导出真实工作簿、计算书和原始快照并关联本次任务。',
    professions: ['quantity', 'report', 'spreadsheet'], tools: ['engineering_export'], skills: [], inputs: ['当前工程来源、规则、计算记录和覆盖缺口'], outputs: ['XLSX（现有 Office 库可用时）、CSV、HTML 和 JSON'], limitations: ['不自动完成专业复核、客户验收或加工批准', '不跨运行和不同计量口径自动累计', '缺 XLSX 运行库时明确返回 CSV/HTML'], supplements: ['专业复核及当前工程依据'],
  })))
}
