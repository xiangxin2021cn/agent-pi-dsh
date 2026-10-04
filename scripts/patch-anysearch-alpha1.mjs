import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dshRange = '0.0.1-rc.5 || >=0.1.0-rc.2 <=0.1.0-rc.8 || >=0.1.1-rc.1 <=0.1.1-rc.2 || >=0.1.2-alpha.2 <=0.1.2-rc.1 || 0.1.3-alpha.2 || >=0.1.5-alpha.1 <=0.1.5-rc.2 || >=0.1.6-alpha.1 <=0.1.6-alpha.2'
const dshPeers = ['credentials', 'system-prompt', 'tool-web', 'tools', 'web'].map(name => '@deepseek-ai/dsh-' + name)
// Git may materialize LF sources as CRLF on Windows; hash normalized source text.
const text = value => value.toString().replaceAll('\r\n', '\n')
const sha = value => createHash('sha256').update(text(value)).digest('hex')

export function patchAnySearchManifest(source) {
  const manifest = JSON.parse(source)
  if (manifest.name !== '@anysearch/anysearch-dsh' || manifest.version !== '0.1.6') throw new Error('Unreviewed AnySearch version; refusing compatibility adaptation')
  for (const name of dshPeers) {
    const range = manifest.peerDependencies?.[name]
    if (![dshRange, dshRange + ' || 0.2.1-alpha.1'].includes(range)) throw new Error('Unexpected AnySearch DSH peer: ' + name)
    manifest.peerDependencies[name] = dshRange + ' || 0.2.1-alpha.1'
  }
  const vendor = [
    [manifest.peerDependencies, '@deepseek-ai/cordis', '>=4.0.1-rc.1 <5', '4.0.5-alpha.1'],
    [manifest.dependencies, '@deepseek-ai/schemastery', '>=3.18.1-rc.1 <4', '3.18.5-alpha.1'],
  ]
  for (const [owner, name, original, reviewed] of vendor) {
    if (![original, original + ' || ' + reviewed].includes(owner?.[name])) throw new Error('Unexpected AnySearch vendor range: ' + name)
    owner[name] = original + ' || ' + reviewed
  }
  return JSON.stringify(manifest, null, 2) + '\n'
}

function replace(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('AnySearch 0.1.6 source layout changed; refusing a partial patch')
  return source.replace(before, after)
}

export function patchAnySearchClient(source) {
  source = replace(source, '    async search(request, signal) {\n', `    async search(request, signal) {
        if (typeof request.query !== 'string' || request.query.trim().length === 0)
            throw new AnySearchClientError('AnySearch query must be a non-empty string', { operation: 'search' });
        if (request.maxResults !== undefined && (!Number.isInteger(request.maxResults) || request.maxResults < 1 || request.maxResults > 10))
            throw new AnySearchClientError('AnySearch maxResults must be an integer from 1 to 10', { operation: 'search' });
        if (request.zone !== undefined && !['cn', 'intl'].includes(request.zone))
            throw new AnySearchClientError('AnySearch zone must be cn or intl', { operation: 'search' });
        if (request.format !== undefined && !['json', 'markdown'].includes(request.format))
            throw new AnySearchClientError('AnySearch format must be json or markdown', { operation: 'search' });
`)
  source = replace(source, '                query: request.query,', '                query: request.query,\n                format: request.format ?? \'markdown\',')
  source = replace(source, '    async extract(request, signal) {\n', `    async extract(request, signal) {
        if (typeof request.url !== 'string' || !isAbsoluteHTTPURL(request.url) || new URL(request.url).username || new URL(request.url).password)
            throw new AnySearchClientError('AnySearch extract requires a public HTTP(S) URL without credentials', { operation: 'extract' });
`)
  source = replace(source, '`AnySearch ${operation} request failed: ${String(error)}`, { operation, cause: error }', '`AnySearch ${operation} request failed`, { operation }')
  source = replace(source, '`AnySearch ${operation} returned invalid JSON: ${String(error)}`', '`AnySearch ${operation} returned invalid JSON`')
  source = replace(source, 'const diagnosticRequestId = optionalStringField(value, \'request_id\');', 'const diagnosticRequestId = safeRequestId(optionalStringField(value, \'request_id\'));')
  source = replace(source, 'const requestId = optionalStringRecordField(envelope, \'request_id\', \'request_id\');', 'const requestId = safeRequestId(optionalStringRecordField(envelope, \'request_id\', \'request_id\'));')
  source = replace(source, 'const retryAfter = response.headers.get(\'retry-after\') ?? undefined;', "const retryAfterValue = response.headers.get('retry-after');\n        const retryAfter = retryAfterValue && /^\\d{1,8}$/.test(retryAfterValue) ? retryAfterValue : undefined;")
  source = replace(source, '`AnySearch ${operation} credential resolution failed: ${String(error)}`, { operation, cause: error }', '`AnySearch ${operation} credential resolution failed`, { operation }')
  const start = source.indexOf('function upstreamError(')
  const end = source.indexOf('function aborted(', start)
  if (start < 0 || end < 0) throw new Error('AnySearch error boundary changed')
  source = source.slice(0, start) + `// Upstream error messages may contain generated passwords and API keys (HTTP 402).
function safeRequestId(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
}
function upstreamError(operation, _detail, httpStatus, authentication, requestId, retryAfter, errorCode) {
    const safeCodes = new Set(['extract_canceled', 'invalid_extract_url', 'extract_target_blocked', 'extract_content_too_large', 'extract_unsupported_content', 'extract_timeout']);
    const safeCode = safeCodes.has(errorCode) ? errorCode : undefined;
    const facts = [\`HTTP \${httpStatus}\`, \`auth \${authentication}\`, ...requestId === undefined ? [] : [\`request_id \${requestId}\`]];
    return new AnySearchClientError(\`AnySearch \${operation} failed (\${facts.join(', ')})\`, {
        operation, httpStatus, authentication,
        ...requestId === undefined ? {} : { requestId },
        ...retryAfter === undefined ? {} : { retryAfter },
        ...safeCode === undefined ? {} : { errorCode: safeCode },
    });
}
` + source.slice(end)
  // No response-parser cause is retained: a JSON parser can include response bytes.
  source = source.replaceAll('                cause: error,\n', '').replaceAll('            cause: error,\n', '')
  source = source.replaceAll('returned an invalid response: ${errorMessage(error)}', 'returned an invalid response')
  source = replace(source, 'function errorMessage(error) {\n    return error instanceof Error ? error.message : String(error);\n}\n', '')
  source = replace(source, 'MAX_CANONICAL_CONTENT_CHARS, MAX_UPSTREAM_ERROR_CHARS,', 'MAX_CANONICAL_CONTENT_CHARS,')
  return source
}

