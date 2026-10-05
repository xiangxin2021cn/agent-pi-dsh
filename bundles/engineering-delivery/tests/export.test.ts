import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import test from 'node:test'
import { createEngineeringProject } from '../../../packages/engineering-core/index.ts'
import { calculateRebar } from '../../../packages/engineering-rebar/index.ts'
import { calculateRoadQuantities } from '../../../packages/engineering-road/index.ts'
import { calculateCivil, calibratePdf } from '../../../packages/engineering-civil/index.ts'
import type { CivilCalculationInput, PdfCalibrationInput } from '../../../packages/engineering-civil/index.ts'
import { createChinaBoqBaseline, compareChinaBoq } from '../../../packages/china-tender/index.ts'
import { CapabilityRegistry } from '../../../packages/professional-tasks/capabilities.ts'
import { registerTaskGuide } from '../../task-guide/src/plugin.ts'
import { registerEngineering } from '../../engineering/src/plugin.ts'
import { dshFile, importDsh } from '../../tender-host/src/dsh.ts'
import { exportEngineeringFiles, csvCell, fileHash, installedXlsx } from '../src/export.ts'
import { engineeringTables } from '../src/tables.ts'
import type { ExportRun, ExportState } from '../src/tables.ts'
import { registerEngineeringDelivery } from '../src/plugin.ts'

const hash = 'a'.repeat(64)
function fixture(): ExportState {
  const project = createEngineeringProject({ id: 'session:main', title: '=HYPERLINK("https://example.invalid","x") <script>alert(1)</script>' })
  project.sources = [{ id: 'drawing', title: '原图', sha256: hash, path: 'original.dxf', status: 'active', revision: 'R1' }]
  project.objects = [{ id: 'beam', type: 'beam', title: '梁', sources: [{ sourceId: 'drawing', sourceHash: hash, locator: 'A-A' }], parameters: { length: { value: null, unit: 'm', status: 'provisional', sources: [] } } }]
  project.quantities = [{ id: 'q0', title: '确定零值', objectIds: ['beam'], purpose: 'contract', value: 0, unit: 'm3', formula: '=1-1', dependencies: [], status: 'draft', issues: [] }, { id: 'q1', title: '未知值', objectIds: ['beam'], purpose: 'procurement', value: null, unit: 'kg', formula: '', dependencies: [], status: 'blocked', issues: ['长度缺失'] }]
  project.ruleAdoptions = [{ id: 'rule-r1', packId: 'project-approved-rule', version: 'R1', contentHash: hash, scope: { country: 'CN', discipline: 'structural' }, adoptedAt: '2026-10-05', sources: [] }]
  project.coverage = [{ id: 'missing', title: '未读构件', required: true, status: 'missing', dependencies: [], reason: '缺图' }]
  const rebar = calculateRebar({ schemaVersion: 1, rows: [{ id: 'bar', inputMode: 'bbs', diameterMm: '10', steelGrade: 'HRB400', count: 2, lengths: { geometry: { value: '1', unit: 'm' }, measurement: { value: '1.2', unit: 'm' }, fabrication: { value: '1.4', unit: 'm' } }, unitMassKgPerM: '0.617', sourceRefs: [{ documentId: 'drawing', page: 1 }] }, { id: 'unknown', inputMode: 'bbs', count: null, lengths: { geometry: { value: '1', unit: 'm' } }, sourceRefs: [{ documentId: 'drawing', page: 2 }] }], coverage: { expectedGroupIds: ['bar', 'unknown'] } })
  const road = calculateRoadQuantities({ schemaVersion: 1, intervals: [{ id: 'road', scope: 'alignment-A:cut', startM: 0, endM: 10, startAreaM2: 4, endAreaM2: 6, method: 'average_end_area', sources: [{ sourceId: 'drawing', sourceHash: hash, locator: '0-10' }] }], expectedRanges: [{ id: 'range', scope: 'alignment-A:cut', startM: 0, endM: 10 }] })
  const baseline = createChinaBoqBaseline('r1', { documentId: 'drawing', sha256: hash }, [{ id: 'b1', code: '010101001001', description: '精确原量', unit: 'm3', quantity: '9007199254740993.0001' }])
  const comparison = compareChinaBoq(baseline, [{ ...baseline.rows[0], quantity: '9007199254740993.0002' }], 'recalculation')
  const run = (id: string, providerId: string, details: any, status = 'current'): ExportRun => ({ id, providerId, providerVersion: '3.8.0', title: id, createdAt: '2026-10-05T00:00:00.000Z', status, executionStatus: 'executed', providerAvailable: true, dependencies: [], input: {}, output: { summary: '仅示例输入对应计算；待复核', issues: details.issues || [], details } })
  return { revision: 6, project, scope: { sessionId: 'main' }, sourceChecks: [{ sourceId: 'drawing', status: 'current' }], runs: [run('rebar-current', 'rebar', rebar), run('rebar-old', 'rebar', rebar, 'stale'), run('road', 'road', road), run('baseline', 'china-tender', baseline), run('responses', 'china-tender', { responseMatrix: [{ requirementId: 'r1', status: 'needs_evidence', reasons: ['缺证据'] }], boqComparison: comparison }), run('ifc', 'bim-ifc', { action: 'geometry', elements: [{ globalId: 'IFC-1', netVolumeM3: 0, grossVolumeM3: null, nativeQuantities: [{ unit: 'm3', value: 9 }], mesh: { vertices: [0, 0, 0], triangles: [] } }] })] }
}

