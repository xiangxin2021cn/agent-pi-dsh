import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { rebuildSetupPack } from '../src/setup-restore.ts'
import { readPageIndexShadow } from '../src/pageindex-shadow.ts'

test('saving a long setup manuscript rebuilds its pack and PageIndex shadow together', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ap-setup-pageindex-'))
  const manuscript = join(dir, 'manuscript.md')
  const pack = join(dir, 'pack.json')
  const body = ['# Tender Volume', '<!-- page 1 -->', 'Narrative requirement. '.repeat(900), '## Submission', '<!-- page 9 -->', 'Returnable schedules. '.repeat(400)].join('\n')
  writeFileSync(manuscript, body)
  writeFileSync(pack, `${JSON.stringify({ schemaVersion: 1, kind: 'agent-pi-kb-pack', role: 'agent-pi-setup-restore', manuscript: 'manuscript.md', originalName: 'Volume 1.pdf', originalPath: join(dir, 'Volume 1.pdf'), sourceFileHash: 'a'.repeat(64) })}\n`)
  const restored = rebuildSetupPack(manuscript)
  assert.equal(restored.pageIndex?.state, 'ready')
  assert.equal(readPageIndexShadow({ manuscriptPath: manuscript, packPath: pack }).state, 'ready')
})
