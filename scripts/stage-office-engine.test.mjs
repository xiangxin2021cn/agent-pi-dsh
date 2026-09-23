import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { stageOfficeEngine } from './stage-office-engine.mjs'
import { repairLinks, stripLinks } from './repair-dsh-links.mjs'

test('Office short-path staging preserves bytes and survives installer link restoration', t => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-office-stage-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const kit = join(root, 'node_modules/@deepseek-ai/libreoffice-kit')
  const engine = join(kit, 'node_modules/@deepseek-ai/libreoffice-kit-win32-x64')
  for (const path of [kit, engine]) {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'package.json'), '{"version":"0.1.0"}')
  }
  writeFileSync(join(engine, 'LICENSE'), 'original engine license bytes')
  stageOfficeEngine(root)
  assert.equal(realpathSync(engine), join(root, 'node_modules/.office'))
  assert.equal(readFileSync(join(engine, 'LICENSE'), 'utf8'), 'original engine license bytes')
  stageOfficeEngine(root)
  const manifest = JSON.parse(readFileSync(join(root, '.agent-pi-links.json'), 'utf8'))
  assert.equal(manifest.links.length, 1)
  const link = manifest.links[0]
  assert.equal(resolve(dirname(join(root, link.from)), link.to), join(root, 'node_modules/.office'))
  stripLinks(root)
  repairLinks(root)
  assert.equal(readFileSync(join(engine, 'LICENSE'), 'utf8'), 'original engine license bytes')
})
