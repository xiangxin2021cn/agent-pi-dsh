import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { captureTenderResponseDependencies, getTenderResponseCoverage, verifyTenderResponse } from '../src/tender-responses.ts'
import { capabilityStatus, initTenderWorkspace, loadWorkspace, replaceCapability, upsertWorkspaceSection, workspacePaths } from '../src/workspace.ts'
import { zipStore } from '../src/xlsx-zip.ts'
import { addKbContent, listKbVersions } from '../src/kb.ts'
import { createBusinessProject } from '../../../packages/business-projects/index.ts'

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-response-'))
  initTenderWorkspace(cwd, 'road', { id: 'road', title: 'Road', status: 'active' })
  for (const name of ['traffic', 'drainage']) writeFileSync(join(cwd, `${name}.md`), `Required ${name} sequence`)
  upsertWorkspaceSection(cwd, 'road', {
    documents: ['traffic', 'drainage'].map(id => ({ id, name: id, path: `${id}.md`, kind: 'tender_data', status: 'active' })),
    requirements: ['traffic', 'drainage'].map(id => ({ id, title: id, text: `Required ${id} sequence`, type: 'mandatory', criticality: 'critical', source: { documentId: id, page: 1 }, evidenceNeeded: [], status: 'planned' })),
    criteria: ['traffic', 'drainage'].map(id => ({ id, title: id, method: 'weighted', weight: 50, source: { documentId: id, page: 1 }, requirementIds: [id], evidenceNeeded: [], status: 'planned', rubric: { text: `Describe ${id}`, points: [{ id: 'sequence', text: `${id} sequence`, evidenceNeeded: [] }], bands: [] } })),
    deliverables: [{ id: 'technical', title: 'Technical bid', requirementIds: ['traffic', 'drainage'], status: 'drafting' }],
    responses: ['traffic', 'drainage'].map(id => ({ id, title: id, requirementIds: [id], criterionIds: [id], deliverableId: 'technical', evidenceRefs: [{ documentId: id }], status: 'planned', chapter: { id, title: id, generationMode: 'generate', requiredContent: [`${id} sequence`], pointResponses: [{ criterionId: id, pointId: 'sequence', plannedResponse: `Describe ${id}` }], materials: [], dependencies: [] } })),
  })
  writeFileSync(join(cwd, 'technical.md'), '# Traffic\nLane staging uses two stages.\n# Drainage\nInstall drainage before surfacing.\n')
  return cwd
}
const review = (section = 'Traffic', excerpt = 'Lane staging uses two stages.') => ({ artifactPath: 'technical.md', location: { section, excerpt }, contentReview: { verdict: 'supported' as const, reviewer: 'Project reviewer', note: 'Compared the stated sequence with the selected requirement and project constraints.' }, pointReviews: [{ criterionId: section.toLowerCase(), pointId: 'sequence', location: { section, excerpt }, verdict: 'supported' as const, note: 'The staged sequence responds to this selected rubric point.' }] })

test('one canonical response appears under requirement and criterion with unique summary counts', () => {
  const cwd = setup()
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  const coverage = getTenderResponseCoverage(cwd, 'road')
  assert.equal(coverage.summary.planned, 2)
  assert.equal(coverage.summary.reviewed, 1)
  assert.equal(coverage.summary.drafted, 1)
  assert.equal(coverage.rows.filter(row => row.responses[0].id === 'traffic').length, 2)
  assert.equal(coverage.sourceCoverage.complete, null)
  assert.equal(coverage.rows[0].responses[0].status, 'reviewed')
})

