import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  managedUniverSkillsReceiptPath,
  syncManagedUniverSkills,
} from './univer-skill-sync.mjs'

const initializer = readFileSync(new URL('./init-tender-profile.mjs', import.meta.url), 'utf8')

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-univer-skills-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    home: join(root, 'home'),
    plugin: join(root, 'plugin'),
  }
}

test('inactive Univer never injects skills', (t) => {
  const item = fixture(t)
  write(join(item.plugin, 'skills/sheets/SKILL.md'), 'plugin skill\n')

  const result = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: false })

  assert.deepEqual(result, { active: false, copied: 0, updated: 0, removed: 0, preserved: 0 })
  assert.equal(existsSync(join(item.home, 'skills/sheets/SKILL.md')), false)
  assert.equal(existsSync(managedUniverSkillsReceiptPath(item.home)), false)
})

test('active Univer creates a hash receipt and updates only its unmodified copies', (t) => {
  const item = fixture(t)
  const source = join(item.plugin, 'skills/sheets/SKILL.md')
  const destination = join(item.home, 'skills/sheets/SKILL.md')
  write(source, 'v1\n')

  const first = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: true })
  assert.equal(first.copied, 1)
  assert.equal(readFileSync(destination, 'utf8'), 'v1\n')
  const receipt = JSON.parse(readFileSync(managedUniverSkillsReceiptPath(item.home), 'utf8'))
  assert.equal(receipt.schema, 'agent-pi-dsh/univer-skills-receipt/v1')
  assert.equal(receipt.files.length, 1)
  assert.match(receipt.files[0].sha256, /^[a-f0-9]{64}$/)

  write(source, 'v2\n')
  const second = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: true })
  assert.equal(second.updated, 1)
  assert.equal(readFileSync(destination, 'utf8'), 'v2\n')

  write(destination, 'user edit\n')
  write(source, 'v3\n')
  const third = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: true })
  assert.equal(third.preserved, 1)
  assert.equal(readFileSync(destination, 'utf8'), 'user edit\n')
  assert.equal(existsSync(managedUniverSkillsReceiptPath(item.home)), false)
})

test('plugin removal deletes only receipted unmodified skills and preserves user edits', (t) => {
  const item = fixture(t)
  write(join(item.plugin, 'skills/sheets/SKILL.md'), 'sheets\n')
  write(join(item.plugin, 'skills/docs/SKILL.md'), 'docs\n')
  syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: true })
  write(join(item.home, 'skills/docs/SKILL.md'), 'user docs\n')

  rmSync(item.plugin, { recursive: true })
  const result = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: false })

  assert.equal(result.removed, 1)
  assert.equal(result.preserved, 1)
  assert.equal(existsSync(join(item.home, 'skills/sheets/SKILL.md')), false)
  assert.equal(readFileSync(join(item.home, 'skills/docs/SKILL.md'), 'utf8'), 'user docs\n')
  assert.equal(existsSync(managedUniverSkillsReceiptPath(item.home)), false)
})

test('an existing unreceipted skill remains user-owned even when content matches the plugin', (t) => {
  const item = fixture(t)
  write(join(item.plugin, 'skills/sheets/SKILL.md'), 'same\n')
  write(join(item.home, 'skills/sheets/SKILL.md'), 'same\n')

  const result = syncManagedUniverSkills({ home: item.home, pluginRoot: item.plugin, active: true })

  assert.equal(result.preserved, 1)
  assert.equal(existsSync(managedUniverSkillsReceiptPath(item.home)), false)
})

test('profile initialization derives skill synchronization from the activated bundle list', () => {
  assert.match(initializer, /syncManagedUniverSkills\(\{[\s\S]*active: readExistingBundles\(\)\.includes\(UNIVER_NAME\)/)
  assert.doesNotMatch(initializer, /function syncUniverSkills\(/)
})
