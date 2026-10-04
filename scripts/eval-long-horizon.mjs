import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cases = [
  'packages/professional-tasks/tests/long-horizon.test.ts',
  'bundles/task-guide/tests/plugin.test.ts',
  'bundles/tender-host/tests/long-task-host.test.ts',
  'bundles/tender-host/tests/long-task-runtime.test.ts',
  'bundles/tender-host/tests/knowledge-lifecycle.test.ts',
  'bundles/tender-host/tests/kb-transfer.test.ts',
  'bundles/tender-host/tests/human-skill-request.test.ts',
  'bundles/tender-host/tests/skill-http.test.ts',
  'bundles/tender-host/tests/skill-lifecycle.test.ts',
  'bundles/tender-host/tests/output-content-version.test.ts',
  'bundles/tender-web/tests/session-monitor.test.ts',
  'bundles/tender-web/tests/skill-lifecycle.test.mjs',
]
const result = spawnSync(process.execPath, ['--experimental-transform-types', '--import', './vendor/deepseek-harness/node_modules/tsx/dist/loader.mjs', '--test', '--test-reporter=tap', '--test-concurrency=4', ...cases], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
})
const log = result.stdout + result.stderr
const value = name => Number(new RegExp('^# ' + name + ' (\\d+)$', 'm').exec(log)?.[1] || 0)
const report = { schemaVersion: 1, version: '3.7.9', evaluatedAt: new Date().toISOString(), kind: 'deterministic-system-regression',
  cases, tests: value('tests'), passed: value('pass'), failed: value('fail'), skipped: value('skipped'), durationMs: Number(/^# duration_ms (\d+(?:\.\d+)?)$/m.exec(log)?.[1] || 0),
  gate: result.status === 0 && value('tests') > 0 && value('fail') === 0 && value('skipped') === 0 ? 'passed' : 'failed',
  covered: ['durable-constraints-and-revocation', 'current-byte-and-input-verification', 'native-dispatch-and-crash-receipts', 'parent-child-dedup-and-stale-results', 'unknown-side-effects', 'actual-usage-and-no-progress-budgets', 'immutable-knowledge-and-circular-evidence', 'human-case-skill-validation-and-publication', 'renderer-read-only-recovery'],
  limitations: ['No paid model executions or autonomous professional-task benchmark.', 'Tests measure deterministic invariants, not semantic correctness on arbitrary real projects.', 'Skill validation proves only equality with the human-selected fixed case output.'],
}
const output = join(root, 'output', 'long-horizon-379')
mkdirSync(output, { recursive: true })
writeFileSync(join(output, 'evaluation.tap'), log)
writeFileSync(join(output, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
process.exitCode = report.gate === 'passed' ? 0 : 1
