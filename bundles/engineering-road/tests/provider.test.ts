import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEngineeringProject, EngineeringProviderRegistry } from '../../../packages/engineering-core/index.ts'
import { roadProvider, apply } from '../src/index.ts'

test('road provider ties intervals to registered source versions and returns a scoped result', async () => {
  const project = createEngineeringProject({ id: 'road', title: 'Road' })
  const ref = { sourceId: 'section', sourceHash: 'a'.repeat(64), locator: 'K0+000–K0+010' }
  const input = { schemaVersion: 1, intervals: [{ id: 'a', scope: 'cut', startM: 0, endM: 10, startAreaM2: 4, endAreaM2: 6, method: 'average_end_area', sources: [ref] }] }
  assert.equal(roadProvider.audit(input, project)[0].code, 'road_unregistered_source')
  project.sources.push({ id: 'section', title: '横断面', sha256: ref.sourceHash, status: 'active' })
  assert.deepEqual(roadProvider.audit(input, project), [])
  const result: any = await roadProvider.execute!(roadProvider.parse(input), project)
  assert.equal(result.details.subtotals[0].knownVolumeM3, 50)
  assert.equal(result.details.coverageComplete, false)
})
test('plugin provider and professional capability are removable together', () => {
  const providers = new EngineeringProviderRegistry(), capabilities: any[] = [], disposers: Array<() => void> = []
  const effect = (install: any) => disposers.push(install())
  apply({ engineering: { providers }, effect, inject: (_dependencies: any, callback: any) => callback({ effect, professionalCapabilities: { register: (row: any) => { capabilities.push(row); return () => { capabilities.splice(capabilities.indexOf(row), 1) } } } }) })
  assert.equal(providers.list().length, 1)
  assert.equal(capabilities[0].id, 'engineering.road')
  disposers.forEach(dispose => dispose())
  assert.equal(providers.list().length, 0)
  assert.equal(capabilities.length, 0)
})
