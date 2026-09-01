import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '../src/client/index.js'), 'utf8')
const styles = readFileSync(join(here, '../src/client/styles.js'), 'utf8')

test('desktop language catalog exposes the common ten-language set', () => {
  for (const id of ['zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar']) {
    assert.match(source, new RegExp(`\\{ id: '${id}', label:`))
  }
  assert.match(source, /runtime\.locale\.addLanguage/)
  assert.match(source, /agent-pi:language:v1/)
  assert.match(source, /language\.rtl \? 'rtl' : 'ltr'/)
})

test('language selector is placed in the top brand row instead of staying in the footer stack', () => {
  assert.match(source, /usePlaced\('ap-mount-lang'\)/)
  assert.match(source, /parts\.logoRow\.insertBefore\(lang, logoToggle \|\| null\)/)
  assert.match(source, /h\('select', \{/)
  assert.match(styles, /\.ap-mount\.ap-mount-lang/)
  assert.match(styles, /\[data-sidebar-collapsed\] #ap-mount-lang\{display:none!important\}/)
})
