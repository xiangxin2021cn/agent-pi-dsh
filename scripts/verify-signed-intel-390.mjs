import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { sanitizeStartupLog } from '../apps/desktop/startup-diagnostics.mjs'

const sourceCommit = '13869160f0863b26de66aa7fc02a53617408f498'
const kernelPin = '39163dd30f703a79079e2d2446545cff3c453738'
const stem = 'Agent-Pi-DSH-3.9.0-mac-x64'
const appName = 'Agent Pi DSH.app'

export function acceptSignedIntelRelease(release, dmgSha, zipSha, team) {
  for (const hash of [dmgSha, zipSha]) assert.match(hash, /^[a-f0-9]{64}$/)
  assert.match(team, /^[A-Z0-9]{10}$/)
  assert.equal(release.id, 445163826)
  assert.equal(release.tag_name, 'v3.9.0')
  assert.equal(release.draft, true, 'Validation must precede formal publication')
  return ['dmg', 'zip'].flatMap(extension => {
    const expected = extension === 'dmg' ? dmgSha : zipSha
    return ['', '.sha256'].map(suffix => {
      const name = stem + '.' + extension + suffix
      const found = release.assets.filter(asset => asset.name === name)
      assert.equal(found.length, 1, 'Exactly one final asset required: ' + name)
      const asset = found[0]
      assert.equal(asset.state, 'uploaded', name)
      assert.ok(Number.isSafeInteger(asset.size) && asset.size > 0, name)
      assert.match(asset.digest, /^sha256:[a-f0-9]{64}$/)
      if (!suffix) assert.equal(asset.digest, 'sha256:' + expected, name)
      else assert.ok(asset.size <= 4096, 'Unexpected checksum sidecar size')
      return asset
    })
  })
}