test('table projections preserve quantity purposes, null, exact decimal baselines, stale totals and IFC native QTO', () => {
  const state = fixture(), before = JSON.stringify(state), tables = engineeringTables(state), get = (id: string) => tables.find(t => t.id === id)!.rows
  assert.deepEqual(get('quantities').map(row => [row.purpose, row.value]), [['contract', 0], ['procurement', null]])
  assert.equal(get('objects')[0].value, null)
  assert.deepEqual(get('rebar-totals').filter(row => row.runId === 'rebar-current').map(row => row.basis), ['geometry', 'measurement', 'fabrication'])
  assert.ok(get('rebar-totals').filter(row => row.runId === 'rebar-old').every(row => row.currentKnownMassKg === null && row.currentKnownSubtotal === false))
  assert.equal(get('road-totals')[0].currentKnownVolumeM3, 50)
  assert.equal(get('china-baselines')[0].quantity, '9007199254740993.0001')
  assert.equal(get('china-differences')[0].quantityDelta, '0.0001')
  assert.equal(get('china-responses')[0].status, 'needs_evidence')
  assert.equal(get('ifc')[0].grossVolumeM3, null); assert.deepEqual(get('ifc')[0].nativeQuantities, [{ unit: 'm3', value: 9 }])
  assert.equal(get('ifc')[0].mesh, undefined)
  assert.equal(JSON.stringify(state), before)
})

test('real XLSX round-trip through independent ExcelJS keeps strings non-formula and preserves zero and unknown', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-delivery-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  writeFileSync(join(cwd, 'original.dxf'), 'original input remains intact')
  const original = fileHash(readFileSync(join(cwd, 'original.dxf'))), state = fixture()
  const result = exportEngineeringFiles(cwd, state, '计算书'), other = exportEngineeringFiles(cwd, state, '计算书')
  assert.notEqual(result.directory, other.directory)
  assert.equal(fileHash(readFileSync(join(cwd, 'original.dxf'))), original)
  const xlsx = result.files.find(file => file.path.endsWith('.xlsx'))!
  assert.ok(xlsx, 'shipping Office XLSX runtime is used')
  assert.equal(readFileSync(xlsx.path).subarray(0, 2).toString(), 'PK')
  const Excel = createRequire(dshFile('packages/client/ui-sidebar-documentpreview/package.json'))('exceljs'), workbook = new Excel.Workbook()
  await workbook.xlsx.readFile(xlsx.path)
  const project = workbook.getWorksheet('项目与导出说明')
  assert.equal(project.getRow(2).getCell(2).value, state.project.title)
  assert.equal(project.getRow(2).getCell(2).type, Excel.ValueType.String)
  const quantities = workbook.getWorksheet('分口径数量'), headers = quantities.getRow(1).values as string[], valueColumn = headers.indexOf('value')
  assert.equal(quantities.getRow(2).getCell(valueColumn).value, 0)
  assert.equal(quantities.getRow(3).getCell(valueColumn).value, 'null（未知）')
  const baselineSheet = workbook.getWorksheet('中国原始清单快照'), baselineHeaders = baselineSheet.getRow(1).values as string[]
  assert.equal(baselineSheet.getRow(2).getCell(baselineHeaders.indexOf('quantity')).value, '9007199254740993.0001')
  const roadSheet = workbook.getWorksheet('道路已知小计'), roadHeaders = roadSheet.getRow(1).values as string[]
  assert.equal(roadSheet.getRow(2).getCell(roadHeaders.indexOf('currentKnownVolumeM3')).value, 50)
  const raw = JSON.parse(readFileSync(join(result.directory, 'source-snapshot.json'), 'utf8'))
  assert.equal(raw.project.quantities[1].value, null)
  assert.equal(raw.runs[3].output.details.rows[0].quantity, '9007199254740993.0001')
  const html = readFileSync(join(result.directory, 'engineering-report.html'), 'utf8')
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(html.includes('加工批准：未授予'))
  assert.ok(readFileSync(join(result.directory, 'project.csv'), 'utf8').includes("'=HYPERLINK"))
  assert.equal(result.customerAccepted, false); assert.equal(result.fabricationApproved, false)
})

