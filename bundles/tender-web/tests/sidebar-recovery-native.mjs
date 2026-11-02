import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { AP_LANGUAGE_DEFINITIONS } from '../src/client/locales/catalog.js'

const selfTest = `
window.sidebarNativeQa=async()=>{
 const copy=window.sidebarFixture.copy;
 const facts=[],check=(condition,message)=>{if(!condition)throw new Error(message)},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(predicate,message)=>{for(let n=0;n<80;n++){if(predicate())return;await sleep(20)}throw new Error(message)};
 const visible=node=>{if(!node)return false;const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
 const named=name=>[...document.querySelectorAll('button')].find(n=>n.getAttribute('aria-label')===name||n.textContent.trim()===name);
 const inspect=node=>{check(visible(node),'Recovery control hidden');const r=node.getBoundingClientRect();check(r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight,'Recovery control outside viewport');check(node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),'Recovery control covered');check(node.tagName==='BUTTON'&&!node.disabled&&node.tabIndex===0&&!node.closest('[inert]'),'Recovery control not a native focusable button');node.focus();check(document.activeElement===node,'Recovery control cannot receive focus');return {x:r.x,y:r.y,width:r.width,height:r.height};};
 await until(()=>named(copy.filesOpen)&&document.querySelector('[data-sidebar-toggle]'),'React fixture did not mount');
 check(document.querySelector('h1').textContent==='Original main conversation','Page identity missing');check(!document.querySelector('vite-error-overlay,nextjs-portal'),'Framework overlay present');
 check(document.querySelector('[data-dsh-icon-sprite] #dsw-icon-panel-left-outline-regular'),'Native theme icon sprite missing');
 for(const workbench of [false,true]){
  if(workbench){named('Switch workbench').click();await until(()=>document.documentElement.classList.contains('ap-wb-open'),'Workbench did not open')}
  const left=document.querySelector(innerWidth<=760?'[data-sidebar-opener]':'[data-sidebar-toggle]'),right=named(copy.filesOpen);
  const before={left:inspect(left),right:inspect(right)};check(visible(left.querySelector(':scope > svg[data-icon="dsw-icon-panel-left-outline-regular"]')),'Left panel icon hidden without hover');
  left.click();await until(()=>visible(named(copy.sideCollapse)),'Left did not expand');named(copy.sideCollapse).click();await until(()=>visible(left)&&left.getAttribute('aria-label')===copy.sideOpen,'Left did not collapse');await sleep(180);
  right.click();await until(()=>visible(named(copy.filesCollapse)),'Right did not expand');named(copy.filesCollapse).click();await until(()=>visible(named(copy.filesOpen)),'Right did not collapse');
  named('Background update').click();await until(()=>document.querySelector('output').textContent!=='0','Background update did not render');
  inspect(left);inspect(named(copy.filesOpen));check(document.querySelector('textarea').value==='保留原项目输入','Draft changed');check(document.documentElement.scrollWidth<=innerWidth,'Horizontal overflow');
  facts.push({language:window.sidebarFixture.language,direction:document.documentElement.dir,width:innerWidth,height:innerHeight,workbench,recoveryControlsInViewport:true,hitTargetsUncovered:true,focusAndNativeButtonSemantics:true,clickExpandCollapse:true,draftRetained:true,backgroundUpdateRetained:true,noHorizontalOverflow:true,bounds:before});
 }
 check(window.__qaErrors.length===0,'Page errors: '+window.__qaErrors.join(';'));check(window.sidebarFixture.calls.every(c=>c.method==='GET'),'Fixture attempted mutation');return {status:'passed',facts,pageErrors:window.__qaErrors,requests:window.sidebarFixture.calls.length,nativeKeyboardInputExercised:false};
};`