test('unrelated requirements keep their review while local changes invalidate dependent chapters', () => {
  const cwd = setup()
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  verifyTenderResponse(cwd, 'road', 'drainage', review('Drainage', 'Install drainage before surfacing.'))
  const workspace = loadWorkspace(cwd, 'road')
  workspace.requirements[0].text = 'Traffic must use three stages'
  upsertWorkspaceSection(cwd, 'road', { requirements: workspace.requirements })
  const coverage = getTenderResponseCoverage(cwd, 'road')
  assert.equal(coverage.rows[0].responses[0].status, 'stale')
  assert.equal(coverage.rows[1].responses[0].status, 'reviewed')
  assert.equal(coverage.summary.stale, 1)
  captureTenderResponseDependencies(cwd, 'road', 'traffic')
  assert.equal(getTenderResponseCoverage(cwd, 'road').rows[0].responses[0].status, 'stale', 'recapturing planning baseline cannot launder an old review')
})

test('file bytes, actual source bytes and engineering dependencies invalidate existing receipts', () => {
  const cwd = setup()
  writeFileSync(join(cwd, 'quantities.csv'), 'pipe,10')
  const workspace = loadWorkspace(cwd, 'road')
  workspace.responses[0].chapter!.dependencies = [{ kind: 'file', id: 'quantities.csv' }]
  upsertWorkspaceSection(cwd, 'road', { responses: workspace.responses })
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  writeFileSync(join(cwd, 'quantities.csv'), 'pipe,20')
  assert.equal(getTenderResponseCoverage(cwd, 'road').summary.stale, 1)
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  writeFileSync(join(cwd, 'traffic.md'), 'Changed addendum')
  assert.equal(getTenderResponseCoverage(cwd, 'road').summary.stale, 1)
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  writeFileSync(join(cwd, 'technical.md'), '# Traffic\nChanged draft')
  assert.equal(getTenderResponseCoverage(cwd, 'road').summary.stale, 1)
})

test('wrong chapter and missing files are rejected without writing review records', () => {
  const cwd = setup(), before = readFileSync(workspacePaths(cwd, 'road').model, 'utf8')
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', review('Drainage')), /摘录/)
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: 'missing.md' }), /实际文件/)
  assert.equal(readFileSync(workspacePaths(cwd, 'road').model, 'utf8'), before)
})

test('caller-assigned verified state and forged receipts do not create a verified chapter', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  workspace.responses[0].status = 'verified'
  workspace.responses[0].artifactReview = { ...review(), pointReviews: undefined, artifactSha256: 'a'.repeat(64), checkedAt: new Date().toISOString(), locationStatus: 'verified', dependencyFingerprints: {} }
  upsertWorkspaceSection(cwd, 'road', { responses: workspace.responses })
  assert.equal(loadWorkspace(cwd, 'road').responses[0].artifactReview, undefined)
  assert.equal(getTenderResponseCoverage(cwd, 'road').summary.reviewed, 0)
})

test('DOCX locates body paragraphs, PDF manual locations stay explicitly unverified', () => {
  const cwd = setup()
  const xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Traffic</w:t></w:r></w:p><w:p><w:r><w:t>Lane staging uses two stages.</w:t></w:r></w:p></w:body></w:document>'
  writeFileSync(join(cwd, 'bid.docx'), zipStore([{ name: 'word/document.xml', data: Buffer.from(xml) }]))
  const checked = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: 'bid.docx' })
  assert.equal(checked.review.locationStatus, 'verified')
  writeFileSync(join(cwd, 'bid.pdf'), '%PDF-1.7\nplaceholder for manual-only location')
  const manual = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: 'bid.pdf', location: { page: 1, excerpt: 'Lane staging uses two stages.' } })
  assert.equal(manual.review.locationStatus, 'manual_review')
  assert.equal(manual.responseCoverage.summary.reviewed, 0)
})

test('material expiry, wrong bidder and uncertain review keep coverage unresolved', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  workspace.responses[0].chapter!.materials = [{ id: 'cert', title: 'Staff certificate', path: 'traffic.md', mode: 'original', subject: 'Historical bidder', expectedSubject: 'Current bidder', purpose: 'Staffing', conditions: [], validUntil: '2020-01-01T00:00:00Z', availability: 'unknown', authorization: 'unknown', verification: 'unverified' }]
  upsertWorkspaceSection(cwd, 'road', { responses: workspace.responses })
  const result = verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage
  assert.equal(result.summary.reviewed, 0)
  assert.match(result.rows[0].responses[0].evidence[0].reason!, /主体.*过期/)
  assert.equal(result.rows[0].responses[0].evidence[0].status, 'needs_review')
})