test('long workbook cells have explicit lossless JSON locations and stale/blocked/version-changed values are not current totals', t => {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-export-long-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const state = fixture(), text = 'A'.repeat(33000)
  state.project.sources[0].title = text
  state.runs[0].providerChanged = true
  state.runs[2].executionStatus = 'blocked'
  state.runs[5].status = 'stale'
  const result = exportEngineeringFiles(cwd, state)
  const tableData = JSON.parse(readFileSync(join(result.directory, 'tables.json'), 'utf8'))
  assert.equal(tableData.sources[0].title, text)
  assert.ok(tableData['rebar-totals'].every((row: any) => row.currentKnownMassKg === null))
  assert.equal(tableData['road-totals'][0].currentKnownVolumeM3, null)
  assert.equal(tableData.ifc[0].currentNetVolumeM3, null)
  const XLSX = installedXlsx(), book = XLSX.readFile(join(result.directory, 'engineering-workbook.xlsx'))
  const sources = XLSX.utils.sheet_to_json(book.Sheets['来源版本'])
  assert.match(sources[0].title, /tables.json.*sources\/0\/title/)
})

test('CSV injection protection treats untrusted formulas as text without turning numeric negatives into strings', () => {
  for (const input of ['=SUM(1,2)', '+1+2', '-2+3', '@SUM(A1)', '\t=cmd', '\r=cmd', '  =HYPERLINK("x")']) assert.ok(csvCell(input).startsWith('"\''))
  assert.equal(csvCell(-2), '"-2"'); assert.equal(csvCell(null), '"null（未知）"'); assert.equal(csvCell('a"b'), '"a""b"')
})

