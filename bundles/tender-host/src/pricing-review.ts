/**
 * Human-reviewed rates and productivity extracted from chapter Markdown.
 * Overlay keeps the structured pack and workbook aligned with those numbers.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  parseTenderBoqFiveStepPricingData,
  type TenderBoqFiveStepItemBuildUp,
  type TenderBoqFiveStepPricingData,
  type TenderBoqPricingCostComponent,
  type TenderBoqResourceConsumption,
} from '../../../packages/business-core/src/tender/index.ts'
import {
  multiplyDecimalStrings,
  sumDecimalStrings,
} from '../../../packages/business-core/src/tender/capabilities/cost/decimal.ts'
import { readJson, tenderDir, writeJson } from './fsutil.ts'

export const REVIEWED_RATES_FILE = 'reviewed-rates.json'

export type SensitiveKind = 'rate' | 'productivity'

export type SensitiveChange = {
  kind: SensitiveKind
  key: string
  label: string
  from: string
  to: string
  unit?: string
  itemHint?: string
  fromRaw: string
  toRaw: string
}

export type ReviewedRateItem = {
  key: string
  kind: SensitiveKind
  label: string
  value: string
  unit?: string
  itemHint?: string
}

export type ReviewedRatesLedger = {
  projectId: string
  updatedAt: string
  source: 'human_reviewed'
  items: ReviewedRateItem[]
}

export type SensitiveFact = {
  kind: SensitiveKind
  key: string
  label: string
  value: string
  unit?: string
  itemHint?: string
  raw: string
}

const RATE_ALIAS_GROUPS = [
  ['diesel', '柴油', 'fuel', '燃油'],
  ['cement', '水泥'],
  ['bitumen', '沥青', 'asphalt'],
  ['labour', 'labor', '人工', 'wage', 'bccei'],
  ['plant hire', '湿租', 'hire'],
  ['aggregate', '骨料', '碎石', 'crusher'],
  ['lime', '石灰'],
  ['steel', '钢筋'],
  ['water', '水价', '市政水'],
  ['sand', '砂'],
]

const PRODUCTIVITY_LABEL = /日产(?:量)?(?:基准)?|production\s*rate|planningBasis\.productionRate|台班产量/i
const SENSITIVE_RATE = /柴油|diesel|fuel|燃油|水泥|cement|沥青|bitumen|asphalt|人工|labour|labor|wage|bccei|湿租|plant\s*hire|骨料|aggregate|石灰|lime|钢筋|steel|水价|市政水|砂|sand|碎石|crusher/i
const ITEM_HINT = /\b(C?\d+(?:\.\d+){1,3}|\d{3}\.\d+)\b/i
const NUMBER = /(?:R\s*)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|[0-9]+(?:\.\d+)?)/
const UNITISH = /m[²³32]?[^\s|,]{0,16}|\/\s*(?:天|day|L|l|t|kg|h|hr|hour|m3|m³)/i

/**
 * @param value Display number, possibly with thousands separators.
 */
