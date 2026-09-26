import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AP_I18N, AP_LANGUAGE_DEFINITIONS } from '../src/client/locales/catalog.js'
import { WORKBENCH_FIELDS } from '../src/client/locales/workbench-fields.js'
import { auditLocales } from '../../../scripts/audit-product-locales.mjs'

test('every supported language has the workflow editing controls and matching placeholders', () => {
  const core = [...Object.keys(WORKBENCH_FIELDS.es), 'mm.newWorkflow', 'mm.dependencies', 'mm.noSetupStage', 'mm.dependencyError', 'mm.removeDependency']
  for (const { id } of AP_LANGUAGE_DEFINITIONS) {
    for (const key of core) assert.ok(AP_I18N[id][key], `${id}: missing editor translation ${key}`)
  }
  for (const [locale, row] of Object.entries(auditLocales().locales)) assert.deepEqual(row.placeholderErrors, [], locale)
})

test('workbench and workspace terms remain distinct', () => {
  for (const dictionary of Object.values(AP_I18N)) assert.notEqual(dictionary['workbench.title'], dictionary['files.workspace'])
})