const preflight = `window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));const error=console.error.bind(console);console.error=(...args)=>{window.__qaErrors.push(args.map(String).join(' '));error(...args)};`
const languageOrder = ['de', 'ru', 'ar', ...AP_LANGUAGE_DEFINITIONS.map(row => row.id).filter(id => !['de', 'ru', 'ar'].includes(id))]
const harness = `<!doctype html><html><head><meta charset="utf-8"><title>Agent Pi 3.8.8 native sidebar QA</title><style>body{margin:12px;font:14px Arial;background:#e9eef2}h1{font-size:18px;margin:8px}main{display:flex;gap:12px;margin-bottom:12px}iframe{border:1px solid #a0aec0;background:white;flex:none}pre{font-size:11px;white-space:pre-wrap;max-height:50px;overflow:hidden}</style></head><body><h1>3.8.8 actual sidebar components · ten languages · desktop 1280px / narrow 390px</h1><pre id="qa-result" data-status="pending">pending</pre>${languageOrder.map(id => `<h2>${id}</h2><main><iframe title="${id} desktop" width="1280" height="800" src="/frame?lang=${id}"></iframe><iframe title="${id} narrow" width="390" height="700" src="/frame?lang=${id}"></iframe></main>`).join('')}<script src="/harness.js"></script></body></html>`
const harnessJs = `(async()=>{const frames=[...document.querySelectorAll('iframe')];await Promise.all(frames.map(frame=>new Promise(resolve=>{if(frame.contentDocument?.readyState==='complete'&&frame.contentWindow.sidebarNativeQa)resolve();else frame.addEventListener('load',resolve,{once:true})})));const result=[];for(const frame of frames){frame.scrollIntoView({block:'start'});await new Promise(resolve=>setTimeout(resolve,20));try{result.push(await frame.contentWindow.sidebarNativeQa())}catch(error){result.push({status:'failed',frame:frame.title,error:error.message})}}scrollTo(0,0);const passed=result.every(r=>r.status==='passed');const output=document.querySelector('#qa-result');output.dataset.status=passed?'passed':'failed';output.textContent=JSON.stringify({status:passed?'passed':'failed',results:result});document.title+=' '+(passed?'PASS':'FAIL')})().catch(error=>{const output=document.querySelector('#qa-result');output.dataset.status='failed';output.textContent=JSON.stringify({status:'failed',error:error.message})});`