test('old or absent workspaces stay visible and corrupted data is not silently treated as empty', () => {
  const cwd = setup()
  assert.deepEqual(getTenderResponseCoverage(cwd, 'not-created').rows, [])
  upsertWorkspaceSection(cwd, 'road', { responses: [] })
  assert.equal(getTenderResponseCoverage(cwd, 'road').rows[0].status, 'unplanned')
  writeFileSync(workspacePaths(cwd, 'road').model, '{broken')
  assert.throws(() => getTenderResponseCoverage(cwd, 'road'))
})

test('updating registered source hashes cannot silently refresh an earlier response receipt', () => {
  const cwd = setup()
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  const workspace = loadWorkspace(cwd, 'road')
  writeFileSync(join(cwd, 'traffic.md'), 'Changed requirement in addendum')
  workspace.documents[0].sha256 = 'b'.repeat(64)
  upsertWorkspaceSection(cwd, 'road', { documents: workspace.documents })
  assert.equal(getTenderResponseCoverage(cwd, 'road').rows[0].responses[0].status, 'stale')
})

test('a blocked response never becomes reviewed merely by recording a supported excerpt', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  workspace.responses[0].status = 'blocked'
  upsertWorkspaceSection(cwd, 'road', { responses: workspace.responses })
  const result = verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage
  assert.equal(result.rows[0].responses[0].status, 'blocked')
  assert.equal(result.summary.reviewed, 0)
})

test('moving an excerpt to another chapter invalidates its file receipt and cannot pass the old location', () => {
  const cwd = setup()
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  writeFileSync(join(cwd, 'technical.md'), '# Traffic\nNo response yet.\n# Drainage\nLane staging uses two stages.\n')
  assert.equal(getTenderResponseCoverage(cwd, 'road').rows[0].responses[0].status, 'stale')
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', review()), /摘录/)
})

test('selected immutable knowledge must remain valid at the project closing date', () => {
  const cwd = setup(), previousRoot = process.env.AGENT_PI_KB_ROOT
  process.env.AGENT_PI_KB_ROOT = join(cwd, 'kb')
  try {
    const added = addKbContent({ fileName: 'company.md', text: '# Certificate\nCompany original certificate.', name: 'Company', category: '企业材料', slug: 'company', metadata: { sourceKind: 'original', validUntil: '2098-01-01' } })
    const version = listKbVersions(added.entry.slug)[0]
    const workspace = loadWorkspace(cwd, 'road')
    workspace.project.closingAt = '2099-01-01T00:00:00Z'
    workspace.responses[0].chapter!.materials = [{ id: 'company', title: 'Certificate', knowledgeCitation: `[kb:company@${version.versionId}:${version.manifest.chunks[0].id}]`, mode: 'original', subject: 'Bidder', expectedSubject: 'Bidder', purpose: 'Qualification', conditions: [], availability: 'confirmed', authorization: 'confirmed', verification: 'verified', reviewer: 'Reviewer', reviewedAt: new Date().toISOString(), note: 'Original reviewed' }]
    upsertWorkspaceSection(cwd, 'road', { project: workspace.project, responses: workspace.responses })
    const result = verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage
    assert.equal(result.summary.reviewed, 0)
    assert.match(result.rows[0].responses[0].evidence[0].reason!, /有效期/)
    workspace.project.closingAt = '2090-01-01T00:00:00Z'
    upsertWorkspaceSection(cwd, 'road', { project: workspace.project })
    assert.equal(verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage.summary.reviewed, 1)
    writeFileSync(version.entry.managedPath, 'Altered immutable certificate')
    assert.equal(getTenderResponseCoverage(cwd, 'road').summary.stale, 1)
  } finally {
    if (previousRoot === undefined) delete process.env.AGENT_PI_KB_ROOT
    else process.env.AGENT_PI_KB_ROOT = previousRoot
  }
})