test('export rejects traversal and real symlink output escape, while explicit missing XLSX fallback remains honest', t => {
  const base = mkdtempSync(join(tmpdir(), 'engineering-export-boundary-')), cwd = join(base, 'workspace'), outside = join(base, 'outside')
  mkdirSync(cwd); mkdirSync(outside); t.after(() => rmSync(base, { recursive: true, force: true }))
  assert.throws(() => exportEngineeringFiles(cwd, fixture(), '../overwrite'), /不能是路径/)
  symlinkSync(outside, join(cwd, 'Agent Pi Outputs'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => exportEngineeringFiles(cwd, fixture()), /符号链接/)
  const fallback = exportEngineeringFiles(outside, fixture(), 'fallback', { xlsx: null })
  assert.ok(fallback.files.some(file => file.mimeType === 'text/csv'))
  assert.ok(!fallback.files.some(file => file.path.endsWith('.xlsx')))
  assert.match(fallback.warnings[0], /未提供.*XLSX/)
})

test('real DSH defineTool accepts export DSL and actual services receive draft deliverables and hashed evidence', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-export-tool-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const services = new Map<string, any>(), definitions = new Map<string, any>(), nativeDefinitions: any[] = [], disposers: (() => void)[] = []
  const sessions = new Map([['main', { id: 'main', header: { cwd } }]]), agents = new Map<string, any>(), capabilities = new CapabilityRegistry()
  const fs = { resolve: async (path: string, options: any) => ({ targetKey: resolve(options?.cwd || cwd, path), displayPath: path }), processPath: (target: any) => target.targetKey, stat: async (target: any) => { try { return { type: statSync(target.targetKey).isFile() ? 'file' : 'directory' } } catch { return undefined } }, readBytes: async (target: any) => readFileSync(target.targetKey) }
  const ctx: any = { tools: { register: (tool: any) => definitions.set(tool.name, tool), schemas: () => [] }, provide: (name: string, value: any) => services.set(name, value), get: (name: string) => services.get(name), systemPrompt: { section() {} }, on() {}, emit() {}, inject: (_deps: string[], callback: any) => callback({ effect: (install: any) => install(), webServer: { register: () => () => {} } }) }
  services.set('sessions', { get: (id: string) => sessions.get(id) }); services.set('agents', { get: (id: string) => agents.get(id), list: () => [...agents.values()] }); services.set('sessionProjections', { stateOf: () => ({ questions: { active: [], settled: [] } }) })
  const agent = { session: sessions.get('main'), ctx: { get: (name: string) => name === 'fs' ? fs : services.get(name) } }; agents.set('main', agent)
  const taskGuide = registerTaskGuide(ctx, value => value, cwd), engineering = registerEngineering(ctx, value => value)
  await definitions.get('engineering_project').execute({ action: 'update', revision: 0, operationId: 'initial-engineering-state', patch: { title: '有状态依据的工程交付' } }, { agent })
  const exportCtx = { ...ctx, engineering, inject: (_deps: string[], callback: any) => callback({ effect: (install: any) => disposers.push(install()), professionalCapabilities: capabilities }) }
  const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
  registerEngineeringDelivery({ ...exportCtx, tools: { register: (tool: any) => nativeDefinitions.push(tool) } }, defineTool)
  assert.equal(nativeDefinitions.length, 1)
  const tool = nativeDefinitions[0]
  assert.equal(tool.parameters.properties.outputBasename.type, 'string')
  await assert.rejects(tool.execute({ project: fixture().project }, { agent }), /project|不能使用调用者/)
  const result = await tool.execute({ outputBasename: '实际交付' }, { agent })
  assert.equal(result.synchronization.status, 'recorded', result.synchronization.message)
  assert.equal(tool.output.render({}, result)[0].type, 'text')
  const task = taskGuide.read('main')
  assert.equal(task.findings.length, 1)
  assert.ok(task.deliverables.every(row => row.status === 'draft' && row.signature === 'not_required'))
  assert.ok(task.evidence.every(row => row.status === 'unverified' && row.sourceHash === fileHash(readFileSync(row.sourcePath!))))
  assert.ok(task.deliverables.some(row => row.path.endsWith('.xlsx')))
  assert.ok(task.evidence.filter(row => row.kind === 'derived').every(row => row.dependsOn?.includes(engineering.stateEvidenceId('main'))))
  engineering.syncTask('main')
  assert.ok(taskGuide.read('main').deliverables.every(row => row.status === 'draft'))
  await definitions.get('engineering_project').execute({ action: 'update', revision: engineering.status('main').revision, operationId: 'changed-engineering-state', patch: { title: '工程条件调整后的交付' } }, { agent })
  const changed = taskGuide.read('main')
  assert.ok(changed.deliverables.every(row => row.status === 'stale'), 'engineering state changes propagate through derived export evidence to deliverables')
  assert.ok(changed.evidence.filter(row => row.kind === 'derived').every(row => row.status === 'unverified'))
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(capabilities.list().length, 0)
  assert.equal(taskGuide.read('main').deliverables.length, task.deliverables.length)
  assert.ok(installedXlsx())
})

test('main-session scope and task synchronization failures are explicit', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-export-state-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const definitions: any[] = [], state = fixture(), session = { id: 'main', header: { cwd } }
  let reads = 0
  const ctx = { engineering: { status: () => ({ ...state, revision: reads++ ? 7 : 6 }) }, tools: { register: (tool: any) => definitions.push(tool) }, systemPrompt: { section() {} }, get: () => ({ read() { throw new Error('ledger unavailable') } }) }
  registerEngineeringDelivery(ctx, value => value)
  const result = await definitions[0].execute({}, { agent: { session } })
  assert.equal(result.snapshotChanged, true)
  assert.equal(result.synchronization.status, 'failed')
  assert.match(result.synchronization.message, /ledger unavailable/)
  assert.ok(result.warnings.some((message: string) => message.includes('历史快照')))
  await assert.rejects(definitions[0].execute({}, { agent: { session: { id: 'child', header: { cwd, parentSession: 'main' } } } }), /主对话/)
})