export function patchAnySearchSearch(source) {
  source = source.replaceAll('from 1 to 20', 'from 1 to 10')
  source = replace(source, 'args.maxResults > 20', 'args.maxResults > 10')
  source = replace(source, "    const tag = optionalNonBlank(args.tag, 'tag');", "    if (args.zone !== undefined && !['cn', 'intl'].includes(args.zone)) throw new Error('zone must be cn or intl');\n    if (args.format !== undefined && !['json', 'markdown'].includes(args.format)) throw new Error('format must be json or markdown');\n    const tag = optionalNonBlank(args.tag, 'tag');")
  source = replace(source, '            query,', "            query,\n            format: args.format ?? 'markdown',")
  return replace(source, "            language: { type: 'string', description: 'Provider language hint.' },", "            language: { type: 'string', description: 'Provider language hint.' },\n            format: { type: 'string', enum: ['json', 'markdown'], description: 'Result content format. Defaults to markdown.' },")
}

const patches = {
  'lib/index.js': ['57290abf4bd78cf25a24715f5f86aed0f921df2622a7f2599e12023f5f8368c8', source => replace(source, '    ctx.web.registerSearchProvider(new AnySearchProvider(client));', "    ctx.provide?.('agentPiAnySearch', { client, apiKeyRef: resolved.apiKeyEnv });\n    ctx.web.registerSearchProvider(new AnySearchProvider(client));")],
  'lib/provider.js': ['2c0bf8b79abbc7589abc19634e424c73ae1a407de09b6dda42c159a5d5d0c24d', source => replace(source, '{ maxResults: request.maxResults }', '{ maxResults: Math.min(10, request.maxResults) }')],
  'lib/client.js': ['d8e38aa310395a8a2f539e162cb05c4d26e0e67c83a525e74dc94582e8d770e9', patchAnySearchClient],
  'lib/tools/search.js': ['49a2a42efa3a36a442fa963d22e7f7b78a39ccc08602731a4cb0bf36bedcc4a8', patchAnySearchSearch],
  'lib/tools/batch.js': ['60b6b669e75fae2a4f6225102304ac70e908030cbcc03aaba04b24211adf191c', source => replace(source.replaceAll('from 1 to 20', 'from 1 to 10'), "        language: { type: 'string', description: 'Provider language hint.' },", "        language: { type: 'string', description: 'Provider language hint.' },\n        format: { type: 'string', enum: ['json', 'markdown'], description: 'Result content format. Defaults to markdown.' },")],
  'lib/types.d.ts': ['6d01fb2ec9452bf23db4531a0bffc27b5f4782176e025ad07dc28e3df20fad70', source => replace(source, '    maxResults?: number;', "    maxResults?: number;\n    format?: 'json' | 'markdown';")],
  'lib/tools/search.d.ts': ['df892ab12fc792db604ee92218a9a912de5f8dc884ae318025d44e0507ede513', source => replace(source, '    maxResults?: number;', "    maxResults?: number;\n    format?: 'json' | 'markdown';")],
  'lib/tools/batch.d.ts': ['6ca06842bef295146970ff9e97fce412f5ff62fdb1b30997a1c9d252f131e998', source => replace(source, '    maxResults?: number;', "    maxResults?: number;\n    format?: 'json' | 'markdown';")],
}
const adaptedHashes = {
  'lib/index.js': 'fa10c9a638a679f026f0cce91b4f3462a6882877ccf4326aa9cd43b35d4ec9cf',
  'lib/provider.js': 'd208b5864e403695bab918b65a7fc163a247f795317dfbf596fed15ea26688f8',
  'lib/client.js': 'ff7e9149995a77f5ccd44d00ba2ecdbe9df9ee3e40c7e288212027e778e2b510',
  'lib/tools/search.js': 'd504298e1d5ec1c0ec03e2ad3dd51e29b806b70507ed4858a1d4eceb9b4557c3',
  'lib/tools/batch.js': '04a8a28c2b7813866be0ee86b3dc2d9910c1b694c7a6e7a1629770f5a59c9d5f',
  'lib/types.d.ts': '5273c5ffa0e4bfe8fff1065db756a3e7d2b109a31f55e2b792a73b3b64b57da9',
  'lib/tools/search.d.ts': '984428429a37daa557ebd4ff494cd3cbc6728c4705f418924b979302c0a62db9',
  'lib/tools/batch.d.ts': '64f3171e2a311c00dbe0a6c34f314f55823d81a4a287920b113923683a538139',
}
const sourceManifestSha256 = '9724bc309f31497c89742fb1194fdae9e0751d646469e53245832f696bb89364'
const adaptedManifestSha256 = '5a9376ae5ade5d430fc169e0620b90cf8620fec098ff90faf94717eb7059c0c2'

