import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputFontRoot = resolve(
  toolRoot,
  '../../bundles/tender-web/lib/cad-viewer/resources/fonts'
)

test('text fixture exercises both TEXT and MTEXT entities', async () => {
  const fixture = await readFile(
    resolve(toolRoot, 'fixtures/text-entities-ac1015.dxf'),
    'utf8'
  )

  assert.match(fixture, /\r?\nTEXT\r?\n/)
  assert.match(fixture, /\r?\nMTEXT\r?\n/)
  assert.match(fixture, /AGENT PI TEXT/)
  assert.match(fixture, /MTEXT \\U\+4E2D\\U\+6587/)
})

test('built viewer ships a complete local font repository', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(outputFontRoot, 'fonts.json'), 'utf8')
  )

  assert.ok(Array.isArray(manifest) && manifest.length > 0)
  assert.ok(manifest[0].name.includes('txt'))
  assert.ok(manifest[0].name.includes('simsun'))
  assert.ok(manifest[0].name.includes('Source Han Sans CN'))
  for (const font of manifest) {
    assert.equal(typeof font.file, 'string')
    assert.ok(font.file.length > 0)
    await access(resolve(outputFontRoot, font.file))
  }

  const fallbackFont = await readFile(
    resolve(outputFontRoot, 'SourceHanSansCN-Regular.otf')
  )
  assert.equal(
    createHash('sha256').update(fallbackFont).digest('hex'),
    'e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4'
  )
  await access(resolve(outputFontRoot, 'OFL-1.1.txt'))
})

test('viewer commits its singleton only after fallback fonts and plugins load', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')
  const loadFontIndex = source.indexOf('await nextManager.loadDefaultFonts')
  const loadPluginIndex = source.indexOf('await nextManager.pluginManager.loadPlugin')
  const commitIndex = source.indexOf('manager = nextManager')

  assert.ok(loadFontIndex >= 0)
  assert.ok(loadPluginIndex > loadFontIndex)
  assert.ok(commitIndex > loadPluginIndex)
  assert.match(source, /catch \(error\) \{[\s\S]*await nextManager\.destroy\(\)/)
  assert.match(source, /await docManager\.closeDocument\(\)\s+hasOpenedDocument = false/)
})

test('viewer reports missing drawing fonts and lets the user import licensed local replacements', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')
  const html = await readFile(resolve(toolRoot, 'index.html'), 'utf8')

  assert.match(html, /id="font-button"/)
  assert.match(html, /id="font-input"[^>]*type="file"[^>]*accept="\.shx,\.ttf,\.otf,\.woff"[^>]*multiple/s)
  assert.match(source, /docManager\.curView\?\.missedData\?\.fonts/)
  assert.match(source, /await view\.waitUntilIdle\(\)/)
  assert.match(source, /blockTable\.modelSpace/)
  assert.match(source, /block\.isPaperSapce/)
  assert.match(source, /blockReference\.blockTableRecord/)
  assert.match(source, /AcApFontUtil\.cacheFont\(/)
  assert.match(source, /name === 'hztxt'\) return 'gbk'/)
  assert.match(source, /name === 'gbcbig'\) return 'gb2312'/)
  assert.match(source, /await loadAndOpenDrawing\(source\.name, source\.load\)/)
  assert.doesNotMatch(source, /currentDrawing:\s*\{ name: string; content: ArrayBuffer \}/)
  assert.match(source, /缺少字体/)
})

test('viewer enables the complete official toolbar in review mode', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')
  const officialToolbar = await readFile(
    resolve(
      toolRoot,
      'node_modules/@mlightcad/cad-simple-ui-plugin/lib/config/defaultToolbarItems.js'
    ),
    'utf8'
  )

  assert.match(source, /items: 'default'/)
  assert.match(source, /collapsible: true/)
  assert.match(source, /mode: AcEdOpenMode\.Review/)
  for (const id of [
    'select',
    'pan',
    'zoom-extent',
    'zoom-window',
    'layer',
    'switch-bg',
    'measure',
    'annotation',
    'export',
    'toolbar-placement',
    'theme',
    'locale'
  ]) {
    assert.match(officialToolbar, new RegExp(`id: ['"]${id}['"]`))
  }
  assert.match(officialToolbar, /createLayoutToolbarItem\(\)/)
})

test('viewer status exposes layout and every missing-resource count', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')

  assert.match(source, /layoutManager\s+\.countLayouts\(docManager\.curDocument\.database\)/)
  assert.match(source, /missed\?\.images\.values\(\)/)
  assert.match(source, /missed\?\.xrefs/)
  assert.match(source, /布局 \$\{layoutCount\}/)
  assert.match(source, /`字体 \$\{missingFonts\.length\}`/)
  assert.match(source, /`图像 \$\{missingImages\.length\}`/)
  assert.match(source, /`外部参照 \$\{missingXrefs\.length\}`/)
  assert.match(source, /缺失资源/)
})

test('viewer opens large drawings through the local worker without the 58 second timeout', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')

  assert.match(source, /function parserTimeoutFor\(contentBytes: number\)/)
  assert.match(source, /Math\.max\(MIN_PARSER_TIMEOUT_MS, sizeInMiB \* PARSER_TIMEOUT_PER_MIB_MS\)/)
  assert.match(source, /timeout: parserTimeoutFor\(content\.byteLength\)/)
  assert.match(source, /minimumChunkSize: 1000/)
  assert.match(source, /progressiveRendering: false/)
  assert.match(source, /openViewMode: AcApOpenViewMode\.Extents/)
  assert.doesNotMatch(source, /content\.slice\(0\)/)
  assert.match(source, /await Promise\.all\(\[load\(\), ensureViewer\(\)\]\)/)
})

test('main-content fit is explicit, conservative, and safe in paper space', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')
  const html = await readFile(resolve(toolRoot, 'index.html'), 'utf8')

  assert.match(html, /id="main-fit-button"[^>]*disabled/)
  assert.match(source, /chooseRobustFitBounds\(/)
  assert.match(source, /mainFitButton\.addEventListener\('click'/)
  assert.match(source, /openViewMode: AcApOpenViewMode\.Extents/)
  assert.match(source, /view\.activeLayoutBtrId !== blockTable\.modelSpace\.objectId/)
  assert.match(source, /view\.zoomTo\(\s*new AcGeBox2d\(/)
  assert.match(source, /主体取景仅适用于模型空间/)
  assert.match(source, /未发现可安全忽略的远端小实体，当前视图保持不变/)
  assert.match(source, /if \(result\.source === 'full'\)[\s\S]*return[\s\S]*view\.zoomTo\(/)
})

test('drawing preparation acquires one transaction before parallel loading', async () => {
  const source = await readFile(resolve(toolRoot, 'src/main.ts'), 'utf8')

  assert.match(source, /let openTransactionActive = false/)
  assert.match(
    source,
    /async function loadAndOpenDrawing[\s\S]*if \(openTransactionActive\)[\s\S]*openTransactionActive = true[\s\S]*setBusy\(true,[\s\S]*await Promise\.all\(\[load\(\), ensureViewer\(\)\]\)/
  )
  assert.match(source, /finally \{\s*openTransactionActive = false\s*setBusy\(false\)\s*\}/)
  assert.equal(
    source.match(/await Promise\.all\(\[load\(\), ensureViewer\(\)\]\)/g)?.length,
    1
  )
})
