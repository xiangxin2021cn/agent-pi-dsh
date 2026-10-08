import assert from 'node:assert/strict'
import fs, { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
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

test('DWG parser warnings survive a cached conversion and an old receipt is revalidated', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-warnings-')), source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source')
  let calls = 0
  const convert = async (_input: string, output: string) => { calls += 1; writeFileSync(output, dxf); return { warnings: [87] } }
  const first = await convertDwgToDxf(cwd, source, convert)
  assert.deepEqual(first.warnings, [87])
  const second = await convertDwgToDxf(cwd, source, convert)
  assert.deepEqual(second.warnings, [87])
  assert.equal(second.cached, true)
  assert.equal(calls, 1)
  writeFileSync(first.path + '.conversion.json', JSON.stringify({ schema: 'cad-dxf-stream/v1', sourceHash: first.sourceHash, outputBytes: Buffer.byteLength(dxf), warnings: [] }))
  const third = await convertDwgToDxf(cwd, source, convert)
  assert.equal(third.cached, false)
  assert.deepEqual(third.warnings, [87])
  assert.equal(calls, 2)
  writeFileSync(third.path, dxf.replace('WALL', 'ROAD'))
  const fourth = await convertDwgToDxf(cwd, source, convert)
  assert.equal(fourth.cached, false)
  assert.equal(calls, 3)
  assert.deepEqual(fourth.warnings, [87])
  assert.match(readFileSync(fourth.path, 'utf8'), /WALL/)
})

test('conversion does not cache an output after the DWG version changes during execution', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-source-change-')), source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source before')
  await assert.rejects(convertDwgToDxf(cwd, source, async (_input, output) => {
    writeFileSync(output, dxf); writeFileSync(source, 'DWG source after')
  }), /来源版本发生变化/)
})

test('cached conversion rejects a DWG changed while its large DXF is being verified', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-cache-source-change-')), source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source before')
  const largeDxf = dxf.replace('  0\nENDSEC', ' '.repeat(8 * 1024 * 1024) + '\n  0\nENDSEC')
  let calls = 0
  const convert = async (_input: string, output: string) => { calls++; writeFileSync(output, largeDxf) }
  await convertDwgToDxf(cwd, source, convert)
  const cached = convertDwgToDxf(cwd, source, convert)
  writeFileSync(source, 'DWG source after')
  await assert.rejects(cached, /缓存期间 DWG 来源版本发生变化/)
  assert.equal(calls, 1)
})

test('a completed DXF with a failed bundled model audit cannot be cached as successful geometry', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-invalid-model-')), source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source')
  await assert.rejects(convertDwgToDxf(cwd, source, async (_input, output) => {
    writeFileSync(output, dxf)
    return { engine: 'mlightcad', warnings: [87], bundledModelQuality: { valid: false } }
  }), /几何关系校核未通过/)
})

test('fresh conversion rejects a DWG saved during the final DXF hash', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-cad-output-source-change-')), source = join(cwd, 'plan.dwg')
  writeFileSync(source, 'DWG source before')
  const largeDxf = dxf.replace('  0\nENDSEC', ' '.repeat(8 * 1024 * 1024) + '\n  0\nENDSEC')
  const original = fs.createReadStream
  let changed = false, outputPath = ''
  fs.createReadStream = ((path, ...options) => {
    const stream = original(path, ...options)
    if (String(path).endsWith('.tmp')) { writeFileSync(source, 'DWG source after'); changed = true }
    return stream
  }) as typeof fs.createReadStream
  syncBuiltinESMExports()
  try {
    await assert.rejects(convertDwgToDxf(cwd, source, async (_input, output) => {
      outputPath = output; writeFileSync(output, largeDxf)
    }), /来源版本发生变化/)
    assert.equal(changed, true)
    assert.equal(existsSync(outputPath), false)
    assert.equal(existsSync(outputPath + '.json'), false)
  } finally {
    fs.createReadStream = original
    syncBuiltinESMExports()
  }
})