async function main() {
  assert.equal(process.platform, 'darwin')
  assert.equal(process.arch, 'x64', 'Native Intel runner required')
  const [candidateValue, format] = process.argv.slice(2)
  assert.ok(format === 'zip' || format === 'dmg')
  const candidate = resolve(candidateValue)
  const audit = resolve(process.env.SIGNED_INTEL_REPORT_DIR)
  const runnerTemp = resolve(process.env.RUNNER_TEMP)
  assert.ok(audit.startsWith(runnerTemp + '/'), 'Audit must remain inside runner temporary storage')
  mkdirSync(audit, { recursive: true })
  const env = { ...process.env, GH_DEBUG: '' }
  const appEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/token|secret|password|credential|cookie|api.?key|authorization|^DSH_|^AGENT_PI_|^ELECTRON_RUN_AS_NODE$|^NODE_OPTIONS$|^NODE_PATH$/i.test(key)))
  const run = (label, command, args, timeout = 300000, childEnv = env) => {
    const started = Date.now()
    const result = spawnSync(command, args, { cwd: audit, env: childEnv, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
    writeFileSync(join(audit, label + '.stdout.log'), sanitizeStartupLog(result.stdout || ''))
    writeFileSync(join(audit, label + '.stderr.log'), sanitizeStartupLog(result.stderr || ''))
    writeFileSync(join(audit, label + '.result.json'), JSON.stringify({ exitCode: result.status, signal: result.signal,
      elapsedMs: Date.now() - started, errorCode: result.error?.code }, null, 2))
    assert.equal(result.status, 0, label + ' failed; inspect audit logs')
    return result.stdout || ''
  }
  const jsonWrite = (name, value) => writeFileSync(join(audit, name), JSON.stringify(value, null, 2) + '\n')
  try {
    run('os-version', '/usr/bin/sw_vers', [])
    assert.equal(run('hardware', '/usr/bin/uname', ['-m']).trim(), 'x86_64')
    const translated = spawnSync('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'], { encoding: 'utf8' })
    assert.notEqual(translated.stdout.trim(), '1', 'Rosetta is not native Intel validation')
    assert.equal(run('candidate', 'git', ['-C', candidate, 'rev-parse', 'HEAD']).trim(), sourceCommit)
    assert.equal(run('candidate-clean', 'git', ['-C', candidate, 'status', '--porcelain']).trim(), '')
    assert.equal(readFileSync(join(candidate, 'DSH_PIN'), 'utf8').trim(), kernelPin)
    const release = JSON.parse(run('draft', 'gh', ['api', 'repos/xiangxin2021cn/agent-pi-dsh/releases/445163826']))
    const assets = acceptSignedIntelRelease(release, env.INTEL_DMG_SHA256, env.INTEL_ZIP_SHA256, env.DEVELOPER_TEAM_ID)
    const inputs = join(audit, 'inputs')
    mkdirSync(inputs)
    const downloadArgs = ['release', 'download', 'v3.9.0', '--repo', 'xiangxin2021cn/agent-pi-dsh', '--dir', inputs]
    for (const asset of assets) downloadArgs.push('--pattern', asset.name)
    run('download', 'gh', downloadArgs, 900000)
    for (const asset of assets) {
      const hash = createHash('sha256')
      let bytes = 0
      for await (const chunk of createReadStream(join(inputs, asset.name))) { hash.update(chunk); bytes += chunk.length }
      assert.equal(bytes, asset.size)
      assert.equal('sha256:' + hash.digest('hex'), asset.digest)
    }
    for (const extension of ['zip', 'dmg']) {
      const match = readFileSync(join(inputs, stem + '.' + extension + '.sha256'), 'utf8').trim()
        .match(/^([a-f0-9]{64})  ([^\\/\r\n]+)$/i)
      assert.ok(match)
      assert.equal(match[1].toLowerCase(), extension === 'dmg' ? env.INTEL_DMG_SHA256 : env.INTEL_ZIP_SHA256)
      assert.equal(match[2], stem + '.' + extension)
    }
    const zip = join(inputs, stem + '.zip')
    const dmg = join(inputs, stem + '.dmg')
    const zipPolicy = join(import.meta.dirname, 'verify-mac-zip-links.py')
    run('zip-entry-policy', 'python3', ['-B', zipPolicy, zip])
    const quarantine = '0083;' + Math.floor(Date.now() / 1000).toString(16) + ';Safari;' + randomUUID()
    run('zip-download-quarantine', '/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantine, zip])
    run('system-archive-utility', '/usr/bin/open', ['-n', '-a', '/System/Library/CoreServices/Applications/Archive Utility.app', zip], 15000)
    const zipApp = join(inputs, appName)
    const extractStarted = Date.now()
    let extracted = false
    let lastSeal = ''
    while (Date.now() - extractStarted < 600000) {
      if (existsSync(join(zipApp, 'Contents/Info.plist'))) {
        const seal = spawnSync('codesign', ['--verify', '--deep', '--strict', zipApp], { encoding: 'utf8', timeout: 120000 })
        lastSeal = seal.stderr || seal.error?.message || ''
        if (seal.status === 0) { extracted = true; break }
      }
      await delay(2000)
    }
    jsonWrite('system-extraction.json', { passed: extracted, method: 'system Archive Utility', elapsedMs: Date.now() - extractStarted, manualRepair: false, lastSeal: sanitizeStartupLog(lastSeal) })
    assert.ok(extracted, 'System Archive Utility did not produce an intact signed application')
    run('zip-targets-and-permissions', 'python3', ['-B', zipPolicy, zip, inputs])
    run('dmg-ticket', 'xcrun', ['stapler', 'validate', dmg])
    run('dmg-gatekeeper', 'spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg])
    run('dmg-image', 'hdiutil', ['verify', dmg])
    const mount = join(audit, 'mounted')
    mkdirSync(mount)
    let mounted = false
    let selectedApp = zipApp
    let signature
    const inspectSignature = (label, app) => {
      const result = spawnSync('codesign', ['-d', '--verbose=4', app], { encoding: 'utf8' })
      assert.equal(result.status, 0)
      writeFileSync(join(audit, label + '.log'), result.stderr)
      const cdHash = result.stderr.match(/^CDHash=([a-f0-9]+)$/m)?.[1]
      assert.ok(cdHash)
      assert.equal(result.stderr.match(/^TeamIdentifier=(.+)$/m)?.[1], env.DEVELOPER_TEAM_ID)
      assert.match(result.stderr, /^Authority=Developer ID Application:/m)
      return cdHash
    }
    try {
      run('dmg-attach', 'hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, dmg])
      mounted = true
      const diskInfo = run('dmg-filesystem', 'diskutil', ['info', '-plist', mount])
      writeFileSync(join(audit, 'volume.plist'), diskInfo)
      const volume = JSON.parse(run('dmg-filesystem-json', 'plutil', ['-convert', 'json', '-o', '-', join(audit, 'volume.plist')]))
      assert.equal(volume.FilesystemType, 'apfs')
      const dmgApp = join(mount, appName)
      signature = inspectSignature('zip-identity', zipApp)
      assert.equal(inspectSignature('dmg-identity', dmgApp), signature, 'DMG and ZIP application CDHash differ')
      if (format === 'dmg') {
        const installed = join(audit, 'installed')
        mkdirSync(installed)
        selectedApp = join(installed, appName)
        run('dmg-copy', 'ditto', [dmgApp, selectedApp])
        run('dmg-targets-and-permissions', 'python3', ['-B', zipPolicy, zip, installed])
      }
    } finally {
      if (mounted) run('dmg-detach', 'hdiutil', ['detach', mount])
    }
    run('application-quarantine', '/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantine, selectedApp])
    const verifyApp = label => {
      run(label + '-seal', 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', selectedApp])
      run(label + '-developer-id', 'codesign', ['--verify', '--strict', '-R=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists', selectedApp])
      run(label + '-ticket', 'xcrun', ['stapler', 'validate', selectedApp])
      run(label + '-distribution', 'syspolicy_check', ['distribution', selectedApp])
      run(label + '-gatekeeper', 'spctl', ['--assess', '--type', 'execute', '--verbose=2', selectedApp])
      assert.equal(inspectSignature(label + '-identity', selectedApp), signature)
    }
    verifyApp('before-start')
    const plist = JSON.parse(run('app-plist', 'plutil', ['-convert', 'json', '-o', '-', join(selectedApp, 'Contents/Info.plist')]))
    assert.equal(plist.CFBundleShortVersionString, '3.9.0')
    const runtime = join(selectedApp, 'Contents/Resources/runtime')
    assert.equal(JSON.parse(readFileSync(join(runtime, 'product/package.json'), 'utf8')).agentPiProduct.edition, 'mainline')
    assert.equal(readFileSync(join(runtime, 'product/DSH_PIN'), 'utf8').trim(), kernelPin)
    run('deployment-targets', 'python3', ['-B', join(candidate, 'scripts/verify-macos-intel.py'), selectedApp, '--arch', 'x86_64', '--maximum-macos', '15.0.0', '--report', join(audit, 'deployment-targets.json')])
    const runtimeNode = join(runtime, 'node/node')
    const firstNode = JSON.parse(run('first-node', runtimeNode, ['-p', 'JSON.stringify({arch:process.arch,version:process.version})'], 60000, appEnv))
    assert.deepEqual(firstNode, { arch: 'x64', version: 'v24.22.2' })
    const launch = await launchServices(selectedApp, audit, appEnv, run)
    run('native-runtime', runtimeNode, [join(runtime, 'product/scripts/verify-dsh-runtime.mjs'), join(runtime, 'deepseek-harness'), join(runtime, 'product'), '--native'], 300000, appEnv)
    run('office-closure', runtimeNode, [join(runtime, 'product/scripts/install-univer-runtime-deps.mjs'), join(runtime, 'product/vendor/dsh-univer-office'), '--verify-only'], 300000, appEnv)
    run('direct-native-renderer', process.execPath, [join(candidate, 'scripts/smoke-macos-intel.mjs'), selectedApp, 'x64', '24.22.2', '45.2.2'], 300000, appEnv)
    const javaProbe = join(audit, 'SignedSqliteProbe.java')
    writeFileSync(javaProbe, 'import java.sql.*; public class SignedSqliteProbe { public static void main(String[] a) throws Exception { Class.forName("org.sqlite.JDBC"); try(Connection c=DriverManager.getConnection("jdbc:sqlite:"+a[0]); Statement s=c.createStatement()) { s.execute("CREATE TABLE proof(value INTEGER)"); s.execute("INSERT INTO proof VALUES(42)"); try(ResultSet r=s.executeQuery("SELECT value FROM proof")) { if(!r.next() || r.getInt(1)!=42) throw new Exception("SQLite native proof failed"); } } System.out.println("SIGNED_SQLITE_NATIVE_OK"); } }')
    const sql = run('signed-sqlite-native', 'java', ['--class-path', join(runtime, 'product/bundles/project-plan/runtime/lib/*'), javaProbe, join(audit, 'native-sqlite.db')], 60000, appEnv)
    assert.ok(sql.includes('SIGNED_SQLITE_NATIVE_OK'))
    verifyApp('after-start')
    jsonWrite('verification.json', { status: 'passed', sourceCommit, kernelPin, architecture: 'native-x86_64', format,
      developerTeamId: env.DEVELOPER_TEAM_ID, cdHash: signature, assets: assets.map(({ name, size, digest }) => ({ name, size, digest })),
      systemArchiveUtility: true, symlinksAndPermissions: true, dmgMountedReadOnly: true, notarized: true,
      firstNode, launchServices: launch, nativeRuntime: true, signedSqliteReadWrite: true, postLaunchSeal: true })
  } catch (error) {
    jsonWrite('verification.json', { status: 'failed', sourceCommit, format, error: sanitizeStartupLog(error.stack || String(error)) })
    throw error
  }
}

async function launchServices(app, audit, env, run) {
  const userData = mkdtempSync(join(audit, 'launch-user-data-'))
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  const marker = '--user-data-dir=' + userData
  const processes = () => (spawnSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout || '').split('\n')
    .map(line => line.match(/^\s*(\d+)\s+(.*)$/)).filter(match => match && match[2].includes(marker))
    .map(match => ({ pid: Number(match[1]), command: match[2] }))
  const started = Date.now()
  let renderer
  let owned
  try {
    run('launch-services-open', '/usr/bin/open', ['-n', app, '--args', '--disable-gpu', marker, '--remote-debugging-port=' + port], 15000,
      { ...env, AGENT_PI_DSH_FORCE_COLD_START: '1' })
    while (Date.now() - started < 180000) {
      try {
        const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(2000) })).json()
        const target = targets.find(target => target.type === 'page' && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(target.url))
        if (target) {
          renderer = await inspectPage(target.webSocketDebuggerUrl)
          if (renderer.ready === 'complete' && renderer.textLength > 100 && renderer.visibility === 'visible' && renderer.width > 0 && renderer.height > 0) {
            owned = processes().find(row => !row.command.includes('--type=') && row.command.includes('/Contents/MacOS/'))
            assert.ok(owned, 'Cannot establish ownership of launched application')
            const proof = { passed: true, elapsedMs: Date.now() - started, renderer,
              appTranslocation: owned.command.includes('/AppTranslocation/'), process: owned.command }
            writeFileSync(join(audit, 'launch-services-first.json'), JSON.stringify(proof, null, 2))
            return proof
          }
        }
      } catch {}
      await delay(500)
    }
    throw new Error('First LaunchServices renderer did not become ready; no retry or protection bypass was attempted')
  } finally {
    const launchLog = join(userData, 'dsh-launch.log')
    if (existsSync(launchLog)) writeFileSync(join(audit, 'launch-services-dsh.log'), sanitizeStartupLog(readFileSync(launchLog, 'utf8')).slice(-20000))
    for (const row of processes()) { try { process.kill(row.pid, 'SIGTERM') } catch {} }
    await delay(3000)
    for (const row of processes()) { try { process.kill(row.pid, 'SIGKILL') } catch {} }
  }
}

function inspectPage(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => { socket.close(); reject(new Error('Renderer inspection timeout')) }, 5000)
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Renderer inspection failed')) }, { once: true })
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { returnByValue: true,
      expression: '({ready:document.readyState,textLength:document.body?.innerText?.length||0,visibility:document.visibilityState,width:innerWidth,height:innerHeight})' } })), { once: true })
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      if (message.error || message.result?.exceptionDetails) reject(new Error('Renderer inspection failed'))
      else resolve(message.result.result.value)
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
