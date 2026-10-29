import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { verifyWritingDnaSkill } from './verify-writing-dna-skill.mjs'

const source = join(dirname(fileURLToPath(import.meta.url)), '../skills/writing-dna-skill')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-writing-dna-'))
  assert.equal(dirname(resolve(root)), resolve(tmpdir()))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  cpSync(source, join(root, 'skills/writing-dna-skill'), { recursive: true })
  return root
}

test('ships all 23 original MIT skill files with their reviewed source bytes', t => {
  const result = verifyWritingDnaSkill(fixture(t))
  assert.equal(result.sourceFiles, 23)
  assert.equal(result.license, 'MIT')
  assert.equal(result.commit, 'ee3d97ee27268004b5187d97711161f44fc4aae4')
})
for (const path of ['SKILL.md', 'references/workflow.en.md', 'templates/author-corpus/zh/视觉风格指南.md']) {
  test('refuses missing required skill source: ' + path, t => {
    const root = fixture(t)
    unlinkSync(join(root, 'skills/writing-dna-skill', path))
    assert.throws(() => verifyWritingDnaSkill(root), /ENOENT/)
  })
}
test('refuses CRLF conversion or source edits', t => {
  const root = fixture(t), file = join(root, 'skills/writing-dna-skill/SKILL.md')
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('\n', '\r\n'))
  assert.throws(() => verifyWritingDnaSkill(root), /upstream source differs/)
})
test('refuses a rewritten source receipt even when its declared identity is unchanged', t => {
  const root = fixture(t), file = join(root, 'skills/writing-dna-skill/UPSTREAM.json')
  writeFileSync(file, readFileSync(file, 'utf8') + '\n')
  assert.throws(() => verifyWritingDnaSkill(root), /receipt differs/)
})
