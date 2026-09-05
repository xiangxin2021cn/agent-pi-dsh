import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { fileURLToPath } from 'node:url'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(resolve(toolRoot, 'src/robust-fit.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { chooseRobustFitBounds } = await import(moduleUrl)

function box(centerX, centerY, width = 100, height = 100, type = 'LINE') {
  return {
    type,
    min: { x: centerX - width / 2, y: centerY - height / 2 },
    max: { x: centerX + width / 2, y: centerY + height / 2 }
  }
}

test('uses the stored drawing extent for the measured five-entity remote island', () => {
  const entities = Array.from({ length: 14_556 }, (_, index) => {
    const x = 1_010_206 + (index % 241) * 6_095
    const y = -2_801_126 + (index % 173) * 695
    return box(x, y, 350, 260)
  })
  entities.push(
    box(-2_405_355, -2_741_621, 711, 351, 'LWPOLYLINE'),
    box(-2_414_664, -2_737_935, 2_056, 214, 'LWPOLYLINE'),
    box(-2_414_817, -2_738_972, 1_212, 791, 'LWPOLYLINE'),
    box(-2_420_207, -2_741_305, 1_287, 697, 'LWPOLYLINE'),
    box(-2_420_040, -2_742_570, 2_103, 595, 'LWPOLYLINE')
  )

  const result = chooseRobustFitBounds(entities, {
    minX: 996_440,
    minY: -3_011_528,
    maxX: 2_653_750,
    maxY: -2_675_504
  })

  assert.equal(result.source, 'database')
  assert.equal(result.includedCount, 14_556)
  assert.equal(result.excludedCount, 5)
  assert.ok(result.coverage > 0.9996)
  assert.ok(result.spanReduction > 2.8)
})

test('keeps the full view when stored database extents are absent', () => {
  const entities = Array.from({ length: 1_000 }, (_, index) =>
    box(1_000_000 + (index % 100) * 10_000, -2_800_000 + (index % 40) * 2_000)
  )
  entities.push(...Array.from({ length: 5 }, (_, index) =>
    box(-2_400_000 - index * 1_000, -2_740_000, 500, 500, 'LWPOLYLINE')
  ))

  const result = chooseRobustFitBounds(entities)

  assert.equal(result.source, 'full')
  assert.equal(result.excludedCount, 0)
})

test('keeps two substantial drawing groups in the view', () => {
  const entities = [
    ...Array.from({ length: 100 }, (_, index) => box(index * 10, index % 10)),
    ...Array.from({ length: 100 }, (_, index) => box(100_000 + index * 10, index % 10))
  ]

  const result = chooseRobustFitBounds(entities, {
    minX: -100,
    minY: -100,
    maxX: 1_100,
    maxY: 100
  })

  assert.equal(result.source, 'full')
  assert.equal(result.excludedCount, 0)
})

test('rejects a stale database extent that omits more than one percent', () => {
  const main = Array.from({ length: 98 }, (_, index) => box(index * 10, index % 10))
  const remote = [box(100_000, 0), box(100_100, 0)]

  const result = chooseRobustFitBounds([...main, ...remote], {
    minX: -100,
    minY: -100,
    maxX: 1_100,
    maxY: 100
  })

  assert.equal(result.source, 'full')
})

test('does not crop a large remote entity even when it is rare', () => {
  const main = Array.from({ length: 100 }, (_, index) => box(index * 10, index % 10))
  const remote = box(100_000, 0, 50_000, 50_000, 'INSERT')

  const result = chooseRobustFitBounds([...main, remote], {
    minX: -100,
    minY: -100,
    maxX: 1_100,
    maxY: 100
  })

  assert.equal(result.source, 'full')
})

test('does not count a giant crossing entity as covered by mere intersection', () => {
  const main = Array.from({ length: 100 }, (_, index) => box(index * 10, index % 10))
  const crossing = {
    type: 'LINE',
    min: { x: -50_000, y: 0 },
    max: { x: 500, y: 0 }
  }
  const remote = box(-100_000, 0, 100, 100)

  const result = chooseRobustFitBounds([...main, crossing, remote], {
    minX: -100,
    minY: -100,
    maxX: 1_100,
    maxY: 100
  })

  assert.equal(result.source, 'full')
  assert.equal(result.excludedCount, 0)
})
