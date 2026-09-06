import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { deflateRawSync } from 'node:zlib'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const desktopDir = join(root, 'apps', 'desktop')
const electronExe = join(desktopDir, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')
const pnpmStore = join(root, 'vendor', 'deepseek-harness', 'node_modules', '.pnpm')
const deadlineMs = Number(process.env.AGENT_PI_OFFICE_SMOKE_MS || 360_000)
const tesseractExe = [
  process.env.AGENT_PI_TESSERACT,
  process.platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : undefined,
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe' : undefined,
  process.platform === 'win32' ? undefined : '/usr/bin/tesseract',
].find((candidate) => candidate && existsSync(candidate))

function redactSecrets(value) {
  return String(value ?? '')
    .replace(/([?&]token=)[^&#\s"'<>]+/giu, '$1REDACTED')
    .replace(/(\btoken\s*[=:]\s*)[^\s,;"'<>]+/giu, '$1REDACTED')
    .replace(/(\bauthorization\s*[=:]\s*(?:bearer\s+)?)[^\s,;"'<>]+/giu, '$1REDACTED')
}

function playwrightEntry() {
  const entry = readdirSync(pnpmStore, { withFileTypes: true })
    .filter((item) => item.isDirectory() && /^playwright@/.test(item.name))
    .map((item) => join(pnpmStore, item.name, 'node_modules', 'playwright', 'index.mjs'))
    .find((path) => existsSync(path))
  if (!entry) throw new Error('Playwright is missing from the bundled DSH toolchain')
  return entry
}

function safeUrl(raw) {
  try {
    const url = new URL(raw)
    url.pathname = url.pathname.replace(/\/uf\/[^/]+/gu, '/uf/REDACTED_FILE_KEY')
    if (url.searchParams.has('token')) url.searchParams.set('token', 'REDACTED')
    for (const key of ['file', 'workspace', 'cwd']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, `REDACTED_${key.toUpperCase()}`)
    }
    return redactSecrets(url.toString())
  } catch {
    return redactSecrets(raw)
  }
}

function normalizedMarker(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/gu, '')
}

function inspectRenderedMarker(screenshot, marker) {
  if (!tesseractExe) return { available: false, markerSeen: false, engine: null }
  const result = spawnSync(tesseractExe, [screenshot, 'stdout', '-l', 'eng', '--psm', '6'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const text = String(result.stdout || '')
  return {
    available: true,
    markerSeen: result.status === 0 && normalizedMarker(text).includes(normalizedMarker(marker)),
    engine: 'tesseract-eng',
    exitCode: result.status,
    ...result.status === 0 ? {} : { error: redactSecrets(result.stderr || 'OCR failed') },
  }
}

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i += 1) {
  let crc = i
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  crcTable[i] = crc
}

function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value) {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value, 0)
  return buffer
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value, 0)
  return buffer
}

function zip(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8')
    const compressed = deflateRawSync(raw)
    const crc = crc32(raw)
    const local = Buffer.concat([
      Buffer.from('PK\u0003\u0004', 'binary'), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), name, compressed,
    ])
    localParts.push(local)
    centralParts.push(Buffer.concat([
      Buffer.from('PK\u0001\u0002', 'binary'), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0),
      u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0),
      u16(0), u32(0), u32(offset), name,
    ]))
    offset += local.length
  }
  const central = Buffer.concat(centralParts)
  const end = Buffer.concat([
    Buffer.from('PK\u0005\u0006', 'binary'), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ])
  return Buffer.concat([...localParts, central, end])
}

function createXlsx(path) {
  const marker = 'Agent Pi XLSX Smoke 013'
  writeFileSync(path, zip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Smoke" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1"><c r="A1" t="inlineStr"><is><t>${xml(marker)}</t></is></c><c r="B1" t="inlineStr"><is><t>Status</t></is></c></row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>Gateway preview</t></is></c><c r="B2"><v>2026</v></c></row>
</sheetData></worksheet>`,
    },
  ]))
}

function createDocx(path) {
  const marker = 'Agent Pi DOCX Smoke 013'
  writeFileSync(path, zip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>${xml(marker)}</w:t></w:r></w:p>
  <w:p><w:r><w:t>Official Gateway document preview.</w:t></w:r></w:p>
  <w:sectPr/>
</w:body></w:document>`,
    },
  ]))
}

