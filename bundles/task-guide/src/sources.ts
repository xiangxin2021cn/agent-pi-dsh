import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import type { ProfessionalTask, Coverage } from '../../../packages/professional-tasks/types.ts'

/** Read only a user-selected path through native filesystem authorization. */
export async function parseTaskSource(agent: any, state: ProfessionalTask, input: any, signal?: AbortSignal) {
  if (!input?.id || !input.path) throw new Error('A stable source id and selected path are required')
  const fs = agent.ctx.get('fs')
  const target = await fs.resolve(input.path, { cwd: agent.session.header.cwd, signal })
  const bytes = await fs.readBytes(target, signal, 64 * 1024 * 1024)
  const path = fs.processPath(target)
  const version = createHash('sha256').update(bytes).digest('hex')
  const prefix = `source:${input.id}:`
  let coverage: Coverage[], content: unknown, pageCount: number | undefined
  if (extname(path).toLowerCase() === '.pdf') {
    const { extractPdfPages } = await import('../../tender-host/src/pdf-text.ts')
    const result = await extractPdfPages(path, input.startPage, input.endPage, signal)
    pageCount = result.pageCount; content = result.pages
    const extracted = new Map(result.pages.map(row => [row.page, row.text]))
    coverage = Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1, text = extracted.get(page)
      const previous = state.coverage.find(row => row.id === `${prefix}page:${page}` && row.version === version)
      return text === undefined ? previous || { id: `${prefix}page:${page}`, title: `${input.path} · ${page}`, version, locator: `${input.path}#page=${page}`, kind: 'page', status: 'missing', review: 'pending' }
        : { id: `${prefix}page:${page}`, title: `${input.path} · ${page}`, version, locator: `${input.path}#page=${page}`, kind: 'page', status: text.trim() ? 'parsed' : 'unreadable', review: previous?.review || 'pending' }
    })
  } else {
    const { inspectDeliverable } = await import('../../tender-host/src/deliverable-format.ts')
    const result = await inspectDeliverable(bytes, path)
    content = result.text
    coverage = [{ id: `${prefix}file`, title: input.path, version, locator: input.path, kind: 'file', status: result.text?.trim() ? 'parsed' : 'unreadable', review: 'pending' }]
  }
  const evidence = { id: `source:${input.id}`, title: input.path, value: `Selected source SHA256 ${version}`, kind: 'source' as const, status: 'verified' as const, applicable: true, locator: input.path, sourcePath: path, sourceHash: version }
  return { patch: { evidence: [...state.evidence.filter(row => row.id !== evidence.id), evidence], coverage: [...state.coverage.filter(row => !row.id.startsWith(prefix)), ...coverage] },
    path, version, ...(pageCount === undefined ? {} : { pageCount }), content, note: 'Only extraction is recorded. Review every page, table, drawing, attachment and addendum with native vision/CAD/Office tools as needed; register referenced missing attachments. No cloud upload was performed.' }
}