test('civil delivery keeps independent coverage, partial unknowns and 2D/3D bases separate, with hash-bound PDF calibration', async t => {
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-civil-export-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const state = fixture(), sources = [{ sourceId: 'drawing', sourceHash: hash, locator: '图纸目录 / A-A' }]
  const evidence = { sources: state.project.sources, dependencies: [{ kind: 'source' as const, id: 'drawing' }] }
  const data: CivilCalculationInput = {
    catalog: { id: 'catalog-r1', title: '独立设计目录', sources, items: [
      ...['plane', 'space', 'partial'].map(physicalId => ({ physicalId, kind: 'pipe' as const, title: physicalId, sources, disposition: 'include' as const })),
      { physicalId: 'missing', kind: 'rectangular', title: '缺详图', sources, disposition: 'include' },
      { physicalId: 'zero', kind: 'count', title: '有依据零值', sources, disposition: 'include' },
      { physicalId: 'excluded', kind: 'count', title: '其他标段', sources, disposition: 'exclude', reason: '本次范围以外' },
    ] },
    objects: [
      { id: 'p2', physicalId: 'plane', title: '平面管长', sources, kind: 'pipe', dimension: '2d', pathKind: 'polyline', unit: 'm', points: [[0, 0], [3, 4]] },
      { id: 'p3', physicalId: 'space', title: '空间管长', sources, kind: 'pipe', dimension: '3d', pathKind: 'polyline', unit: 'm', points: [[0, 0, 0], [3, 4, 12]] },
      { id: 'pp', physicalId: 'partial', title: '间断管长', sources, kind: 'pipe', dimension: '2d', pathKind: 'polyline', unit: 'm', points: [[0, 0], [0, 4], null, [0, 8]] },
      { id: 'n0', physicalId: 'zero', title: '零', sources, kind: 'count', count: 0 },
      { id: 'nx', physicalId: 'unlisted', title: '未归属对象', sources, kind: 'count', count: 2 },
    ],
  }
  const calibration: PdfCalibrationInput = { source: sources[0], page: 2, viewport: { id: 'detail-A', width: 1000, height: 500 }, coordinateSpace: 'normalized', reference: { source: sources[0], page: 2, viewportId: 'detail-A', start: [0, 0], end: [0.5, 0], realLength: 10000, unit: 'mm', label: '10000' } }
  const append = (id: string, details: any, input: unknown, status = 'current') => state.runs.push({ ...state.runs[0], id, providerId: 'civil-quantities', input, dependencies: evidence.dependencies, status, output: { summary: '合成工程数据验证', issues: details.issues, details } })
  const calculated = calculateCivil(data, evidence), calibrated = calibratePdf(calibration, evidence)
  append('civil-current', calculated, { action: 'calculate', data })
  append('civil-stale', calculated, { action: 'calculate', data }, 'stale')
  append('pdf-current', calibrated, { action: 'calibrate_pdf', data: calibration })
  append('pdf-stale', calibrated, { action: 'calibrate_pdf', data: calibration }, 'stale')
  append('pdf-unknown', calibratePdf({ ...calibration, reference: { ...calibration.reference, realLength: null } }, evidence), {})
  const before = JSON.stringify(state), result = exportEngineeringFiles(cwd, state)
  const tables = JSON.parse(readFileSync(join(result.directory, 'tables.json'), 'utf8'))
  assert.equal(JSON.stringify(state), before)
  const rows = tables['civil-objects'].filter((row: any) => row.runId === 'civil-current')
  assert.deepEqual(rows.filter((row: any) => ['plane', 'space', 'partial', 'missing', 'zero'].includes(row.physicalId)).map((row: any) => [row.quantity, row.knownPortion, row.unit, row.quantityBasis]), [[5, null, 'm', 'plan_2d'], [13, null, 'm', 'spatial_3d'], [null, 4, 'm', 'plan_2d'], [null, null, 'm3', 'rectangular_solid'], [0, null, 'item', 'count']])
  const totals = tables['civil-totals'].filter((row: any) => row.runId === 'civil-current')
  assert.deepEqual(totals.filter((row: any) => row.kind === 'pipe').map((row: any) => [row.quantityBasis, row.completeSubtotal, row.knownPartialSubtotal, row.knownSubtotal, row.currentKnownQuantitySubtotal]), [['plan_2d', 5, 4, 9, 9], ['spatial_3d', 13, null, 13, 13]])
  assert.equal(totals.find((row: any) => row.kind === 'rectangular').knownSubtotal, null)
  assert.ok(tables['civil-totals'].filter((row: any) => row.runId === 'civil-stale').every((row: any) => row.currentCompleteSubtotal === null && row.currentKnownPartialSubtotal === null && row.currentKnownQuantitySubtotal === null))
  assert.ok(tables['civil-objects'].filter((row: any) => row.runId === 'civil-stale').every((row: any) => row.currentQuantity === null && row.currentKnownPortion === null))
  const catalog = tables['civil-catalog'].filter((row: any) => row.runId === 'civil-current')
  assert.equal(catalog.length, 6); assert.equal(catalog.find((row: any) => row.physicalId === 'missing').resultStatus, 'missing')
  assert.equal(catalog.find((row: any) => row.physicalId === 'excluded').reason, '本次范围以外')
  assert.ok(!catalog.some((row: any) => row.physicalId === 'unlisted'))
  assert.deepEqual(tables['civil-coverage'].filter((row: any) => row.runId === 'civil-current').map((row: any) => [row.declared, row.included, row.partial, row.incomplete, row.unlisted, row.currentCompleteWithinDeclaredCatalog]), [[6, 5, 1, 2, 1, false]])
  const pdf = tables['pdf-calibrations']
  assert.deepEqual(pdf[0].basis, calibration); assert.equal(pdf[0].calibrationId, calibrated.calibrationId)
  assert.equal(pdf[0].currentMetersPerViewportPixel, 0.02)
  assert.equal(pdf[0].currentMetersPerNormalizedX, 20); assert.equal(pdf[0].currentMetersPerNormalizedY, 10)
  assert.equal(pdf[1].currentMetersPerViewportPixel, null); assert.equal(pdf[1].metersPerViewportPixel, 0.02)
  assert.equal(pdf[2].status, 'blocked'); assert.equal(pdf[2].metersPerViewportPixel, null)
  const Excel = createRequire(dshFile('packages/client/ui-sidebar-documentpreview/package.json'))('exceljs'), workbook = new Excel.Workbook()
  await workbook.xlsx.readFile(join(result.directory, 'engineering-workbook.xlsx'))
  const sheet = workbook.getWorksheet('土建市政分口径小计'), headers = sheet.getRow(1).values as string[]
  assert.equal(sheet.getRow(2).getCell(headers.indexOf('knownSubtotal')).value, 9)
  assert.equal(sheet.getRow(3).getCell(headers.indexOf('quantityBasis')).value, 'spatial_3d')
  assert.equal(sheet.getRow(3).getCell(headers.indexOf('knownPartialSubtotal')).value, 'null（未知）')
  assert.equal(sheet.getRow(4).getCell(headers.indexOf('knownSubtotal')).value, 'null（未知）')
})

