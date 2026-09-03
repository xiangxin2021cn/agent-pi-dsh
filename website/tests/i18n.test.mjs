import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const website = join(import.meta.dirname, '..')
const html = readFileSync(join(website, 'index.html'), 'utf8')
const i18nSource = readFileSync(join(website, 'assets', 'js', 'i18n.js'), 'utf8')
const mainSource = readFileSync(join(website, 'assets', 'js', 'main.js'), 'utf8')

function loadI18n(browserLanguages = ['en-US']) {
  const context = {
    window: {},
    navigator: { languages: browserLanguages, language: browserLanguages[0] },
    document: {
      title: '',
      querySelectorAll: () => [],
      querySelector: () => null,
    },
  }
  vm.runInNewContext(i18nSource, context, { filename: 'i18n.js' })
  return context.window.AgentPiI18n
}

test('homepage offers the ten requested locales', () => {
  const i18n = loadI18n()
  const expected = ['zh-CN', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ar', 'ru']
  assert.deepEqual(Array.from(i18n.locales), expected)
  for (const locale of expected) {
    assert.match(html, new RegExp(`<option value="${locale.replace('-', '\\-')}">`))
  }
  assert.ok(i18n.translatedPhraseCount >= 50, `expected broad homepage coverage, got ${i18n.translatedPhraseCount}`)
})

test('first visit follows browser language and stored locale wins', () => {
  const i18n = loadI18n(['fr-CA', 'en-US'])
  assert.equal(i18n.initialLocale(null), 'fr')
  assert.equal(i18n.initialLocale('ja'), 'ja')
  assert.equal(i18n.initialLocale('zh'), 'zh-CN')
  assert.equal(i18n.initialLocale('unsupported'), 'fr')
  assert.match(mainSource, /localStorage\.setItem\("ap-lang", locale\)/)
  assert.match(mainSource, /locale === "ar" \? "rtl" : "ltr"/)
})

test('homepage loads translations before the language controller', () => {
  const i18nIndex = html.indexOf('assets/js/i18n.js')
  const mainIndex = html.indexOf('assets/js/main.js')
  assert.ok(i18nIndex > 0)
  assert.ok(mainIndex > i18nIndex)
  assert.match(html, /data-language-select/)
  assert.match(i18nSource, /querySelectorAll\('body \[data-lang="en"\]'\)/)
  assert.doesNotMatch(i18nSource, /querySelectorAll\('\[data-lang="en"\]'\)/)
})

test('public fallback downloads and kernel identity stay aligned with the existing latest release', () => {
  const expectedAssets = [
    'Agent-Pi-DSH-3.5.3-x64.exe',
    'Agent-Pi-DSH-3.5.3-x64.exe.sha256',
    'Agent-Pi-DSH-3.5.3-mac-arm64.dmg',
    'Agent-Pi-DSH-3.5.3-mac-arm64.zip',
    'Agent-Pi-DSH-3.5.3-linux-x86_64.AppImage',
    'Agent-Pi-DSH-3.5.3-linux-amd64.deb',
  ]
  for (const asset of expectedAssets) assert.ok(html.includes(asset), asset)
  assert.doesNotMatch(html, /releases\/download\/v3\.5\.2/)
  assert.match(html, /data-rel-version>v3\.5\.3</)
  assert.match(html, /data-kernel-version>dsh-v0\.1\.2-alpha\.3</)
})