function createPptx(path) {
  const marker = 'Agent Pi PPTX Smoke 013'
  writeFileSync(path, zip([
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`,
    },
    {
      name: 'ppt/presentation.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`,
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`,
    },
    {
      name: 'ppt/slides/slide1.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Smoke title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
      <p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="10363200" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200"/><a:t>${xml(marker)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`,
    },
  ]))
}

assert.ok(existsSync(electronExe), `Electron executable missing: ${electronExe}`)
assert.ok(existsSync(join(root, 'vendor', 'deepseek-harness', 'apps', 'web', 'dist', 'index.html')), 'DSH web dist is not built')
assert.ok(existsSync(join(root, 'vendor', 'dsh-univer-office', 'lib', 'index.js')), 'Office bundle is missing')

const { _electron: electron } = await import(pathToFileURL(playwrightEntry()).href)
const scratch = mkdtempSync(join(tmpdir(), 'agent-pi-office-013-'))
const userDataDir = join(scratch, 'electron-user-data')
const dshHome = join(scratch, 'dsh-home')
const workspace = join(scratch, 'workspace')
const artifactDir = join(root, 'output', 'playwright', 'office-013')
const fixturePaths = {
  xlsx: join(workspace, 'office-smoke.xlsx'),
  docx: join(workspace, 'office-smoke.docx'),
  pptx: join(workspace, 'office-smoke.pptx'),
}

mkdirSync(workspace, { recursive: true })
mkdirSync(artifactDir, { recursive: true })
for (const artifact of ['report.json', 'failure.log', 'failure.png', '1-xlsx.png', '2-docx.png', '3-pptx.png']) {
  rmSync(join(artifactDir, artifact), { force: true })
}
createXlsx(fixturePaths.xlsx)
createDocx(fixturePaths.docx)
createPptx(fixturePaths.pptx)

const profileInit = spawnSync(process.execPath, [join(root, 'scripts', 'init-tender-profile.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
    DSH_HOME: dshHome,
  },
  encoding: 'utf8',
  windowsHide: true,
  timeout: Math.min(deadlineMs, 180_000),
})
assert.equal(profileInit.status, 0, profileInit.stderr || profileInit.stdout || 'profile init failed')

const profilePath = join(dshHome, 'profiles', 'tender', 'package.json')
const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
assert.ok(profile.dsh?.profile?.bundles?.includes('dsh-univer-office'), 'Office is not active in the isolated tender profile')

const profilePatchPath = join(dshHome, 'profiles', 'tender', 'cordis.patch.yml')
const profilePatch = readFileSync(profilePatchPath, 'utf8').replace('# agent-pi:managed-defaults', '# agent-pi:office-013-picker')
writeFileSync(profilePatchPath, profilePatch + [
  '',
  '# The smoke runner cannot drive an OS directory dialog; use the official browser picker.',
  '- id: directory-picker',
  '  disabled: true',
  '- insert:',
  '    - id: directory-picker-browse',
  "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
  '    - id: ui-directory-picker-browse',
  "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
  '',
].join('\n'), 'utf8')

let electronApp
let page
let processOutput = ''
const pageErrors = []
const consoleErrors = []
const consoleWarnings = []
const requestFailures = []
const externalRequests = []
const results = []
const markerEvidence = new Map()
const fixtureMarkers = {
  xlsx: 'Agent Pi XLSX Smoke 013',
  docx: 'Agent Pi DOCX Smoke 013',
  pptx: 'Agent Pi PPTX Smoke 013',
}
const startedAt = Date.now()
const remaining = () => Math.max(1, deadlineMs - (Date.now() - startedAt))

async function clickOptional(pattern, timeout = 5_000) {
  const button = page.getByRole('button', { name: pattern }).first()
  const visible = await button.waitFor({ state: 'visible', timeout: Math.min(timeout, remaining()) })
    .then(() => true)
    .catch(() => false)
  if (visible) await button.click()
}