test('XLSX resolution rejects missing installed anchors and dependencies outside the selected runtime closure', t => {
  const base = mkdtempSync(join(tmpdir(), 'engineering-xlsx-runtime-')); t.after(() => rmSync(base, { recursive: true, force: true }))
  const checkout = join(base, 'deepseek-harness'), anchor = join(checkout, 'packages/client/ui-sidebar-documentpreview')
  mkdirSync(anchor, { recursive: true })
  assert.equal(installedXlsx(checkout), null)
  writeFileSync(join(anchor, 'package.json'), '{}')
  const inherited = join(base, 'node_modules/xlsx'); mkdirSync(inherited, { recursive: true })
  writeFileSync(join(inherited, 'package.json'), '{"main":"index.cjs"}')
  writeFileSync(join(inherited, 'index.cjs'), "throw new Error('ancestor dev dependency must not execute')")
  assert.equal(installedXlsx(checkout), null)
})

test('optional actual installer runtime XLSX resolves and exports within its portable closure', { skip: !process.env.ENGINEERING_DELIVERY_RUNTIME_DSH }, async t => {
  const checkout = realpathSync(process.env.ENGINEERING_DELIVERY_RUNTIME_DSH!)
  const require = createRequire(join(checkout, 'packages/client/ui-sidebar-documentpreview/package.json'))
  const location = realpathSync(require.resolve('xlsx')), part = relative(checkout, location)
  assert.ok(!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep), location)
  assert.equal(installedXlsx(checkout)?.version, '0.20.3')
  const cwd = mkdtempSync(join(tmpdir(), 'engineering-installed-export-')); t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const result = exportEngineeringFiles(cwd, fixture(), '安装版验证', { xlsx: installedXlsx(checkout) })
  const Excel = createRequire(dshFile('packages/client/ui-sidebar-documentpreview/package.json'))('exceljs'), workbook = new Excel.Workbook()
  await workbook.xlsx.readFile(join(result.directory, 'engineering-workbook.xlsx'))
  assert.equal(workbook.getWorksheet('分口径数量').getRow(3).getCell(5).value, 'null（未知）')
  console.log(`Portable XLSX verified: ${location}`)
})
