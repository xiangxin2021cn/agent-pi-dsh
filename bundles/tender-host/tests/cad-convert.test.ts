import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { convertDwgToDxf } from '../src/cad-convert.ts'

const dxf = '  0\nSECTION\n  2\nENTITIES\n  0\nLINE\n  8\nWALL\n 10\n0\n 20\n0\n 11\n10\n 21\n10\n  0\nENDSEC\n  0\nEOF\n' + ' '.repeat(40)

test('DWG conversion verifies the DXF, caches by source hash and keeps the source', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-convert-'))
  const source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source v1')
  let calls = 0
  const convert = async (_input: string, output: string) => { calls += 1; writeFileSync(output, dxf) }
  const first = await convertDwgToDxf(cwd, source, convert)
  assert.equal(first.cached, false)
  assert.equal(first.relativePath.endsWith('.dxf'), true)
  assert.equal(existsSync(first.path), true)
  assert.match(readFileSync(first.path, 'utf8'), /ENDSEC/)
  const second = await convertDwgToDxf(cwd, 'plan.dwg', convert)
  assert.equal(second.cached, true)
  assert.equal(second.path, first.path)
  assert.equal(calls, 1)
  writeFileSync(source, 'DWG source v2')
  const third = await convertDwgToDxf(cwd, source, convert)
  assert.notEqual(third.path, first.path)
  assert.equal(calls, 2)
  assert.equal(readFileSync(source, 'utf8'), 'DWG source v2')
})

test('DWG conversion refuses invalid output and does not leave a sidecar', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-invalid-'))
  const source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source')
  await assert.rejects(convertDwgToDxf(cwd, source, async (_input, output) => { writeFileSync(output, 'not dxf') }), /完整的 ASCII DXF/)
})

test('DWG conversion stays within the workspace', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-scope-'))
  await assert.rejects(convertDwgToDxf(cwd, join(tmpdir(), 'outside.dwg')), /outside the workspace/)
})

test('invalid DWG gives an error instead of a false DXF', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-missing-'))
  const source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source')
  await assert.rejects(convertDwgToDxf(cwd, source), /MLightCAD DWG 转 DXF 失败/)
})
