import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AP_I18N } from '../bundles/tender-web/src/client/locales/catalog.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const reference = AP_I18N.en
const placeholders = value => [...String(value).matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(x => x[1]).sort()
export function auditLocales() {
  const locales = Object.fromEntries(Object.entries(AP_I18N).map(([locale, dictionary]) => [locale, {
    translatedKeys: Object.keys(dictionary).length,
    totalKeys: Object.keys(reference).length,
    missing: Object.keys(reference).filter(key => !Object.hasOwn(dictionary, key)),
    placeholderErrors: Object.keys(dictionary).filter(key => Object.hasOwn(reference, key)
      && JSON.stringify(placeholders(dictionary[key])) !== JSON.stringify(placeholders(reference[key]))),
  }]))
  const candidates = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'locales') continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name.endsWith('.js')) {
        const lines = readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line, i) => /[\u3400-\u9fff]/u.test(line) ? [i + 1] : [])
        if (lines.length) candidates.push({ file: relative(root, path).replaceAll('\\', '/'), lines })
      }
    }
  }
  visit(join(root, 'bundles/tender-web/src/client'))
  return { locales, hardcodedTextReviewCandidates: candidates }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = auditLocales()
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.locales).map(([locale, row]) => [locale, {
    translated: row.translatedKeys, total: row.totalKeys, missing: row.missing.length, placeholderErrors: row.placeholderErrors.length,
  }])), null, 2))
  if (Object.values(report.locales).some(row => row.placeholderErrors.length)) process.exitCode = 1
}
