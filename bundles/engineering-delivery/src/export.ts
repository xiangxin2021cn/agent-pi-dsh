import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'
import { dshRoot } from '../../tender-host/src/dsh.ts'
import { engineeringTables } from './tables.ts'
import type { ExportState, ExportTable } from './tables.ts'

export const fileHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export function installedXlsx(checkout = dshRoot()): any | null {
  // Resolve only inside the selected installed DSH closure, never an ancestor's dev dependency.
  const anchor = join(checkout, 'packages/client/ui-sidebar-documentpreview/package.json')
  if (!existsSync(anchor)) return null
  try {
    const require = createRequire(anchor), location = realpathSync(require.resolve('xlsx'))
    const part = relative(realpathSync(checkout), location)
    if (isAbsolute(part) || part === '..' || part.startsWith('..' + sep)) return null
    return require(location)
  }
  catch (error: any) { if (error.code === 'MODULE_NOT_FOUND') return null; throw error }
}
const scalar = (value: unknown): string | number | boolean => value === null ? 'null（未知）' : value === undefined ? '未提供' : typeof value === 'object' ? JSON.stringify(value) : typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
export function csvCell(value: unknown): string {
  let text = String(scalar(value))
  // All untrusted textual cells stay textual when opened in Excel/LibreOffice.
  if (typeof value !== 'number' && typeof value !== 'boolean' && (/^[\t\r\n]/.test(text) || /^[\s\uFEFF]*[=+\-@]/u.test(text))) text = "'" + text
  return '"' + text.replaceAll('"', '""') + '"'
}
const columns = (table: ExportTable) => [...new Set(table.rows.flatMap(row => Object.keys(row)))]
export const csvTable = (table: ExportTable) => {
  const keys = columns(table)
  return '\uFEFF' + [keys.map(csvCell).join(','), ...table.rows.map(row => keys.map(key => csvCell(row[key])).join(','))].join('\r\n') + '\r\n'
}
const escapeHtml = (value: unknown) => String(scalar(value)).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const labels: Record<string, string> = { runId: '计算记录', runStatus: '运行有效状态', currentKnownSubtotal: '可作为当前已知小计', currentKnownLengthM: '当前已知长度(m)', currentKnownMassKg: '当前已知质量(kg)', recordedKnownLengthM: '原记录长度(m)', recordedKnownMassKg: '原记录质量(kg)', currentKnownVolumeM3: '当前已知体积(m³)', recordedKnownVolumeM3: '原记录体积(m³)', currentVolumeM3: '当前分段体积(m³)', currentTotalLengthM: '当前分组长度(m)', currentTotalMassKg: '当前分组质量(kg)', basis: '计量口径或标定依据', purpose: '数量用途', unit: '单位', value: '数值', status: '状态', review: '复核说明', sourceRefs: '依据定位', formula: '算式', scope: '工作范围', missingInputs: '缺少条件', count: '根数', groupId: '钢筋组', objectId: '对象', quantity: '原记录数量', quantityDelta: '数量差异', snapshotPointer: '快照定位', quantityBasis: '几何计量口径', knownPortion: '原记录局部已知量', currentQuantity: '当前完整对象数量', currentKnownPortion: '当前局部已知量', completeSubtotal: '原记录完整对象小计', knownPartialSubtotal: '原记录局部已知小计', knownSubtotal: '原记录全部已知小计', currentCompleteSubtotal: '当前完整对象小计', currentKnownPartialSubtotal: '当前局部已知小计', currentKnownQuantitySubtotal: '当前全部已知小计', catalogId: '独立目录编号', catalogSources: '目录来源依据', currentCompleteWithinDeclaredCatalog: '当前声明目录范围已算齐', calibrationId: '标定内容哈希', metersPerViewportPixel: '原记录米/视口像素', currentMetersPerViewportPixel: '当前米/视口像素', metersPerNormalizedX: '原记录归一化X轴米比例', metersPerNormalizedY: '原记录归一化Y轴米比例' }
function htmlReport(state: ExportState, tables: ExportTable[], createdAt: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHtml(state.project.title)} 工程计算书</title><style>body{font:15px/1.65 system-ui,"Microsoft YaHei",sans-serif;color:#172c3c;background:#f6f8fa;margin:0}main{max-width:1200px;margin:auto;padding:32px}h1{font-size:30px}h2{font-size:21px;margin-top:32px}.notice{background:#fff2d3;padding:16px;border-left:4px solid #b47713}section{background:white;border:1px solid #dce3e9;border-radius:8px;padding:18px;margin-top:20px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:8px 10px;border:1px solid #dce3e9;text-align:left;vertical-align:top;min-width:90px;max-width:480px;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#eaf1f6}small{color:#526776}a{color:#245b85}@media print{body{background:white}main{padding:0}.scroll{overflow:visible}section{break-inside:auto}}</style></head><body><main><h1>${escapeHtml(state.project.title)} · 工程计算书</h1><p>工程版本 ${state.revision} · 导出于 ${escapeHtml(createdAt)}</p><p class="notice">此文件为工程账本快照，仍需专业复核。客户验收：未授予；加工批准：未授予。null 表示未知，0 表示已登记零值。过期、阻塞、插件版本变化的结果仅保留历史，不列为当前已知小计。各运行、各单位和几何/合同计量/下料/采购口径保持分开，不跨运行相加。</p><p>完整原始状态见 source-snapshot.json；全部投影字段及未缩短值见 tables.json。工作簿和 CSV 中的公式文本为证据，不执行公式。</p><nav>${tables.map(table => `<a href="#${table.id}">${escapeHtml(table.title)}</a>`).join(' · ')}</nav>${tables.map(table => {
    const keys = columns(table)
    return `<section id="${table.id}"><h2>${escapeHtml(table.title)} <small>${table.rows.length} 行</small></h2>${table.rows.length ? `<div class="scroll"><table><thead><tr>${keys.map(key => `<th title="${escapeHtml(key)}">${escapeHtml(labels[key] || key)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row, i) => `<tr>${keys.map(key => { const value = String(scalar(row[key])); return `<td>${escapeHtml(value.length > 2000 ? `[完整值见 tables.json：/${table.id}/${i}/${key}，共 ${value.length} 字符]` : row[key])}</td>` }).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>本快照未登记此类数据，不能据此认定不适用或覆盖完成。</p>'}</section>`
  }).join('')}</main></body></html>`
}

export function exportEngineeringFiles(cwd: string, state: ExportState, outputBasename = '工程计算交付', options: { xlsx?: any | null; now?: string } = {}) {
  if (!isAbsolute(cwd) || !statSync(cwd).isDirectory()) throw new Error('导出需要实际会话工作目录。')
  if (!/^[\p{L}\p{N}_-]{1,60}$/u.test(outputBasename) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(outputBasename)) throw new Error('outputBasename 只允许 1–60 个文字、数字、下划线或短横线，不能是路径。')
  const root = realpathSync(cwd), parents = ['Agent Pi Outputs', 'Engineering Exports']
  let outputRoot = root
  for (const part of parents) {
    outputRoot = join(outputRoot, part)
    const check = () => { if (existsSync(outputRoot)) { const part = relative(root, realpathSync(outputRoot)); if (isAbsolute(part) || part === '..' || part.startsWith('..' + sep)) throw new Error('交付输出目录通过符号链接越出会话工作目录。') } }
    check(); mkdirSync(outputRoot, { recursive: true }); check()
  }
  const id = randomUUID(), directory = join(outputRoot, `${outputBasename}-r${state.revision}-${id.slice(0, 8)}`)
  mkdirSync(directory)
  const tables = engineeringTables(state), files: { id: string; title: string; path: string; relativePath: string; sha256: string; mimeType: string }[] = [], warnings: string[] = []
  const save = (name: string, bytes: string | Uint8Array, mimeType: string, title = name) => {
    const path = join(directory, name), data = typeof bytes === 'string' ? Buffer.from(bytes) : bytes
    writeFileSync(path, data, { flag: 'wx' })
    files.push({ id: `${id}:${name}`, title, path, relativePath: relative(root, path), sha256: fileHash(readFileSync(path)), mimeType })
  }
  const createdAt = options.now || new Date().toISOString()
  save('source-snapshot.json', JSON.stringify(state, null, 2), 'application/json', '工程来源与计算原始快照')
  save('tables.json', JSON.stringify(Object.fromEntries(tables.map(table => [table.id, table.rows])), null, 2), 'application/json', '完整表格字段与空值')
  for (const table of tables) save(`${table.id}.csv`, csvTable(table), 'text/csv', table.title)
  const xlsx = options.xlsx === undefined ? installedXlsx() : options.xlsx
  if (xlsx) {
    const book = xlsx.utils.book_new()
    for (const table of tables) {
      const keys = columns(table)
      const values = [keys, ...table.rows.map((row, i) => keys.map(key => { const value = scalar(row[key]); return typeof value === 'string' && value.length > 32000 ? `[完整值见 tables.json：/${table.id}/${i}/${key}，共 ${value.length} 字符]` : value }))]
      const sheet = xlsx.utils.aoa_to_sheet(values)
      sheet['!cols'] = keys.map(() => ({ wch: 24 }))
      if (keys.length) sheet['!autofilter'] = { ref: xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.rows.length, c: keys.length - 1 } }) }
      xlsx.utils.book_append_sheet(book, sheet, table.title.slice(0, 31))
    }
    save('engineering-workbook.xlsx', xlsx.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '工程计算工作簿')
  } else warnings.push('当前运行环境未提供现有 Office XLSX 库，本次交付 CSV、HTML 和 JSON，不把 CSV 改名冒充工作簿。')
  save('engineering-report.html', htmlReport(state, tables, createdAt), 'text/html', '工程计算书')
  return { exportId: id, revision: state.revision, projectId: state.project.id, directory, createdAt, files, warnings, fabricationApproved: false, customerAccepted: false }
}