/** One zero-model, loopback-only actual-component rendering in native Chrome; no CDP or policy changes. */
export async function runNativeSidebarFixture({ root, source, html, react, reactDom, build, stopBuild }) {
  assert.equal(process.platform, 'win32', 'This native desktop regression targets Windows Chrome')
  for (const key of ['HKCU\\Software\\Policies\\Google\\Chrome', 'HKLM\\Software\\Policies\\Google\\Chrome']) {
    const result = spawnSync('C:/Windows/System32/reg.exe', ['query', key, '/v', 'UserDataDir', '/reg:64'], { windowsHide: true, timeout: 10000 })
    const message = new TextDecoder('gbk').decode(Buffer.concat([result.stdout || Buffer.alloc(0), result.stderr || Buffer.alloc(0)]))
    assert.ok(result.status === 1 && /(找不到|unable to find)/i.test(message), 'Cannot prove absence of a forced Chrome UserDataDir policy')
  }
  const scratch = mkdtempSync(join(tmpdir(), 'ap-sidebar-388-'))
  const evidence = process.env.AGENT_PI_UI_TEST_EVIDENCE_DIR || scratch
  const report = { status: 'failed', modelRequests: 0, credentialsCopied: false, originalProjectAccessed: false, nativeKeyboardInputExercised: false }
  let server, ctx, child, timer
  try {
    for (const name of ['native-dom.html', 'native-chrome.stderr.log', 'native-collapsed-panels.png', 'native-verification.json']) assert.equal(existsSync(join(evidence, name)), false, 'Fresh evidence directory required')
    await build({ stdin: { contents: source + selfTest, resolveDir: root, sourcefile: 'sidebar-recovery-fixture.jsx', loader: 'jsx' }, bundle: true, platform: 'browser', format: 'iife', outfile: join(scratch, 'fixture.js'), loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_VERSION': 'undefined', 'process.env.DSH_CLIENT_COMMIT_HASH': 'undefined', 'process.env.DSH_CLIENT_GIT_DIRTY': 'undefined' }, alias: { react: dirname(react), 'react-dom/client': reactDom }, logLevel: 'silent' })
    stopBuild()
    const frameHtml = html.replace('<script src="/fixture.js">', '<script src="/preflight.js"></script><script src="/fixture.js">')
    let blockedRequests = 0
    server = createServer((req, res) => {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) { blockedRequests++; res.writeHead(403); res.end(); return }
      const path = new URL(req.url, 'http://127.0.0.1').pathname, resources = { '/': harness, '/frame': frameHtml, '/preflight.js': preflight, '/harness.js': harnessJs }
      if (path === '/favicon.ico') { res.writeHead(204); res.end(); return }
      if (!Object.hasOwn(resources, path) && !['/fixture.js', '/fixture.css'].includes(path)) { blockedRequests++; res.writeHead(403); res.end(); return }
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; frame-src 'self'")
      res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8')
      res.end(Object.hasOwn(resources, path) ? resources[path] : readFileSync(join(scratch, path.slice(1))))
    })
    server.on('connect', (_req, socket) => { blockedRequests++; socket.end('HTTP/1.1 403 Forbidden\r\n\r\n') })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = 'http://127.0.0.1:' + server.address().port
    const args = ['--headless', '--dump-dom', '--screenshot=' + join(evidence, 'native-collapsed-panels.png'), '--window-size=1740,2850', '--virtual-time-budget=20000', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--user-data-dir=' + join(scratch, 'u'), '--proxy-server=' + origin, '--proxy-bypass-list=127.0.0.1;localhost', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', origin]
    assert.equal(args.some(arg => arg.includes('remote-debugging') || arg === '--no-sandbox'), false)
    const dsh = join(root, 'vendor/deepseek-harness'), require = createRequire(join(dsh, 'apps/cli/package.json'))
    const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
    const { default: Subprocess } = await import(pathToFileURL(join(dsh, 'packages/subprocess/subprocess-local/lib/index.js')).href)
    ctx = new Context(); await ctx.plugin(Subprocess)
    child = ctx.subprocess.spawn({ argv: [join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'), ...args], cwd: scratch, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 2000 })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    timer = setTimeout(() => { report.timedOut = true; child.terminate() }, 70000)
    const outcome = await child.done
    await child.waitForExit(); report.managedRangeQuiescent = true
    writeFileSync(join(evidence, 'native-dom.html'), stdout, { flag: 'wx' }); writeFileSync(join(evidence, 'native-chrome.stderr.log'), stderr, { flag: 'wx' })
    const match = /<pre id="qa-result" data-status="(passed|failed)">([\s\S]*?)<\/pre>/.exec(stdout)
    const decode = text => text.replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
    if (match) report.domResult = JSON.parse(decode(match[2]))
    report.exitCode = outcome.exitCode; report.origin = origin; report.blockedNonFixtureRequests = blockedRequests
    report.sourceHashes = Object.fromEntries(['bundles/tender-web/src/client/styles.js', 'bundles/tender-web/src/client/file-preview-overlay.js', 'bundles/tender-web/tests/sidebar-recovery.test.mjs', 'bundles/tender-web/tests/sidebar-recovery-native.mjs'].map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]))
    assert.equal(outcome.exitCode, 0, stderr.slice(-2000)); assert.equal(report.timedOut, undefined)
    assert.equal(match?.[1], 'passed', JSON.stringify(report.domResult))
    assert.deepEqual(report.domResult.results.flatMap(row => row.facts.map(fact => [fact.language, fact.width, fact.workbench])), languageOrder.flatMap(id => [[id, 1280, false], [id, 1280, true], [id, 390, false], [id, 390, true]]))
    assert.ok(existsSync(join(evidence, 'native-collapsed-panels.png')))
    report.status = 'passed'
    return report
  } finally {
    clearTimeout(timer); stopBuild()
    if (child && !report.managedRangeQuiescent) { child.terminate(); await child.waitForExit(); report.managedRangeQuiescent = true }
    if (ctx) { await ctx.fiber.dispose(); report.contextDisposed = true }
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    report.endedAt = new Date().toISOString(); writeFileSync(join(evidence, 'native-verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    const safe = realpathSync(scratch), parent = realpathSync(tmpdir()) + sep
    assert.ok(safe.startsWith(parent) && basename(safe).startsWith('ap-sidebar-388-'))
    rmSync(safe, { recursive: true, force: true })
  }
}
