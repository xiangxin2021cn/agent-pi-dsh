import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'vendor/dsh-super-injector')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (pkg.version !== '0.3.5') throw new Error('Review the product integration before updating Super Injector')

const clientPath = join(root, 'lib/client.js')
let client = readFileSync(clientPath, 'utf8').replaceAll('\r\n', '\n')
const clientMarker = '// Agent Pi provides React settings; the upstream DOM slot is incompatible.'
if (!client.includes(clientMarker)) {
  const entry = '\t\tfunction apply(ctx) {\n'
  if (!client.includes(entry)) throw new Error('Injector client entry changed')
  client = client.replace(entry, entry + `      ${clientMarker}\n      return;\n`)
  writeFileSync(clientPath, client)
}

const hostPath = join(root, 'lib/index.js')
let host = readFileSync(hostPath, 'utf8').replaceAll('\r\n', '\n')
const hostMarker = '// Agent Pi: preserve the host fatal-error diagnostics and restart policy.'
if (!host.includes(hostMarker)) {
  const start = host.indexOf('\ttry {\n\t\tconst SHIELD = Symbol.for("dsh.super-injector.rejection-shield");')
  const end = host.indexOf('\t/** 日志轮转', start)
  if (start < 0 || end <= start || !host.slice(start, end).includes('process.on("unhandledRejection", state.handler)')) {
    throw new Error('Injector global rejection handler changed')
  }
  host = host.slice(0, start) + '\t' + hostMarker + '\n\n' + host.slice(end)
  writeFileSync(hostPath, host)
}
// Embedded PTC image context must use the official V4 producer source.
const legacyPtcSource = /kind: "plugin",\n\s*plugin: "tools-ptc"/g
if (legacyPtcSource.test(host)) {
  host = host.replace(legacyPtcSource, 'kind: "ptc-mode"')
  writeFileSync(hostPath, host)
}
console.log('Super Injector 0.3.5 product integration applied')
