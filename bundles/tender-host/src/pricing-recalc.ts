/**
 * Save-time pipeline: persist reviewed numbers, overlay the pack, rebuild the workbook.
 */
import { existsSync, readFileSync } from 'node:fs'
import { assertInside } from './files.ts'
import {
  inferProjectIdFromPath,
  isProjectPricingMarkdown,
  mergeReviewedRates,
  patchSiblingPricingMarkdown,
  previewSensitivePricingDiff,
  type SensitiveChange,
} from './pricing-review.ts'
import { generatePricingWorkbook, loadPricingPack } from './pricing-workbook.ts'
import { replaceCapability } from './workspace.ts'

export type PricingRecalcResult = {
  applied: boolean
  changeCount: number
  workbook?: string
  patchedFiles: string[]
  deferred?: 'no_pack'
  changes: SensitiveChange[]
}

export function inspectPricingSave(cwd: string, sourcePath: string, content: string, previous?: string): {
  projectId?: string
  pricing: boolean
  hasSensitive: boolean
  changes: SensitiveChange[]
} {
  const path = assertInside(cwd, sourcePath)
  const projectId = inferProjectIdFromPath(cwd, path)
  const pricing = isProjectPricingMarkdown(cwd, path)
  const before = previous ?? (existsSync(path) ? readFileSync(path, 'utf8') : '')
  const diff = previewSensitivePricingDiff(before, content)
  return { projectId, pricing, ...diff }
}

/**
 * After the Markdown write: store reviewed facts, overlay the pack, rebuild xlsx.
 * Missing pack still records the ledger so the next replace picks it up.
 */
export function commitReviewedPricing(
  cwd: string,
  sourcePath: string,
  before: string,
  after: string,
  projectIdHint?: string,
): PricingRecalcResult {
  const path = assertInside(cwd, sourcePath)
  const diff = previewSensitivePricingDiff(before, after)
  const empty: PricingRecalcResult = {
    applied: false,
    changeCount: 0,
    patchedFiles: [],
    changes: diff.changes,
  }
  if (!diff.hasSensitive) return empty
  const projectId = projectIdHint || inferProjectIdFromPath(cwd, path)
  if (!projectId) return empty
  mergeReviewedRates(cwd, projectId, diff.changes)
  const pack = loadPricingPack(cwd, projectId)
  const patchedFiles = patchSiblingPricingMarkdown(path, diff.changes)
  if (!pack) {
    return {
      applied: true,
      changeCount: diff.changes.length,
      patchedFiles,
      deferred: 'no_pack',
      changes: diff.changes,
    }
  }
  replaceCapability(cwd, projectId, 'boq_five_step_pricing', pack)
  let workbook: string | undefined
  try {
    workbook = generatePricingWorkbook({ cwd, projectId }).fileName
  } catch {
    // workbook stays optional when the pack has no items
  }
  return {
    applied: true,
    changeCount: diff.changes.length,
    workbook,
    patchedFiles,
    changes: diff.changes,
  }
}
