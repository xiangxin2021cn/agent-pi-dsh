import { extname } from 'node:path'
import type { ProfessionalTask } from '../../../packages/professional-tasks/types.ts'
import { kbRoot } from '../../tender-host/src/kb.ts'
import { getSessionTemplateBindings, validateTemplateBindings, verifySessionTemplateArtifact } from '../../tender-host/src/template-dna-task.ts'

export type TaskTemplateState = Pick<ProfessionalTask, 'templateBindings' | 'templateWritingFingerprint' | 'templateBindingIssue'>

export function readTaskTemplateState(task: Pick<ProfessionalTask, 'sessionId' | 'binding'>): TaskTemplateState {
  try {
    const bindings = getSessionTemplateBindings(kbRoot(), task.sessionId)
    if (bindings.length) validateTemplateBindings(kbRoot(), bindings, bindings.map(row => row.slug))
    return { templateBindings: bindings.length ? bindings : undefined, templateWritingFingerprint: undefined, templateBindingIssue: undefined }
  } catch (error) {
    return { templateBindings: undefined, templateWritingFingerprint: undefined, templateBindingIssue: '固定主范本无法校验：' + (error instanceof Error ? error.message : String(error)).slice(0, 3800) }
  }
}

export function sameTaskTemplateState(left: TaskTemplateState, right: TaskTemplateState): boolean {
  return JSON.stringify([left.templateBindings, left.templateWritingFingerprint, left.templateBindingIssue]) === JSON.stringify([right.templateBindings, right.templateWritingFingerprint, right.templateBindingIssue])
}

/** The caller must have read these bytes through the executor's authorized filesystem. */
export function verifyTaskTemplateBytes(task: ProfessionalTask, cwd: string, path: string, bytes: Uint8Array) {
  if (!task.templateBindings?.length && !task.templateWritingFingerprint && !task.templateBindingIssue) return null
  if (task.templateBindingIssue) return { status: 'review' as const, detail: task.templateBindingIssue }
  const extension = extname(path).toLowerCase()
  const format = ['.md', '.markdown', '.txt'].includes(extension) ? 'md' : extension === '.docx' ? 'docx' : extension === '.pdf' ? 'pdf' : undefined
  if (!format) return { status: 'review' as const, detail: '当前成果格式尚不能按固定主范本检查。' }
  const result = verifySessionTemplateArtifact(kbRoot(), task.sessionId, { bytes: Buffer.from(bytes), format })
  return { status: result.receipts.some(row => row.status === 'failed') ? 'failed' as const : result.receipts.some(row => row.status !== 'passed') ? 'review' as const : 'passed' as const, detail: JSON.stringify(result) }
}