test('host-only review receipts preserve current capability packs while business edits still invalidate them', () => {
  const cwd = setup()
  replaceCapability(cwd, 'road', 'evaluation_strategy', { strategies: ['traffic', 'drainage'].map(id => ({ criterionId: id, priority: 'normal', responseOwner: 'Reviewer', responseTheme: `${id} response`, evidencePlan: ['Current source and sequence'], evidenceRefs: [{ documentId: id }], evidenceArtifactPaths: [], differentiators: [], risks: [], status: 'reviewed' })) })
  const revision = loadWorkspace(cwd, 'road').revision
  captureTenderResponseDependencies(cwd, 'road', 'traffic')
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  assert.equal(loadWorkspace(cwd, 'road').revision, revision)
  const strategy = capabilityStatus(cwd, 'road').index.capabilities.find(row => row.capability === 'evaluation_strategy')!
  assert.equal(strategy.stale, false)
  assert.equal(strategy.readiness, 'ready')
  const workspace = loadWorkspace(cwd, 'road')
  workspace.responses[0].chapter!.requiredContent.push('Additional traffic control')
  upsertWorkspaceSection(cwd, 'road', { responses: workspace.responses }, { trustedResponseState: true })
  assert.equal(loadWorkspace(cwd, 'road').revision, revision + 1)
  assert.equal(capabilityStatus(cwd, 'road').index.capabilities.find(row => row.capability === 'evaluation_strategy')!.stale, true)
})

test('an overall supported review cannot automatically verify declared rubric points', () => {
  const cwd = setup()
  const result = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: undefined }).responseCoverage
  assert.equal(result.rows[0].responses[0].status, 'needs_review')
  assert.equal(result.summary.reviewed, 0)
  assert.ok(result.rows[0].responses[0].checks.some(row => row.kind === 'rubric_point:traffic:sequence' && row.status === 'review'))
})

test('every declared point needs its own location and support verdict in the current file', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  workspace.criteria[0].rubric!.points.push({ id: 'resources', text: 'Resources match traffic staging', evidenceNeeded: [] })
  workspace.responses[0].chapter!.pointResponses.push({ criterionId: 'traffic', pointId: 'resources', plannedResponse: 'Show traffic marshals for each stage' })
  upsertWorkspaceSection(cwd, 'road', { criteria: workspace.criteria, responses: workspace.responses })
  writeFileSync(join(cwd, 'technical.md'), '# Traffic\nLane staging uses two stages.\nTwo marshals manage each stage.\n# Drainage\nInstall drainage before surfacing.\n')
  const first = verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage
  assert.equal(first.summary.reviewed, 0)
  assert.equal(first.rows[0].responses[0].checks.find(row => row.kind === 'rubric_point:traffic:resources')?.status, 'review')
  const point = { criterionId: 'traffic', pointId: 'resources', location: { section: 'Traffic', excerpt: 'Two marshals manage each stage.' }, verdict: 'supported' as const, note: 'Resources explicitly cover both stages.' }
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: [...review().pointReviews, { ...point, location: { ...point.location, section: 'Drainage' } }] }), /评分子点.*摘录/)
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: [...review().pointReviews, { ...point, location: { section: 'Drainage', excerpt: 'Install drainage before surfacing.' } }] }), /不在本响应登记的章节/)
  const uncertain = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: [...review().pointReviews, { ...point, verdict: 'uncertain' }] }).responseCoverage
  assert.equal(uncertain.summary.reviewed, 0)
  const complete = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: [...review().pointReviews, point] }).responseCoverage
  assert.equal(complete.summary.reviewed, 1)
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: [...review().pointReviews, { ...point, pointId: 'invented' }] }), /未在本章节/)
})

