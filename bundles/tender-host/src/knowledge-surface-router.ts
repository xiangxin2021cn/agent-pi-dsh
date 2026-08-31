export type KnowledgeSurface = 'document' | 'table' | 'graph'

export interface KnowledgeRouteRequest {
  question: string
  documentIds?: string[]
  tableIds?: string[]
  available?: Partial<Record<KnowledgeSurface, boolean>>
  budget?: { maxDocumentNodes?: number; maxTableRows?: number; maxGraphHops?: number }
}

export interface KnowledgeRoutePlan {
  schemaVersion: 1
  surfaces: KnowledgeSurface[]
  documentIds: string[]
  tableIds: string[]
  reason: string[]
  budget: { maxDocumentNodes: number; maxTableRows: number; maxGraphHops: number }
  exactClauseFirst: boolean
  blocked: Array<{ surface: KnowledgeSurface; reason: string }>
  prohibitions: string[]
}

const TABLE = /\b(boq|bill\s+of\s+quantities|pricing\s+schedule|quantity|quantities|unit|rate|amount|formula|subtotal|total|cell|sheet|row|column)\b|工程量|清单|数量|单位|单价|合价|公式|小计|总价|单元格|工作表|逐项/i
const GRAPH = /\b(version|revision|rev\.?|addendum|supersed|dependenc|upstream|downstream|stale|conflict|latest)\b|版本|修订|补遗|替代|依赖|上游|下游|过期|冲突|最新版/i
const DOCUMENT = /\b(requirement|scope|clause|condition|specification|method|risk|qualification|submission|insurance|guarantee|payment|schedule)\b|要求|范围|条款|规范|方法|风险|资格|提交|保险|保函|支付|工期/i
const EXACT_CLAUSE = /\b(?:clause|section|条款|第)\s*[A-Z]?\d+(?:[.\-]\d+){1,5}\b|\b[A-Z]\d+(?:\.\d+){1,5}\b/i

function has(available: KnowledgeRouteRequest['available'], surface: KnowledgeSurface): boolean {
  return available?.[surface] !== false
}

/**
 * Deterministic, inspectable routing. It selects knowledge surfaces, not models.
 * A missing table surface is a hard block for quantity/formula questions.
 */
export function routeKnowledgeSurfaces(input: KnowledgeRouteRequest): KnowledgeRoutePlan {
  const question = String(input.question || '').trim()
  const requested = new Set<KnowledgeSurface>()
  const reason: string[] = []
  const blocked: KnowledgeRoutePlan['blocked'] = []
  const exactClauseFirst = EXACT_CLAUSE.test(question)

  if (TABLE.test(question)) {
    requested.add('table')
    reason.push('检测到数量、单价、公式或单元格问题，必须使用表格面。')
  }
  if (GRAPH.test(question)) {
    requested.add('graph')
    reason.push('检测到版本、补遗、依赖或失效问题，使用关系图面。')
  }
  if (DOCUMENT.test(question) || requested.size === 0 || exactClauseFirst) {
    requested.add('document')
    reason.push(exactClauseFirst
      ? '检测到精确条款号：先走现有 kb_find_clause，再用文档树补上下文。'
      : '检测到叙事性要求或未命中特定结构，使用文档面。')
  }
  if (requested.size > 1) reason.push('问题跨知识面，返回组合路由而非用文档摘要替代结构化数据。')

  const surfaces = [...requested].filter((surface) => {
    if (has(input.available, surface)) return true
    blocked.push({ surface, reason: `${surface} surface unavailable` })
    return false
  })
  const prohibitions: string[] = []
  if (requested.has('table') && !surfaces.includes('table')) {
    prohibitions.push('不得使用文档摘要推算 BOQ 数量、单位、单价、公式或合价。')
  }
  if (requested.has('graph') && !surfaces.includes('graph')) {
    prohibitions.push('不得仅凭文本相似度判断版本优先级、替代关系或能力失效。')
  }
  prohibitions.push('PageIndex 节点摘要只用于导航；最终主张必须落到原文、表格单元格或关系路径。')

  return {
    schemaVersion: 1,
    surfaces,
    documentIds: [...new Set((input.documentIds ?? []).map(String).filter(Boolean))],
    tableIds: [...new Set((input.tableIds ?? []).map(String).filter(Boolean))],
    reason,
    budget: {
      maxDocumentNodes: Math.max(1, Math.min(50, Number(input.budget?.maxDocumentNodes) || 8)),
      maxTableRows: Math.max(1, Math.min(10_000, Number(input.budget?.maxTableRows) || 200)),
      maxGraphHops: Math.max(1, Math.min(12, Number(input.budget?.maxGraphHops) || 4)),
    },
    exactClauseFirst,
    blocked,
    prohibitions,
  }
}
