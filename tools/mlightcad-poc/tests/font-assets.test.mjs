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

  assert.match(fixture, /\nTEXT\n/)
  assert.match(fixture, /\nMTEXT\n/)
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