export function verifyAnySearchDirectory(directory) {
  const source = text(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (patchAnySearchManifest(source) !== source || sha(source) !== adaptedManifestSha256) throw new Error('AnySearch manifest compatibility adaptation missing or changed')
  const receipt = JSON.parse(readFileSync(join(directory, 'AGENT-PI-ADAPTATION.json'), 'utf8'))
  if (receipt.sourceManifestSha256 !== sourceManifestSha256 || receipt.adaptedManifestSha256 !== adaptedManifestSha256
    || receipt.version !== '0.1.6' || receipt.dsh !== '0.2.1-alpha.1' || receipt.cordis !== '4.0.5-alpha.1' || receipt.schemastery !== '3.18.5-alpha.1'
    || receipt.license !== 'MIT' || receipt.upstream !== 'https://github.com/anysearch-team/anysearch-dsh'
    || Object.keys(receipt.files || {}).length !== Object.keys(patches).length) throw new Error('AnySearch adaptation receipt invalid')
  for (const [path, [originalSha256]] of Object.entries(patches)) {
    if (sha(readFileSync(join(directory, path))) !== adaptedHashes[path]
      || receipt.files[path]?.originalSha256 !== originalSha256 || receipt.files[path]?.adaptedSha256 !== adaptedHashes[path]) throw new Error('AnySearch adapted source hash mismatch: ' + path)
  }
  return receipt
}

export function patchAnySearchDirectory(directory) {
  const manifestPath = join(directory, 'package.json')
  const manifest = patchAnySearchManifest(readFileSync(manifestPath, 'utf8'))
  if (sha(manifest) !== adaptedManifestSha256) throw new Error('Unreviewed AnySearch manifest; refusing a partial adaptation')
  const receiptPath = join(directory, 'AGENT-PI-ADAPTATION.json')
  const writes = [[manifestPath, manifest]]
  const files = {}
  for (const [path, [originalSha256, patch]] of Object.entries(patches)) {
    const target = join(directory, path)
    const before = text(readFileSync(target, 'utf8'))
    const hash = sha(before)
    const after = hash === originalSha256 ? patch(before)
      : adaptedHashes[path] === hash ? before : undefined
    if (after === undefined) throw new Error('Unreviewed AnySearch source: ' + path)
    if (sha(after) !== adaptedHashes[path]) throw new Error('AnySearch adaptation hash mismatch: ' + path)
    writes.push([target, after])
    files[path] = { originalSha256, adaptedSha256: sha(after) }
  }
  for (const [path, value] of writes) writeFileSync(path, value)
  writeFileSync(receiptPath, JSON.stringify({ upstream: 'https://github.com/anysearch-team/anysearch-dsh', version: '0.1.6', license: 'MIT', dsh: '0.2.1-alpha.1', cordis: '4.0.5-alpha.1', schemastery: '3.18.5-alpha.1', sourceManifestSha256, adaptedManifestSha256: sha(manifest), changes: ['exact reviewed alpha peer additions', 'search count 1..10 and content format', 'safe upstream diagnostics without credential-bearing messages', 'per-request credential resolution retained', 'product probe reuses the registered client and credential reference'], files }, null, 2) + '\n')
  verifyAnySearchDirectory(directory)
  return files
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const verify = process.argv.includes('--verify')
  const directory = process.argv.slice(2).find(value => value !== '--verify') || join(dirname(fileURLToPath(import.meta.url)), '../vendor/anysearch-dsh')
  if (verify) verifyAnySearchDirectory(directory)
  else patchAnySearchDirectory(directory)
  console.log('AnySearch 0.1.6 reviewed DSH 0.2.1-alpha.1 adaptation verified')
}