test('separate chapters can each review their assigned points of one criterion', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  workspace.criteria[0].rubric!.points.push({ id: 'resources', text: 'Resources match traffic staging', evidenceNeeded: [] })
  workspace.responses.push({ ...workspace.responses[0], id: 'resources', title: 'Resources', chapter: { ...workspace.responses[0].chapter!, id: 'resources', title: 'Resources', requiredContent: ['Traffic marshals'], pointResponses: [{ criterionId: 'traffic', pointId: 'resources', plannedResponse: 'Resource schedule' }] } })
  upsertWorkspaceSection(cwd, 'road', { criteria: workspace.criteria, responses: workspace.responses })
  writeFileSync(join(cwd, 'technical.md'), '# Traffic\nLane staging uses two stages.\n# Resources\nTwo marshals manage each stage.\n')
  const first = verifyTenderResponse(cwd, 'road', 'traffic', review()).responseCoverage
  assert.equal(first.summary.reviewed, 1, 'traffic chapter only needs its own assigned sequence point')
  assert.notEqual(first.rows.find(row => row.kind === 'criterion' && row.id === 'traffic')?.status, 'reviewed')
  const second = verifyTenderResponse(cwd, 'road', 'resources', { ...review('Resources', 'Two marshals manage each stage.'), pointReviews: [{ criterionId: 'traffic', pointId: 'resources', location: { section: 'Resources', excerpt: 'Two marshals manage each stage.' }, verdict: 'supported', note: 'The resource chapter responds to its assigned point.' }] }).responseCoverage
  assert.equal(second.rows.find(row => row.kind === 'criterion' && row.id === 'traffic')?.status, 'reviewed')
  assert.equal(second.summary.reviewed, 2)
})

test('legacy criteria without rubric points do not require invented point reviews', () => {
  const cwd = setup(), workspace = loadWorkspace(cwd, 'road')
  delete workspace.criteria[0].rubric
  workspace.responses[0].chapter!.pointResponses = []
  upsertWorkspaceSection(cwd, 'road', { criteria: workspace.criteria, responses: workspace.responses })
  const result = verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), pointReviews: undefined }).responseCoverage
  assert.equal(result.summary.reviewed, 1)
})

function setupModules() {
  const cwd = setup(), template = loadWorkspace(cwd, 'road')
  for (const module of ['tender', 'china-tender'] as const) {
    const rootPath = join(cwd, module)
    mkdirSync(rootPath)
    for (const name of ['traffic.md', 'drainage.md', 'technical.md']) writeFileSync(join(rootPath, name), readFileSync(join(cwd, name)))
    createBusinessProject({ workspaceRootPath: cwd, projectId: 'road', module, name: module, rootPath, workflowId: `${module}-main`, createDirectory: false })
    if (module === 'china-tender') initTenderWorkspace(cwd, 'road', { id: 'road', title: 'China road', status: 'active' }, module)
    upsertWorkspaceSection(cwd, 'road', {
      documents: template.documents.map(row => ({ ...row, name: `${module}:${row.name}`, path: join(rootPath, row.path) })),
      requirements: template.requirements.map(row => ({ ...row, title: `${module}:${row.title}` })),
      criteria: template.criteria, deliverables: template.deliverables, responses: template.responses,
    }, { module })
  }
  return cwd
}