async function openOffice(kind, path) {
  const name = basename(path)
  const marker = fixtureMarkers[kind]
  const requestedAt = Date.now()
  const responsePromise = page.waitForResponse((response) => {
    try {
      const url = new URL(response.url())
      return url.pathname === '/api/agent-pi/files/content' && url.searchParams.get('path') === path
    } catch {
      return false
    }
  }, { timeout: remaining() })
  const button = page.locator('.ap-files-dock .ap-tree-btn').filter({ hasText: name }).first()
  await button.waitFor({ state: 'visible', timeout: remaining() })
  await button.click()
  const response = await responsePromise
  const body = await response.json()
  const importedAt = Date.now()
  assert.equal(response.status(), 200, `${name} content endpoint failed`)
  assert.equal(body.engine, 'univer-office', `${name} fell back instead of using the official Office Gateway: ${body.hint || ''}`)
  assert.ok(body.viewerUrl, `${name} did not return a Viewer URL`)
  assert.ok(body.univerFile, `${name} did not return its imported sidecar path`)

  const gatewayOrigin = new URL(body.viewerUrl).origin
  const fileKey = Buffer.from(body.univerFile, 'utf8').toString('base64url')
  const worktreesResponse = await fetch(`${gatewayOrigin}/uf/${fileKey}/worktrees`)
  assert.equal(worktreesResponse.status, 200, `${name} worktree listing failed`)
  const worktreesBody = await worktreesResponse.json()
  const worktree = (worktreesBody.worktrees || []).find((item) => item.status === 'draft')
  assert.ok(worktree?.worktreeId, `${name} import did not create a draft worktree`)
  const unitsResponse = await fetch(`${gatewayOrigin}/uf/${fileKey}/worktrees/${encodeURIComponent(worktree.worktreeId)}/units`)
  assert.equal(unitsResponse.status, 200, `${name} worktree Unit listing failed`)
  const unitsBody = await unitsResponse.json()
  const units = Array.isArray(unitsBody.units) ? unitsBody.units : []
  assert.ok(units.length > 0, `${name} import created no Office Unit content`)
  const expectedUnitType = { xlsx: 2, docx: 1, pptx: 3 }[kind]
  const importedUnit = units.find((unit) => unit.type === expectedUnitType)
  assert.ok(importedUnit, `${name} imported no Unit of expected type ${expectedUnitType}`)
  assert.ok(Number(importedUnit.headRev) >= 1, `${name} Unit has no committed content revision`)

  const dialog = page.getByRole('dialog', { name })
  await dialog.waitFor({ state: 'visible', timeout: remaining() })
  const iframe = dialog.locator('iframe.ap-univer-frame')
  await iframe.waitFor({ state: 'visible', timeout: remaining() })
  // Keep the locator live while React replaces/navigates the iframe during
  // startup. Holding a Frame object here races that replacement and detaches.
  const frame = iframe.contentFrame()
  await frame.locator('#app').waitFor({ state: 'attached', timeout: remaining() })
  await frame.locator('#app > *').first().waitFor({ state: 'attached', timeout: remaining() })
  await page.waitForTimeout(1_000)
  const renderedAt = Date.now()
  const bodyText = String(await frame.locator('body').innerText()).replace(/\s+/g, ' ').trim()
  const markerInInputs = await frame.locator('input').evaluateAll(
    (inputs, value) => inputs.some((input) => String(input.value || '').includes(value)),
    marker,
  )
  const viewer = {
    titlePresent: Boolean(String(await frame.locator('title').textContent() || '').trim()),
    appChildren: await frame.locator('#app > *').count(),
    canvasCount: await frame.locator('canvas').count(),
    bodyText: redactSecrets(bodyText.slice(0, 300)),
    bodySize: await frame.locator('body').evaluate((body) => ({ width: body.scrollWidth, height: body.scrollHeight })),
  }
  const markerInDom = bodyText.includes(marker) || markerInInputs
  assert.ok(viewer.titlePresent, `${name} Viewer has no page title`)
  assert.ok(viewer.appChildren > 0, `${name} Univer application stayed empty`)
  assert.ok(viewer.canvasCount > 0 || viewer.bodyText.length > 0, `${name} Univer application did not render content`)

  const screenshot = join(artifactDir, `${results.length + 1}-${kind}.png`)
  await page.screenshot({ path: screenshot, fullPage: true })
  const renderedMarker = inspectRenderedMarker(screenshot, marker)
  const gatewayMarkerSource = markerEvidence.get(marker) || null
  assert.ok(
    markerInDom || Boolean(gatewayMarkerSource) || renderedMarker.markerSeen,
    `${name} imported a Unit but its synthetic marker was not proven in the rendered Viewer or Gateway snapshot`,
  )
  const result = {
    kind,
    name,
    contentRequestMs: importedAt - requestedAt,
    viewerReadyMs: renderedAt - requestedAt,
    viewerUrl: safeUrl(body.viewerUrl),
    sidecarCreated: typeof body.univerFile === 'string' && existsSync(body.univerFile),
    importedUnits: units.map((unit) => ({
      type: unit.type,
      name: String(unit.name || '').slice(0, 120),
      revision: unit.headRev,
    })),
    markerSeenInGatewaySnapshot: Boolean(gatewayMarkerSource),
    gatewayMarkerSource,
    markerVisibleInViewerDom: markerInDom,
    renderedMarker,
    viewer,
    screenshot,
  }
  results.push(result)
  await dialog.locator('.ap-doc-actions button[title="关闭"]').click()
  await dialog.waitFor({ state: 'detached', timeout: remaining() })
  return result
}

