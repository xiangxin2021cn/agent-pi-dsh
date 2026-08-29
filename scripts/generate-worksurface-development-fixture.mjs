import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'worksurface', 'v1')
const fixtures = join(root, 'fixtures')
mkdirSync(fixtures, { recursive: true })

const documentLines = ['# Audited tender volume']
const documentLocators = []
for (let index = 1; index <= 32; index++) {
  const line = documentLines.length + 1
  documentLines.push(`<!-- page ${index} -->`)
  documentLines.push(`## Requirement ${String(index).padStart(2, '0')}`)
  documentLines.push(`Audited requirement R${String(index).padStart(2, '0')} requires submission item S${String(index).padStart(2, '0')} before the closing deadline.`)
  documentLines.push('')
  documentLocators.push(`fixtures/tender-volume.md#L${line + 1}`)
}
writeFileSync(join(fixtures, 'tender-volume.md'), `${documentLines.join('\n')}\n`)

const boqLines = ['Item,Description,Unit,Quantity']
for (let index = 1; index <= 32; index++) boqLines.push(`B${String(index).padStart(2, '0')},Audited BOQ item ${index},m,${index * 10}`)
writeFileSync(join(fixtures, 'boq.csv'), `${boqLines.join('\n')}\n`)

const graph = {
  nodes: Array.from({ length: 33 }, (_, index) => ({ id: index === 0 ? 'core' : `cap-${String(index).padStart(2, '0')}`, revision: index + 1 })),
  edges: Array.from({ length: 32 }, (_, index) => ({ from: `cap-${String(index + 1).padStart(2, '0')}`, to: index === 0 ? 'core' : `cap-${String(index).padStart(2, '0')}`, relation: 'depends-on' })),
}
writeFileSync(join(fixtures, 'capability-graph.json'), `${JSON.stringify(graph, null, 2)}\n`)

const tasks = []
for (let index = 1; index <= 32; index++) {
  tasks.push({
    id: `doc-${String(index).padStart(3, '0')}`,
    question: `Requirement ${String(index).padStart(2, '0')} requires which submission item?`,
    requiredSurfaces: ['document'],
    goldEvidence: [documentLocators[index - 1]],
    dependencyPath: [],
    answerRubric: [`S${String(index).padStart(2, '0')}`],
    forbiddenClaims: ['Any requirement or deadline not present in the cited fixture line.'],
  })
  tasks.push({
    id: `table-${String(index).padStart(3, '0')}`,
    question: `What is the exact quantity and unit for BOQ item B${String(index).padStart(2, '0')}?`,
    requiredSurfaces: ['table'],
    goldEvidence: [`fixtures/boq.csv!BOQ!C${index + 1}:D${index + 1}`],
    dependencyPath: [],
    answerRubric: ['m', String(index * 10)],
    forbiddenClaims: ['A quantity inferred from narrative text or a PageIndex preview.'],
  })
  tasks.push({
    id: `graph-${String(index).padStart(3, '0')}`,
    question: `Which upstream node does capability cap-${String(index).padStart(2, '0')} depend on?`,
    requiredSurfaces: ['graph'],
    goldEvidence: [`fixtures/capability-graph.json:path:cap-${String(index).padStart(2, '0')}`],
    dependencyPath: [`cap-${String(index).padStart(2, '0')}`, index === 1 ? 'core' : `cap-${String(index - 1).padStart(2, '0')}`],
    answerRubric: [index === 1 ? 'core' : `cap-${String(index - 1).padStart(2, '0')}`],
    forbiddenClaims: ['An upstream relationship not present in capability-graph.json.'],
  })
}

writeFileSync(join(root, 'development-fixture.json'), `${JSON.stringify({
  schemaVersion: 1,
  id: 'agent-pi-worksurface-development-v1',
  provenance: 'development-fixture',
  goldReviewedByHumans: false,
  generatedBy: 'scripts/generate-worksurface-development-fixture.mjs',
  tasks,
}, null, 2)}\n`)
