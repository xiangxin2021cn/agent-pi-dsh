import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { cadViewerConsoleDiagnostic, rendererGoneDiagnostic } from '../startup-diagnostics.mjs'

const appUrl = 'http://127.0.0.1:3080/?token=app-credential'
const cadError = {
  level: 'error', lineNumber: 20,
  sourceId: 'http://127.0.0.1:3080/api/agent-pi/cad-viewer/host-decoder/assets/index.js?token=source-credential',
  message: "Error occurred in conversion stage 'PARSE': worker_timeout: Worker operation timed out",
}

test('desktop diagnostics only accept same-origin CAD error messages with known diagnostic prefixes', () => {
  for (const details of [
    { ...cadError, level: 'info' }, { ...cadError, level: 'warning' },
    { ...cadError, sourceId: cadError.sourceId.replace('127.0.0.1:3080', 'example.com') },
    { ...cadError, sourceId: 'http://127.0.0.1:3080/conversation.js' },
    { ...cadError, sourceId: 'not a URL' },
    { ...cadError, message: 'Document body: a private project paragraph' },
  ]) assert.equal(cadViewerConsoleDiagnostic(details, appUrl), null)
  const result = JSON.parse(cadViewerConsoleDiagnostic(cadError, appUrl).slice('[cad-renderer] '.length))
  assert.equal(result.code, 'worker_timeout')
  assert.equal(result.stage, 'PARSE')
  assert.equal(result.source, '/api/agent-pi/cad-viewer/host-decoder/assets/index.js')
  assert.doesNotMatch(JSON.stringify(result), /credential|token=/)
})

test('CAD diagnostic messages redact credentials, skip document continuation lines and remain bounded', () => {
  assert.equal(cadViewerConsoleDiagnostic({ ...cadError, message: '[mlightcad-poc] failed Authorization: Bearer private-value' }, appUrl), null)
  const line = cadViewerConsoleDiagnostic({ ...cadError, message: '[mlightcad-poc] failed /file?token=private-value\nDocument body: PRIVATE' }, appUrl)
  assert.match(line, /redacted/)
  assert.doesNotMatch(line, /private-value|Document body|PRIVATE/)
  const bounded = JSON.parse(cadViewerConsoleDiagnostic({ ...cadError, message: '[mlightcad-poc] ' + 'x'.repeat(4000) }, appUrl).slice('[cad-renderer] '.length))
  assert.equal(bounded.message.length, 1500)
  assert.equal(bounded.code, null)
  assert.equal(bounded.stage, null)
})

test('renderer termination preserves the original reason and signed code with its unsigned hex value', () => {
  const line = rendererGoneDiagnostic({ reason: 'crashed', exitCode: -36861 }, { pid: 123, version: '3.8.7', electron: '45.2.0', chrome: '154.0' })
  assert.match(line, /reason=crashed exit=-36861 hex=0xffff7003 pid=123 version=3\.8\.7 electron=45\.2\.0 chrome=154\.0/)
  assert.doesNotMatch(line, /oom|out.of.memory/i)
})

test('desktop guards consume the Electron 45 details object and retain the renderer pid across a crash', () => {
  const source = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8')
  const guards = source.slice(source.indexOf('function attachRendererGuards(win)'), source.indexOf("process.on('uncaughtException'"))
  const contents = new EventEmitter(), logs = []
  let pid = 10
  contents.getOSProcessId = () => pid
  const win = { webContents: contents, isDestroyed: () => false, loadURL: async () => {} }
  vm.runInNewContext(guards + '\nattachRendererGuards(win)', {
    win, appUrl, logLine: line => logs.push(line), setTimeout() {},
    app: { isQuitting: false, getVersion: () => '3.8.7' }, process: { versions: { electron: '45.2.0', chrome: '154.0' } },
    cadViewerConsoleDiagnostic, rendererGoneDiagnostic,
  })
  contents.emit('console-message', { ...cadError, level: 'info' }, 3, 'deprecated fields must not control logging')
  assert.equal(logs.length, 0)
  contents.emit('console-message', cadError, 0, 'deprecated fields must not control logging')
  assert.match(logs[0], /^\[cad-renderer\]/)
  pid = 20
  contents.emit('dom-ready')
  pid = 0
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: -36861 })
  assert.match(logs[1], /hex=0xffff7003 pid=20/)
  assert.doesNotMatch(logs.join('\n'), /app-credential|source-credential|deprecated fields/)
})