try {
  electronApp = await electron.launch({
    executablePath: electronExe,
    args: [`--user-data-dir=${userDataDir}`, desktopDir],
    cwd: root,
    env: {
      ...process.env,
      AGENT_PI_DSH_FORCE_COLD_START: '1',
      DSH_CHECKOUT: join(root, 'vendor', 'deepseek-harness'),
      DSH_HOME: dshHome,
      // The checkout is a test fixture here. Skip repository hook installation
      // when the DSH CLI performs its dependency-status check on first launch.
      CI: 'true',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: remaining(),
  })
  const child = electronApp.process()
  const rememberOutput = (chunk) => {
    processOutput = (processOutput + String(chunk)).slice(-64_000)
  }
  child.stdout?.on('data', rememberOutput)
  child.stderr?.on('data', rememberOutput)

  page = await electronApp.firstWindow({ timeout: remaining() })
  page.on('pageerror', (error) => pageErrors.push(redactSecrets(error?.stack || error)))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(redactSecrets(message.text()))
    if (message.type() === 'warning') consoleWarnings.push(redactSecrets(message.text()))
  })
  page.on('response', async (response) => {
    try {
      const url = new URL(response.url())
      if (!url.pathname.includes('/universer-api/')) return
      const length = Number(response.headers()['content-length'] || 0)
      if (length > 5_000_000) return
      const text = await response.text()
      for (const marker of Object.values(fixtureMarkers)) {
        if (text.includes(marker)) markerEvidence.set(marker, safeUrl(response.url()))
      }
    } catch {}
  })
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    requestFailures.push({ url: safeUrl(request.url()), error: request.failure()?.errorText || 'unknown' })
  })
  page.on('request', (request) => {
    try {
      const url = new URL(request.url())
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') externalRequests.push(safeUrl(url.toString()))
      }
    } catch {}
  })

  await page.waitForURL(
    (url) => url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'),
    { timeout: remaining() },
  )
  await page.locator('[data-slot="sidebar"]').waitFor({ state: 'visible', timeout: remaining() })
  assert.ok((await page.title()).trim(), 'desktop page has no title')
  assert.notEqual((await page.locator('body').innerText()).trim(), '', 'desktop page is blank')
  assert.equal(await page.getByText(/Failed to load plugins/i).count(), 0, 'DSH plugin failure overlay is visible')
  await page.locator('style[data-plugin="dsh-univer-office"]').first().waitFor({ state: 'attached', timeout: remaining() })
  await clickOptional(/继续|Continue/i)
  await clickOptional(/稍后配置|Configure later/i)

  const chooser = page.getByRole('textbox', { name: /选择工作区|Choose workspace/i }).first()
  await chooser.waitFor({ state: 'visible', timeout: remaining() })
  await chooser.click()
  const picker = page.getByRole('dialog', { name: /选择工作区目录|Select Workspace Directory/i })
  await picker.waitFor({ state: 'visible', timeout: remaining() })
  await picker.getByRole('button', { name: /编辑路径|Edit path/i }).click()
  const pathInput = picker.getByRole('textbox', { name: /编辑路径|Edit path/i })
  await pathInput.fill(workspace)
  await pathInput.press('Enter')
  await picker.getByRole('button', { name: /打开|Open/i, exact: true }).click()
  await page.locator('[data-composer-input][contenteditable="true"]').waitFor({ state: 'visible', timeout: remaining() })
  await page.locator('.ap-files-dock').waitFor({ state: 'visible', timeout: remaining() })

  const initialStatus = await page.evaluate(async () => {
    const response = await fetch('/univer-api/status')
    return { httpStatus: response.status, body: await response.json() }
  })
  assert.equal(initialStatus.httpStatus, 200, 'Office status route failed')
  const gatewayStartedAt = Date.now()
  const startResult = await page.evaluate(async () => {
    const response = await fetch('/univer-api/gateway/start', { method: 'POST' })
    return { httpStatus: response.status, body: await response.json() }
  })
  const gatewayReadyMs = Date.now() - gatewayStartedAt
  assert.equal(startResult.httpStatus, 200, 'Gateway start route failed')
  assert.equal(startResult.body?.ok, true, `Gateway did not start: ${startResult.body?.reason || 'unknown error'}`)
  assert.match(startResult.body?.gateway || '', /^http:\/\/127\.0\.0\.1:\d+$/)
  const runningStatus = await page.evaluate(async () => {
    const response = await fetch('/univer-api/status')
    return { httpStatus: response.status, body: await response.json() }
  })
  assert.equal(runningStatus.body?.gateway?.phase, 'running', 'Gateway did not remain running')

  await openOffice('xlsx', fixturePaths.xlsx)
  await openOffice('docx', fixturePaths.docx)
  await openOffice('pptx', fixturePaths.pptx)

  assert.deepEqual(pageErrors, [], `page errors: ${JSON.stringify(pageErrors)}`)
  assert.deepEqual(requestFailures, [], `request failures: ${JSON.stringify(requestFailures)}`)
  assert.deepEqual(externalRequests, [], `Office preview attempted external requests: ${JSON.stringify(externalRequests)}`)

  const report = {
    status: 'ok',
    elapsedMs: Date.now() - startedAt,
    desktop: { title: await page.title(), url: safeUrl(page.url()) },
    checks: [
      'fresh-isolated-dsh-home',
      'office-profile-active',
      'office-client-style-active',
      'no-plugin-failure-overlay',
      'workspace-selected-through-official-picker',
      'gateway-started-and-remained-running',
      'xlsx-official-preview',
      'docx-official-preview',
      'pptx-official-preview',
      'no-page-errors',
      'no-failed-requests',
      'no-external-http-requests',
    ],
    gateway: {
      initial: initialStatus.body?.gateway,
      start: { ...startResult.body, gateway: safeUrl(startResult.body?.gateway) },
      readyMs: gatewayReadyMs,
      running: runningStatus.body?.gateway,
      unitContent: runningStatus.body?.unitContent,
    },
    previews: results,
    consoleErrors,
    consoleWarnings,
  }
  writeFileSync(join(artifactDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(JSON.stringify(report))
} catch (error) {
  if (page) await page.screenshot({ path: join(artifactDir, 'failure.png'), fullPage: true }).catch(() => {})
  const launchLog = join(userDataDir, 'dsh-launch.log')
  const diagnostics = redactSecrets([
    String(error?.stack || error),
    '',
    `partial results: ${JSON.stringify(results)}`,
    `page errors: ${JSON.stringify(pageErrors)}`,
    `console errors: ${JSON.stringify(consoleErrors)}`,
    `request failures: ${JSON.stringify(requestFailures)}`,
    `external requests: ${JSON.stringify(externalRequests)}`,
    '',
    'Electron output:',
    processOutput || '(empty)',
    '',
    'DSH launch log:',
    existsSync(launchLog) ? readFileSync(launchLog, 'utf8') : '(missing)',
  ].join('\n'))
  writeFileSync(join(artifactDir, 'failure.log'), diagnostics, 'utf8')
  throw new Error(diagnostics)
} finally {
  if (electronApp) {
    await electronApp.evaluate(({ app }) => {
      app.isQuitting = true
      app.quit()
    }).catch(() => {})
    await electronApp.close().catch(() => {})
  }
  rmSync(scratch, { recursive: true, force: true })
}