export function toPlainDecimal(value: string): string {
  const trimmed = value.replace(/,/g, '').trim()
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal string: ${value}`)
  }
  return trimmed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export function tryPlainDecimal(value: string): string | undefined {
  try {
    return toPlainDecimal(value)
  } catch {
    return undefined
  }
}

/**
 * @param left Numerator as an unformatted decimal string.
 * @param right Denominator as an unformatted decimal string.
 * @param extra Extra fractional digits kept before trim.
 */
export function divideDecimalStrings(left: string, right: string, extra = 8): string {
  const leftValue = parsePlain(left)
  const rightValue = parsePlain(right)
  if (rightValue.coefficient === 0n) throw new Error(`Division by zero: ${left} / ${right}`)
  const scale = leftValue.scale + extra
  const numerator = leftValue.coefficient * 10n ** BigInt(rightValue.scale + extra)
  return formatPlain({
    coefficient: numerator / rightValue.coefficient,
    scale,
  })
}

function parsePlain(value: string): { coefficient: bigint; scale: number } {
  const text = toPlainDecimal(value)
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  return {
    coefficient: BigInt(`${whole}${fraction}` || '0') * (negative ? -1n : 1n),
    scale: fraction.length,
  }
}

function formatPlain(value: { coefficient: bigint; scale: number }): string {
  const negative = value.coefficient < 0n
  const absolute = negative ? -value.coefficient : value.coefficient
  let digits = absolute.toString().padStart(value.scale + 1, '0')
  if (value.scale > 0) {
    const split = digits.length - value.scale
    digits = `${digits.slice(0, split)}.${digits.slice(split)}`.replace(/\.?0+$/, '')
  }
  if (digits === '') digits = '0'
  return negative && digits !== '0' ? `-${digits}` : digits
}

export function normalizeSensitiveLabel(label: string): string {
  return label.toLowerCase().replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()
}

export function reviewedRatesPath(cwd: string, projectId: string): string {
  return join(tenderDir(cwd, projectId), REVIEWED_RATES_FILE)
}

export function emptyReviewedRates(projectId: string): ReviewedRatesLedger {
  return { projectId, updatedAt: '', source: 'human_reviewed', items: [] }
}

export function readReviewedRates(cwd: string, projectId: string): ReviewedRatesLedger {
  return readJson<ReviewedRatesLedger>(reviewedRatesPath(cwd, projectId), emptyReviewedRates(projectId))
}

export function writeReviewedRates(cwd: string, projectId: string, ledger: ReviewedRatesLedger): void {
  writeJson(reviewedRatesPath(cwd, projectId), ledger)
}

export function factKey(kind: SensitiveKind, label: string, itemHint?: string): string {
  return [kind, normalizeSensitiveLabel(label), itemHint || ''].join('|')
}

function headingHint(line: string): string | undefined {
  const heading = line.match(/^#{1,6}\s+(.+)$/)
  if (!heading) return undefined
  const hit = heading[1]!.match(ITEM_HINT)
  return hit ? hit[1] : undefined
}

function captureNumber(text: string): { raw: string; value: string; unit?: string } | undefined {
  const match = text.match(NUMBER)
  if (!match || match[1] === undefined) return undefined
  const value = tryPlainDecimal(match[1])
  if (!value) return undefined
  const after = text.slice((match.index ?? 0) + match[0].length)
  const unit = after.match(UNITISH)?.[0]?.replace(/\s+/g, '')
  return { raw: match[1], value, unit }
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => /^:?-+:?$/.test(cell))
}

/**
 * Pull productivity and key resource rates from a chapter workpaper.
 * @param markdown Chapter Markdown.
 */
export function extractSensitiveFacts(markdown: string): SensitiveFact[] {
  const facts: SensitiveFact[] = []
  let itemHint: string | undefined
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim()
    const nextHint = headingHint(line)
    if (nextHint) itemHint = nextHint
    if (line.startsWith('|')) {
      const cells = line.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0)
      if (cells.length >= 2 && !isSeparatorRow(cells)) {
        const fact = factFromTable(cells, itemHint)
        if (fact) facts.push(fact)
      }
      continue
    }
    const fact = factFromLine(line, itemHint)
    if (fact) facts.push(fact)
  }
  return facts
}

function factFromTable(cells: string[], itemHint?: string): SensitiveFact | undefined {
  const label = cells[0]!.replace(/\*+/g, '').trim()
  const rest = cells.slice(1).join(' ')
  const captured = captureNumber(rest)
  if (!captured) return undefined
  if (PRODUCTIVITY_LABEL.test(label) || /m[³3]\s*\/\s*(?:天|day)|\/\s*天/i.test(rest)) {
    return makeFact('productivity', label || '日产', captured, itemHint)
  }
  if (SENSITIVE_RATE.test(label) || SENSITIVE_RATE.test(rest)) {
    return makeFact('rate', label, captured, itemHint)
  }
  return undefined
}

function factFromLine(line: string, itemHint?: string): SensitiveFact | undefined {
  if (!PRODUCTIVITY_LABEL.test(line) && !SENSITIVE_RATE.test(line)) return undefined
  const captured = captureNumber(line)
  if (!captured) return undefined
  if (PRODUCTIVITY_LABEL.test(line)) {
    const label = line.match(PRODUCTIVITY_LABEL)?.[0] || '日产'
    return makeFact('productivity', label, captured, itemHint)
  }
  const labelMatch = line.match(SENSITIVE_RATE)
  return makeFact('rate', labelMatch?.[0] || '资源', captured, itemHint)
}

function makeFact(
  kind: SensitiveKind,
  label: string,
  captured: { raw: string; value: string; unit?: string },
  itemHint?: string,
): SensitiveFact {
  return {
    kind,
    key: factKey(kind, label, itemHint),
    label,
    value: captured.value,
    unit: captured.unit,
    itemHint,
    raw: captured.raw,
  }
}

/**
 * Compare two Markdown drafts for productivity / key-rate edits.
 * Narrative-only edits return no changes.
 */
export function diffSensitivePricing(before: string, after: string): { changes: SensitiveChange[] } {
  const previous = latestByKey(extractSensitiveFacts(before))
  const next = latestByKey(extractSensitiveFacts(after))
  const changes: SensitiveChange[] = []
  for (const [key, fact] of next) {
    const prior = previous.get(key)
    if (!prior) continue
    if (prior.value === fact.value) continue
    changes.push({
      kind: fact.kind,
      key,
      label: fact.label,
      from: prior.value,
      to: fact.value,
      unit: fact.unit || prior.unit,
      itemHint: fact.itemHint || prior.itemHint,
      fromRaw: prior.raw,
      toRaw: fact.raw,
    })
  }
  return { changes }
}

function latestByKey(facts: SensitiveFact[]): Map<string, SensitiveFact> {
  const map = new Map<string, SensitiveFact>()
  for (const fact of facts) map.set(fact.key, fact)
  return map
}

export function previewSensitivePricingDiff(before: string, after: string): {
  hasSensitive: boolean
  changes: SensitiveChange[]
} {
  const { changes } = diffSensitivePricing(before, after)
  return { hasSensitive: changes.length > 0, changes }
}

export function mergeReviewedRates(
  cwd: string,
  projectId: string,
  changes: SensitiveChange[],
): ReviewedRatesLedger {
  const current = readReviewedRates(cwd, projectId)
  const byKey = new Map(current.items.map((item) => [item.key, item]))
  for (const change of changes) {
    byKey.set(change.key, {
      key: change.key,
      kind: change.kind,
      label: change.label,
      value: change.to,
      unit: change.unit,
      itemHint: change.itemHint,
    })
  }
  const ledger: ReviewedRatesLedger = {
    projectId,
    updatedAt: new Date().toISOString(),
    source: 'human_reviewed',
    items: [...byKey.values()],
  }
  writeReviewedRates(cwd, projectId, ledger)
  return ledger
}

export function isProjectPricingMarkdown(cwd: string, sourcePath: string): boolean {
  const path = isAbsolute(sourcePath) ? sourcePath : resolve(cwd, sourcePath)
  const rel = relative(resolve(cwd), path).replace(/\\/g, '/')
  return /(?:^|\/)Agent Pi Outputs\/[^/]+\/boq-pricing\/.+\.md$/i.test(rel)
}

/**
 * @returns Project id from Official Outputs or the tender store path.
 */
export function inferProjectIdFromPath(cwd: string, sourcePath: string): string | undefined {
  const path = (isAbsolute(sourcePath) ? sourcePath : resolve(cwd, sourcePath)).replace(/\\/g, '/')
  const official = path.match(/Agent Pi Outputs\/([^/]+)\//i)
  if (official?.[1]) return official[1]
  const store = path.match(/\.agent-pi\/business\/tender\/([^/]+)\//i)
  return store?.[1]
}

function aliasesOf(label: string): string[] {
  const n = normalizeSensitiveLabel(label)
  for (const group of RATE_ALIAS_GROUPS) {
    if (group.some((alias) => n.includes(normalizeSensitiveLabel(alias)))) {
      return group.map((alias) => normalizeSensitiveLabel(alias))
    }
  }
  return n ? [n] : []
}

function matchesRate(component: TenderBoqPricingCostComponent | TenderBoqResourceConsumption, change: ReviewedRateItem | SensitiveChange): boolean {
  const hay = normalizeSensitiveLabel(`${component.description} ${'unit' in component ? component.unit : ''}`)
  return aliasesOf(change.label).some((alias) => alias.length >= 2 && hay.includes(alias))
}

function matchesItem(item: TenderBoqFiveStepItemBuildUp, hint?: string): boolean {
  if (!hint) return true
  const n = normalizeSensitiveLabel(hint)
  const code = normalizeSensitiveLabel(item.itemIdentity?.code || '')
  const id = normalizeSensitiveLabel(item.boqItemId)
  const desc = normalizeSensitiveLabel(item.itemIdentity?.description || '')
  return Boolean(
    (code && (code.includes(n) || n.includes(code)))
    || (id && (id.includes(n) || n.includes(id)))
    || (desc && desc.includes(n)),
  )
}

function scaleTimeBased(kind: string, description: string): boolean {
  if (kind === 'labour' || kind === 'plant') return true
  return /diesel|柴油|fuel|燃油|loader|driver|wet hire|湿租/i.test(description)
}

/**
 * Apply human-reviewed (or equivalent) numbers onto a parsed pricing pack.
 * Productivity changes rescale labour / plant / fuel quantities and duration.
 */
export function applyReviewedOverlay(
  pack: TenderBoqFiveStepPricingData,
  ledger: ReviewedRatesLedger,
): TenderBoqFiveStepPricingData {
  if (ledger.items.length === 0) return pack
  const next = structuredClone(pack) as TenderBoqFiveStepPricingData
  for (const item of next.itemBuildUps) {
    const prod = ledger.items.find((row) => row.kind === 'productivity' && matchesItem(item, row.itemHint))
    const oldRate = item.planningBasis?.productionRate
    if (prod && oldRate && oldRate !== prod.value) {
      applyProductivity(item, oldRate, prod.value)
    }
    for (const row of ledger.items) {
      if (row.kind !== 'rate' || !matchesItem(item, row.itemHint)) continue
      for (const component of item.costComponents) {
        if (!matchesRate(component, row) || component.rate === row.value) continue
        component.rate = row.value
        component.amount = multiplyDecimalStrings(component.quantity, component.rate)
        component.assumptionStatus = 'sourced'
      }
    }
    item.directCost = sumDecimalStrings(item.costComponents.map((component) => component.amount))
    if (item.directCostSummary) {
      item.directCostSummary = {
        ...item.directCostSummary,
        unitDirectCost: item.directCost,
        itemDirectCost: multiplyDecimalStrings(item.directCost, item.directCostSummary.boqQuantity),
      }
    }
  }
  return parseTenderBoqFiveStepPricingData(next)
}

function applyProductivity(item: TenderBoqFiveStepItemBuildUp, oldRate: string, newRate: string): void {
  const factor = divideDecimalStrings(newRate, oldRate)
  const inverse = divideDecimalStrings(oldRate, newRate)
  if (item.planningBasis) {
    item.planningBasis.productionRate = newRate
    const qty = item.itemIdentity?.quantity
    item.planningBasis.duration = qty
      ? positiveOr(divideDecimalStrings(qty, newRate), inverse)
      : scaleExisting(item.planningBasis.duration, inverse)
    item.planningBasis.assumptionStatus = 'sourced'
  }
  if (item.productivityBasis) {
    item.productivityBasis.theoreticalProductionRate = scaleExisting(
      item.productivityBasis.theoreticalProductionRate,
      factor,
    )
    item.productivityBasis.scenarios = item.productivityBasis.scenarios.map((scenario) => ({
      ...scenario,
      productionRate: scaleExisting(scenario.productionRate, factor),
    }))
  }
  item.resourceConsumptions = item.resourceConsumptions.map((resource) => {
    if (!scaleTimeBased(resource.kind, resource.description)) return resource
    const quantity = scaleExisting(resource.quantity, inverse)
    return {
      ...resource,
      quantity,
      assumptionStatus: 'sourced' as const,
      calculationBasis: resource.calculationBasis
        ? `${resource.calculationBasis}; human-reviewed productionRate ${oldRate}→${newRate}`
        : `scaled by ${oldRate}/${newRate} after human-reviewed productivity`,
    }
  })
  item.costComponents = item.costComponents.map((component) => {
    if (!scaleTimeBased(component.kind, component.description)) {
      return { ...component, amount: multiplyDecimalStrings(component.quantity, component.rate) }
    }
    const quantity = scaleExisting(component.quantity, inverse)
    return {
      ...component,
      quantity,
      amount: multiplyDecimalStrings(quantity, component.rate),
      assumptionStatus: 'sourced',
    }
  })
}

function scaleExisting(value: string, factor: string): string {
  return multiplyDecimalStrings(value, factor)
}

function positiveOr(value: string, fallback: string): string {
  return /[1-9]/.test(value) ? value : fallback
}

/**
 * Replace labeled old numbers in sibling chapter Markdown.
 * Only touches a line that still carries the same label.
 */
export function patchLabeledValues(text: string, changes: SensitiveChange[]): { text: string; hits: number } {
  let next = text
  let hits = 0
  for (const change of changes) {
    if (!change.fromRaw || change.fromRaw === change.toRaw) continue
    const label = escapeRegExp(change.label).replace(/\s+/g, '\\s+')
    const raw = escapeRegExp(change.fromRaw)
    const pattern = new RegExp(`(^.*${label}.*?)(${raw})`, 'm')
    if (!pattern.test(next)) continue
    next = next.replace(pattern, `$1${change.toRaw}`)
    hits += 1
  }
  return { text: next, hits }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function patchSiblingPricingMarkdown(
  savedPath: string,
  changes: SensitiveChange[],
): string[] {
  if (changes.length === 0) return []
  const dir = dirname(savedPath)
  const saved = resolve(savedPath)
  const patched: string[] = []
  if (!existsSync(dir)) return patched
  for (const name of readdirSync(dir)) {
    if (!/\.md$/i.test(name)) continue
    const path = join(dir, name)
    if (resolve(path) === saved) continue
    const before = readFileSync(path, 'utf8')
    const result = patchLabeledValues(before, changes)
    if (result.hits === 0 || result.text === before) continue
    writeFileSync(path, result.text, 'utf8')
    patched.push(path)
  }
  return patched
}