test('same project IDs in China and South Africa retain separate ledgers, packs, snapshots and reviews', () => {
  const cwd = setupModules()
  assert.notEqual(workspacePaths(cwd, 'road').dir, workspacePaths(cwd, 'road', 'china-tender').dir)
  assert.equal(loadWorkspace(cwd, 'road').project.title, 'Road')
  assert.equal(loadWorkspace(cwd, 'road', 'china-tender').project.title, 'China road')
  replaceCapability(cwd, 'road', 'document_analysis', { sections: [] })
  replaceCapability(cwd, 'road', 'document_analysis', { sections: [] }, 'china-tender')
  replaceCapability(cwd, 'road', 'document_analysis', { sections: [] }, 'china-tender')
  const southAfricaBefore = readFileSync(workspacePaths(cwd, 'road').model, 'utf8')
  const southAfricaIndexBefore = readFileSync(workspacePaths(cwd, 'road').index, 'utf8')
  captureTenderResponseDependencies(cwd, 'road', 'traffic', 'china-tender')
  verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: join(cwd, 'china-tender', 'technical.md') }, 'china-tender')
  assert.equal(readFileSync(workspacePaths(cwd, 'road').model, 'utf8'), southAfricaBefore)
  assert.equal(readFileSync(workspacePaths(cwd, 'road').index, 'utf8'), southAfricaIndexBefore)
  assert.equal(getTenderResponseCoverage(cwd, 'road').summary.reviewed, 0)
  const china = getTenderResponseCoverage(cwd, 'road', 'china-tender')
  assert.equal(china.module, 'china-tender')
  assert.equal(china.summary.reviewed, 1)
  assert.equal(china.rows[0].title, 'china-tender:traffic')
  assert.equal(capabilityStatus(cwd, 'road', 'document_analysis').envelope?.revision, 1)
  assert.equal(capabilityStatus(cwd, 'road', 'document_analysis', 'china-tender').envelope?.revision, 2)
  const changed = loadWorkspace(cwd, 'road', 'china-tender')
  changed.requirements[0].text = 'Chinese addendum changes traffic staging'
  upsertWorkspaceSection(cwd, 'road', { requirements: changed.requirements }, { module: 'china-tender' })
  assert.equal(getTenderResponseCoverage(cwd, 'road', 'china-tender').summary.stale, 1)
  assert.equal(capabilityStatus(cwd, 'road', 'document_analysis').index.capabilities.find(row => row.capability === 'document_analysis')?.stale, false)
  assert.equal(capabilityStatus(cwd, 'road', 'document_analysis', 'china-tender').index.capabilities.find(row => row.capability === 'document_analysis')?.stale, true)
})

test('response verification only accepts the bound module project roots and explicitly selected sources', () => {
  const cwd = setupModules()
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: join(cwd, 'tender', 'technical.md') }, 'china-tender'), /本项目可访问/)
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: join(cwd, 'china-tender', 'technical.md') }), /本项目可访问/)
  assert.throws(() => verifyTenderResponse(cwd, 'road', 'traffic', review(), 'china-tender'), /本项目可访问/, 'registry workspace root is not implicitly the bound project root')
  assert.equal(verifyTenderResponse(cwd, 'road', 'traffic', { ...review(), artifactPath: join(cwd, 'china-tender', 'technical.md') }, 'china-tender').responseCoverage.summary.reviewed, 1)
  const china = loadWorkspace(cwd, 'road', 'china-tender')
  china.responses[1].chapter!.dependencies = [{ kind: 'file', id: join(cwd, 'tender', 'technical.md') }]
  upsertWorkspaceSection(cwd, 'road', { responses: china.responses }, { module: 'china-tender' })
  const projection = getTenderResponseCoverage(cwd, 'road', 'china-tender')
  assert.equal(projection.rows[1].responses[0].evidence.at(-1)?.path, undefined)
  assert.equal(projection.rows[1].responses[0].evidence.at(-1)?.status, 'blocked')
})

test('unreadable source invalidates a current response without treating it as withdrawn', () => {
  const cwd = setup()
  verifyTenderResponse(cwd, 'road', 'traffic', review())
  const workspace = loadWorkspace(cwd, 'road')
  workspace.documents[0].status = 'unreadable'
  upsertWorkspaceSection(cwd, 'road', { documents: workspace.documents })
  assert.equal(getTenderResponseCoverage(cwd, 'road').rows[0].responses[0].status, 'stale')
  assert.equal(loadWorkspace(cwd, 'road').documents[0].status, 'unreadable')
})
