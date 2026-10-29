import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { test } from 'node:test'
import { retainKnowledgeVersion } from '../src/knowledge-versions.ts'
import type { KbEntry, KbManifest } from '../src/kb.ts'
import { crc32, zipStore } from '../src/xlsx-zip.ts'
import { inspectTemplateDocx } from '../src/template-dna-office.ts'
import { distillTemplateDna, listTemplateDna, readTemplateDna, validateTemplateDnaArtifact } from '../src/template-dna.ts'

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const sample = '# 范围\n\n按实际资料说明内容范围，不复制旧项目事实。\n\n# 编写依据\n\n保留来源与证据。\n'
function fixture(original?: Buffer, category = '用户模板') {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-dna-'))
  mkdirSync(join(root, 'files'))
  const managedPath = join(root, 'files', 'template.md')
  writeFileSync(managedPath, sample)
  const originalPath = original ? join(root, 'template.docx') : undefined
  if (originalPath) writeFileSync(originalPath, original!)
  const entry: KbEntry = { slug: 'user-template', name: '中立用户范本', category, sourcePath: managedPath, managedPath, sourceHash: hash(sample), sizeBytes: Buffer.byteLength(sample), chunkCount: 1, parseStatus: 'ready', createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-10-29T00:00:00Z', ...(originalPath ? { originalPath, originalName: '范本.docx' } : {}) }
  const manifest: KbManifest = { schemaVersion: 1, slug: entry.slug, name: entry.name, category, sourcePath: managedPath, indexedAt: entry.createdAt, chunks: [{ id: 'source-body', title: '范本全文', startLine: 1, endLine: 8, startOffset: 0, endOffset: sample.length, metadata: { headingPath: [], clauseRefs: [], tableRefs: [], boqRefs: [] } }] }
  const versionId = retainKnowledgeVersion(root, entry, manifest)!
  return { root, ref: { slug: entry.slug, versionId }, dispose: () => rmSync(root, { recursive: true, force: true }) }
}
function docxFiles(top = 1400) {
  return [
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'word/document.xml', data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>范围</w:t></w:r></w:p><w:p><w:r><w:t>使用本项目实际材料。</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>编写依据</w:t></w:r></w:p><w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:tc><w:p><w:r><w:t>来源</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>说明</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="' + top + '" w:right="1700" w:bottom="1400" w:left="1700"/></w:sectPr></w:body></w:document>' },
    { name: 'word/styles.xml', data: '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="宋体"/><w:sz w:val="24"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>' },
    { name: 'word/numbering.xml', data: '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum></w:numbering>' },
  ]
}
function streamedZip(files: Array<{ name: string; data: string }>): Buffer {
  const bodies: Buffer[] = [], entries: Buffer[] = []; let offset = 0
  for (const item of files) {
    const name = Buffer.from(item.name), raw = Buffer.from(item.data), data = deflateRawSync(raw), crc = crc32(raw)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26)
    const descriptor = Buffer.alloc(16); descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(data.length, 8); descriptor.writeUInt32LE(raw.length, 12)
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42)
    bodies.push(local, name, data, descriptor); entries.push(central, name); offset += local.length + name.length + data.length + descriptor.length
  }
  const central = Buffer.concat(entries), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...bodies, central, end])
}

test('one template retains six readable layers, source hashes and skill pin without claiming full author DNA', () => {
  const f = fixture()
  try {
    const profile = distillTemplateDna(f.root, { ...f.ref, edition: 'tender' })
    assert.equal(profile.coverage.sampleCount, 1); assert.equal(profile.coverage.fullAuthorDna, false)
    assert.equal(profile.method, 'deterministic'); assert.equal(profile.layers.length, 6)
    assert.equal(profile.source.manuscriptHash, hash(sample)); assert.equal(profile.skill.commit, 'ee3d97ee27268004b5187d97711161f44fc4aae4')
    assert.deepEqual(profile.structure.headings.map(row => row.title), ['范围', '编写依据'])
    for (const item of Object.values(profile.artifacts)) assert.equal(hash(readFileSync(item.path)), item.sha256)
    assert.match(readFileSync(profile.artifacts.summary.path, 'utf8'), /不虚构另四篇/)
    assert.equal(distillTemplateDna(f.root, { ...f.ref, edition: 'tender' }).dnaId, profile.dnaId)
    assert.equal(listTemplateDna(f.root, f.ref).length, 1)
  } finally { f.dispose() }
})

test('grounded AI observations require exact fixed-source quotes and cannot overwrite native layout', () => {
  const f = fixture(zipStore(docxFiles()))
  try {
    const deterministic = distillTemplateDna(f.root, f.ref)
    const ai = distillTemplateDna(f.root, { ...f.ref, analysis: { layers: [{ id: 'L5', observations: [{ text: '论断需要来源定位。', sourceQuote: '保留来源与证据。' }, { text: '每一章必须有10000字。', sourceQuote: '原文中并不存在的句子。' }], unknowns: ['专业深度仍需结合当前任务确认。'] }] } })
    assert.equal(ai.method, 'grounded-ai'); assert.notEqual(ai.dnaId, deterministic.dnaId)
    assert.deepEqual(ai.format, deterministic.format)
    assert.ok(ai.layers[4]!.observations.some(value => value.includes('论断需要来源定位')))
    assert.ok(!ai.layers[4]!.observations.some(value => value.includes('10000')))
    assert.ok(ai.layers[4]!.unknowns.some(value => value.includes('已丢弃')))
    assert.equal(listTemplateDna(f.root, f.ref).length, 2)
  } finally { f.dispose() }
})

