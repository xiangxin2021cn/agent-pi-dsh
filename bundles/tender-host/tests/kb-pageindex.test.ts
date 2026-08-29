import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbContent, kbPageIndexPath, removeKbEntry, saveKbMarkdown } from '../src/kb.ts'
import { readPageIndexShadow } from '../src/pageindex-shadow.ts'

function manuscript(extra = ''): string {
  return ['# Corporate method statement', '<!-- page 1 -->', 'Audited narrative. '.repeat(1000), '## Quality control', '<!-- page 12 -->', 'Inspection and test plan. '.repeat(500), extra].join('\n')
}

test('KB add/save/remove keeps one per-entry PageIndex shadow sidecar without replacing MiniSearch', () => {
  const root = mkdtempSync(join(tmpdir(), 'ap-kb-pageindex-'))
  process.env.AGENT_PI_KB_ROOT = root
  const added = addKbContent({ fileName: 'method.md', text: manuscript(), slug: 'method-pageindex', category: '规范' })
  assert.equal(added.entry.pageIndexStatus, 'ready')
  assert.equal(existsSync(kbPageIndexPath('method-pageindex')), true)
  assert.equal(readPageIndexShadow({ manuscriptPath: added.entry.managedPath, outputPath: kbPageIndexPath('method-pageindex') }).state, 'ready')

  const saved = saveKbMarkdown('method-pageindex', manuscript('## Handover\nHandover records.'))
  assert.equal(saved.entry.pageIndexStatus, 'ready')
  assert.equal(readPageIndexShadow({ manuscriptPath: saved.entry.managedPath, outputPath: kbPageIndexPath('method-pageindex') }).state, 'ready')

  removeKbEntry('method-pageindex')
  assert.equal(existsSync(kbPageIndexPath('method-pageindex')), false)
})
