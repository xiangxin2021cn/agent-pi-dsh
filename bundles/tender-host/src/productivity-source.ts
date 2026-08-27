/**
 * Enterprise productivity files registered at project setup.
 * These outrank local web research and international handbook estimates.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { readJson, tenderDir, writeJson } from './fsutil.ts'
import { officialStageDir } from './outputs.ts'
import { PRICING_PRODUCTIVITY_FILE } from './pricing-local-intel.ts'
import { BOQ_PRICING_STAGE_ID } from './pricing-workbook.ts'

export const ENTERPRISE_PRODUCTIVITY_FILE = 'enterprise-productivity.json'

export type EnterpriseProductivityFile = {
  path: string
  name: string
}

export type EnterpriseProductivityLedger = {
  projectId: string
  updatedAt: string
  source: 'enterprise'
  files: EnterpriseProductivityFile[]
}

/**
 * File-name detector for crew output / daily production tables.
 * Do not add a new TenderDocumentKind; reuse supporting_evidence.
 * @param name File name or path tail.
 */
export function looksLikeProductivityFile(name: string): boolean {
  const n = basename(name).toLowerCase()
  return /工效|日产|台班产量|production[\s._-]*rate|productivity|output[\s._-]*rate|m3[\s._-]*day|m³[\s._-]*day/.test(n)
}

/**
 * @param inputPaths User-selected project sources.
 */
export function scanEnterpriseProductivity(inputPaths: string[]): EnterpriseProductivityFile[] {
  const seen = new Set<string>()
  const files: EnterpriseProductivityFile[] = []
  for (const path of inputPaths) {
    if (!looksLikeProductivityFile(path)) continue
    const key = path.replace(/\\/g, '/').toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    files.push({ path, name: basename(path) })
  }
  return files
}

export function enterpriseProductivityPath(cwd: string, projectId: string): string {
  return join(tenderDir(cwd, projectId), ENTERPRISE_PRODUCTIVITY_FILE)
}

export function readEnterpriseProductivity(cwd: string, projectId: string): EnterpriseProductivityLedger {
  return readJson<EnterpriseProductivityLedger>(enterpriseProductivityPath(cwd, projectId), {
    projectId,
    updatedAt: '',
    source: 'enterprise',
    files: [],
  })
}

/**
 * Rewrite the ledger from the current registration list.
 * @returns The files treated as enterprise productivity.
 */
export function registerEnterpriseProductivity(
  cwd: string,
  projectId: string,
  inputPaths: string[],
): EnterpriseProductivityLedger {
  const ledger: EnterpriseProductivityLedger = {
    projectId,
    updatedAt: new Date().toISOString(),
    source: 'enterprise',
    files: scanEnterpriseProductivity(inputPaths),
  }
  writeJson(enterpriseProductivityPath(cwd, projectId), ledger)
  return ledger
}

/**
 * Seed `当地工效尽调.md` so the pricing gate sees an enterprise-first memo.
 * Does not overwrite a memo the agent or user already wrote.
 */
export function seedEnterpriseProductivityMemo(cwd: string, projectId: string): string | undefined {
  const ledger = readEnterpriseProductivity(cwd, projectId)
  if (ledger.files.length === 0) return undefined
  const dir = officialStageDir(cwd, projectId, BOQ_PRICING_STAGE_ID)
  const path = join(dir, PRICING_PRODUCTIVITY_FILE)
  if (existsSync(path)) return undefined
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, buildEnterpriseProductivityMemo(ledger), 'utf8')
  return path
}

/**
 * Extra stage-draft line when enterprise files are on the project.
 */
export function enterpriseProductivityDraftNote(cwd: string, projectId: string): string {
  const ledger = readEnterpriseProductivity(cwd, projectId)
  if (ledger.files.length === 0) return ''
  const names = ledger.files.map((file) => file.name).join('、')
  return `\n【企业工效优先】已登记：${names}。这些数字是本标工效的最高来源，禁止用 AnySearch 或国际手册覆盖文件里已有的日产/循环。只对文件没有的资源做当地网页检索；仍禁止中国定额。`
}

export function buildEnterpriseProductivityMemo(ledger: EnterpriseProductivityLedger): string {
  const names = ledger.files.map((file) => `- ${file.name}（${file.path}）`).join('\n')
  const body = `# 当地工效尽调

来源优先级：企业登记文件 > 本标人工复核 > 当地网页 > 国际手册 × 当地特征。禁止套中国公路定额或国内台班。

## 项目地址 / location

工时、雨季、运距仍以本标「项目特征」为准。企业工效表给出的是本企业在同类现场的产量，不把 C5.1 示意日产抄进来。

## 企业文件（最高优先）

${names}

上列文件里已经写明的日产、循环、台班产量直接写入 planningBasis.productionRate，assumptionStatus 标 sourced，source 标 enterprise。禁止用网络检索覆盖这些数字。

## AnySearch（仅补文件缺口）

anysearch_capabilities 后，仅对上列文件没有覆盖的工序做 anysearch_batch_search（zone=intl, language=en）。当地网页核到的产量标 local；当地无公开产量再 international handbook × 本标工时/雨季/运距，标 international_adjusted。

## 工效 / productivity / 当地 local

把企业表与缺口检索写成工序表：企业已有 / 当地网页 / 国际推定。写入 planningBasis 的 source 不得把企业数改成网页数。

## 国际 / international 与中国定额

国际手册只填企业文件和当地网页都没有的资源。中国公路定额、全国统一施工机械台班、国内厂宣台班不得作为本标日产起点。

${'企业工效优先；缺口才当地检索或国际推定。不是上一单日产，也不是中国定额。'.repeat(28)}
`
  return body
}