test('empty, unknown-only and entirely ungrounded analysis never claims grounded AI extraction', () => {
  const f = fixture()
  try {
    const baseline = distillTemplateDna(f.root, f.ref)
    const empty = distillTemplateDna(f.root, { ...f.ref, analysis: { layers: [] } })
    assert.equal(empty.method, 'deterministic'); assert.equal(empty.dnaId, baseline.dnaId)
    const unknown = distillTemplateDna(f.root, { ...f.ref, analysis: { layers: [{ id: 'L5', observations: [], unknowns: ['尚无可定位的深度要求。'] }] } })
    assert.equal(unknown.method, 'deterministic')
    const invalid = distillTemplateDna(f.root, { ...f.ref, analysis: { layers: [{ id: 'L5', observations: [{ text: '每章必须10000字。', sourceQuote: '固定原文没有这句话。' }], unknowns: [] }] } })
    assert.equal(invalid.method, 'deterministic')
    assert.ok(invalid.layers[4]!.unknowns.some(row => row.includes('已丢弃')))
    assert.ok(!invalid.layers[4]!.observations.some(row => row.includes('10000')))
    assert.deepEqual(invalid.structure, baseline.structure)
  } finally { f.dispose() }
})

test('DOCX uses actual OOXML page, inherited fonts, heading styles, numbering and table columns', () => {
  const data = inspectTemplateDocx(streamedZip(docxFiles()))
  assert.equal(data.format.page?.marginTopTwips, 1400)
  assert.equal(data.format.body.fontSizePt, 12); assert.equal(data.format.body.fontFamily, 'Arial'); assert.equal(data.format.body.eastAsiaFontFamily, '宋体')
  assert.equal(data.format.headingStyles[0]?.fontSizePt, 16); assert.equal(data.format.headingStyles[0]?.bold, true)
  assert.deepEqual(data.format.tables[0]?.headers, ['来源', '说明']); assert.deepEqual(data.format.tables[0]?.columnWidthsTwips, [2000, 5000])
  assert.equal(data.format.numbering[0]?.levels[0]?.text, '%1.')
  const broken = streamedZip(docxFiles()); broken[45] ^= 0xff
  assert.throws(() => inspectTemplateDocx(broken), /ZIP|校验|invalid|unexpected|incorrect/i)
})

test('actual artifact bytes get hash-bound checks; layout mismatch and missing headings fail', () => {
  const original = zipStore(docxFiles()), f = fixture(original)
  try {
    const profile = distillTemplateDna(f.root, f.ref), accepted = validateTemplateDnaArtifact(profile, { bytes: original, format: 'docx' })
    assert.equal(accepted.status, 'passed'); assert.equal(accepted.artifactSha256, hash(original)); assert.equal(accepted.professionalReviewRequired, true)
    const changed = zipStore(docxFiles(1800)), rejected = validateTemplateDnaArtifact(profile, { bytes: changed, format: 'docx' })
    assert.equal(rejected.status, 'failed'); assert.notEqual(rejected.artifactSha256, accepted.artifactSha256)
    assert.ok(rejected.violations.some(value => value.includes('marginTopTwips')))
    const missing = validateTemplateDnaArtifact(profile, { bytes: Buffer.from('# 范围\n正文'), format: 'md' })
    assert.equal(missing.status, 'failed'); assert.ok(missing.violations.some(value => value.includes('编写依据')))
    const chapter = validateTemplateDnaArtifact(profile, { bytes: Buffer.from('# 范围\n正文'), format: 'md', scope: 'chapter', sectionTitle: '范围' })
    assert.equal(chapter.violations.length, 0); assert.equal(chapter.status, 'review')
  } finally { f.dispose() }
})

test('plain text/PDF lack exact Word layout and remain review; unknown chapter mapping cannot self-pass', () => {
  const f = fixture()
  try {
    const profile = distillTemplateDna(f.root, f.ref)
    assert.equal(profile.format, undefined)
    assert.equal(validateTemplateDnaArtifact(profile, { bytes: Buffer.from(sample), format: 'md' }).status, 'review')
    const pdf = validateTemplateDnaArtifact(profile, { bytes: Buffer.from('%PDF-1.7\n'), format: 'pdf' })
    assert.equal(pdf.machinePassed, false); assert.ok(pdf.gaps.some(value => value.includes('渲染')))
    assert.ok(validateTemplateDnaArtifact(profile, { bytes: Buffer.from(sample), format: 'md', scope: 'chapter', sectionTitle: '不存在' }).gaps.some(value => value.includes('映射')))
  } finally { f.dispose() }
})

test('non-template categories, invalid references and tampered artifacts are rejected', () => {
  const f = fixture(undefined, '规范'), g = fixture()
  try {
    assert.throws(() => distillTemplateDna(f.root, f.ref), /用户模板/)
    assert.throws(() => listTemplateDna(g.root, { ...g.ref, slug: '..' }), /非法/)
    const profile = distillTemplateDna(g.root, g.ref)
    writeFileSync(profile.artifacts.L1.path, 'tampered')
    assert.throws(() => readTemplateDna(g.root, { ...g.ref, dnaId: profile.dnaId }), /已变化|缺失/)
  } finally { f.dispose(); g.dispose() }
})
