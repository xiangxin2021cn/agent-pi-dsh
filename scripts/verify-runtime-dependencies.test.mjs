import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyDependencyClosure } from './verify-runtime-dependencies.mjs'

test('packaging rejects missing transitive dependencies and accepts import-only packages', t => {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-dependencies-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { child: '1' }, optionalDependencies: { absent: '1' } }))
  const child = join(root, 'node_modules/child')
  mkdirSync(child, { recursive: true })
  writeFileSync(join(child, 'package.json'), JSON.stringify({ name: 'child', exports: { import: './index.js' }, dependencies: { missing: '1' } }))
  assert.throws(() => verifyDependencyClosure([root]), /child -> missing/)
  const dependency = join(child, 'node_modules/missing')
  mkdirSync(dependency, { recursive: true })
  writeFileSync(join(dependency, 'package.json'), JSON.stringify({ name: 'missing' }))
  assert.equal(verifyDependencyClosure([root]).packages, 3)
})

test('packaging rejects a dependency junction that still points at the build machine', t => {
  const base = mkdtempSync(join(tmpdir(), 'agent-pi-portability-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const runtime = join(base, 'runtime'), outside = join(base, 'developer-dependency')
  mkdirSync(join(runtime, 'node_modules'), { recursive: true })
  mkdirSync(outside)
  writeFileSync(join(runtime, 'package.json'), JSON.stringify({ dependencies: { child: '1' } }))
  writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: 'child' }))
  symlinkSync(outside, join(runtime, 'node_modules/child'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => verifyDependencyClosure([runtime]), /outside the packaged runtime/)
})
