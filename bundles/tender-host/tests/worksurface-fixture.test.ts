import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { validateWorkSurfaceManifest, type WorkSurfaceBenchmarkManifest } from '../src/worksurface-benchmark.ts'

test('committed development WorkSurface fixture has 96 locator-backed atomic tasks', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const manifest = JSON.parse(readFileSync(join(root, 'benchmarks', 'worksurface', 'v1', 'development-fixture.json'), 'utf8')) as WorkSurfaceBenchmarkManifest
  assert.equal(manifest.tasks.length, 96)
  assert.equal(manifest.provenance, 'development-fixture')
  assert.equal(manifest.goldReviewedByHumans, false)
  assert.deepEqual(validateWorkSurfaceManifest(manifest), [])
})
