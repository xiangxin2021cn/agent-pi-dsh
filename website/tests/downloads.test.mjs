import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const website = join(import.meta.dirname, '..')
const main = readFileSync(join(website, 'assets/js/main.js'), 'utf8')
const metadata = readFileSync(join(website, 'assets/js/release-metadata.js'), 'utf8')
const html = readFileSync(join(website, 'index.html'), 'utf8')
const suffixes = {
  'windows-exe': '-x64.exe',
  'windows-sha': '-x64.exe.sha256',
  'mac-dmg': '-mac-arm64.dmg',
  'mac-zip': '-mac-arm64.zip',
  'linux-appimage': '-linux-x86_64.AppImage',
  'linux-deb': '-linux-amd64.deb',
  'mac-intel-dmg': '-mac-x64.dmg',
  'mac-intel-zip': '-mac-x64.zip',
  'mac-intel-sha': '-mac-x64.dmg.sha256',
}
const intel = 'mac-intel-dmg mac-intel-zip mac-intel-sha'
const releaseBase = 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.8.7/'
const windowsSha = '246C211A2F2A2E8DFF4E548299D7A19A888217A628481CFE5E2172F2567F2553'

function fallbackText(attribute) {
  const match = html.match(new RegExp(attribute + '(?:\\s[^>]*)?>([^<]*)<'))
  assert.ok(match, attribute)
  return match[1]
}

function element(attributes = {}) {
  return {
    textContent: 'fallback', hidden: false, href: 'fallback',
    setAttribute(key, value) { attributes[key] = value },
    getAttribute(key) { return attributes[key] ?? null },
    hasAttribute(key) { return Object.hasOwn(attributes, key) },
  }
}

function release(withIntel = true, version = '3.8.3', intelFamily = '-mac-x64-monterey') {
  const kernel = version === '3.8.5'
    ? { sourceKind: 'official-master-snapshot', packageVersion: '0.2.1-rc.3', commit: '22ddee3792402c3e70ec5f86a63c3e3e895a2f60' }
    : version === '3.8.7'
    ? { sourceKind: 'official-master-snapshot', packageVersion: '0.2.2-alpha.2', commit: 'ce7073d51254c26cd63b22a60835b8f948deb447' }
    : version === '3.8.6'
    ? { releaseTag: 'dsh-v0.2.2-alpha.2', commit: 'f3803c96974ad4a94195fb97e5c637e9c2a3afe3' }
    : { releaseTag: 'dsh-v0.2.1-alpha.2', commit: 'a'.repeat(40) }
  return {
    tag_name: 'v' + version, published_at: '2026-10-15T10:00:00Z',
    body: '<!-- agent-pi-release-meta: ' + JSON.stringify({ schema: 1, appVersion: version, kernel }) + ' -->',
    assets: Object.entries(suffixes).filter(([key]) => withIntel || !key.startsWith('mac-intel')).map(([key, suffix]) => {
      if (key.startsWith('mac-intel')) suffix = suffix.replace('-mac-x64', intelFamily)
      return {
        name: 'Agent-Pi-DSH-' + version + suffix, state: 'uploaded', size: 1048576,
        digest: 'sha256:' + 'b'.repeat(64),
        browser_download_url: 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v' + version + '/Agent-Pi-DSH-' + version + suffix,
      }
    }),
  }
}

async function render(data, { offline = false } = {}) {
  const version = element()
  version.textContent = fallbackText('data-rel-version')
  const panel = element({ 'data-release-state': 'fallback' })
  const electron = element()
  electron.textContent = fallbackText('data-release-electron-version')
  const date = element()
  const group = element({ 'data-require-release-asset': intel })
  const missing = element({ 'data-missing-release-asset': intel })
  missing.hidden = true
  const systems = { 'mac-arm64': element(), 'mac-x64': element() }
  systems['mac-arm64'].textContent = fallbackText('data-release-system="mac-arm64"')
  systems['mac-x64'].textContent = fallbackText('data-release-system="mac-x64"')
  const systemFallback = element()
  const systemNote = element()
  systemNote.hidden = true
  systemNote.innerHTML = ''
  const sourceLinks = [...html.matchAll(/<a\b[^>]*\bdata-release-asset="([^"]+)"[^>]*>/g)]
  const links = Object.fromEntries(Object.keys(suffixes).map(key => [key, sourceLinks.filter(match => match[1] === key).map(match => {
    const link = element(match[0].includes('data-release-proxy') ? { 'data-release-proxy': '' } : {})
    link.href = match[0].match(/\bhref="([^"]+)"/)[1]
    return link
  })]))
  const sizes = Object.fromEntries(Object.keys(suffixes).map(key => [key, element()]))
  const context = {
    window: {}, fetch: async () => {
      if (offline) throw new Error('offline API fixture')
      return { ok: true, json: async () => data }
    },
    document: {
      getElementById: () => panel,
      querySelectorAll(selector) {
        if (selector === '[data-rel-version], [data-release-version]' || selector === '[data-rel-version]') return [version]
        if (selector === '[data-require-release-asset], [data-missing-release-asset]') return [group, missing]
        if (selector === '[data-release-electron-version]') return [electron]
        if (selector === '[data-release-date]') return [date]
        if (selector === '[data-release-system-fallback]') return [systemFallback]
        if (selector === '[data-release-system-note]') return [systemNote]
        const system = selector.match(/^\[data-release-system="([^"]+)"\]$/)
        if (system) return systems[system[1]] ? [systems[system[1]]] : []
        const asset = selector.match(/^\[data-release-asset="([^"]+)"\]$/)
        if (asset) return links[asset[1]] || []
        const size = selector.match(/^\[data-release-size="([^"]+)"\]$/)
        return size && sizes[size[1]] ? [sizes[size[1]]] : []
      },
    },
  }
  vm.runInNewContext(metadata, context)
  vm.runInNewContext(main.slice(main.indexOf('/* ---- Latest complete')), context)
  await new Promise(setImmediate)
  return { version, panel, electron, date, group, missing, links, sizes, systems, systemFallback, systemNote }
}

test('complete legacy Intel assets update together and retain accelerator prefixes', async () => {
  const ui = await render(release())
  assert.equal(ui.version.textContent, 'v3.8.3')
  assert.equal(ui.group.hidden, false)
  assert.equal(ui.missing.hidden, true)
  for (const key of intel.split(' ')) {
    assert.ok(ui.links[key][0].href.includes('/v3.8.3/Agent-Pi-DSH-3.8.3-mac-x64-monterey.'))
  }
  assert.equal(ui.links['mac-intel-dmg'][1].href, 'https://gh-proxy.org/' + ui.links['mac-intel-dmg'][0].href)
  assert.equal(ui.sizes['mac-intel-dmg'].textContent, '1.0 MB')
})

test('a release without Intel assets still updates primary platforms and hides the Intel row', async () => {
  const ui = await render(release(false))
  assert.equal(ui.version.textContent, 'v3.8.3')
  assert.equal(ui.group.hidden, true)
  assert.equal(ui.missing.hidden, false)
  assert.equal(ui.links['mac-intel-dmg'][0].hidden, true)
  assert.ok(ui.links['mac-dmg'][0].href.endsWith('-mac-arm64.dmg'))
})

test('an Intel asset from another release cannot expose a partial compatibility download group', async () => {
  const data = release()
  data.assets.find(asset => asset.name.endsWith('.dmg.sha256')).browser_download_url = 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.8.2/Agent-Pi-DSH-3.8.2-mac-x64-monterey.dmg.sha256'
  const ui = await render(data)
  assert.equal(ui.version.textContent, 'v3.8.3')
  assert.equal(ui.group.hidden, true)
  assert.equal(ui.missing.hidden, false)
  assert.equal(ui.links['mac-intel-sha'][0].hidden, true)
})

test('3.8.5 snapshot metadata selects standard Intel downloads and the actual system requirements', async () => {
  const ui = await render(release(true, '3.8.5', '-mac-x64'))
  assert.equal(ui.version.textContent, 'v3.8.5')
  assert.equal(ui.group.hidden, false)
  assert.equal(ui.missing.hidden, true)
  for (const key of intel.split(' ')) {
    assert.equal(ui.links[key][0].hidden, false)
    assert.ok(ui.links[key][0].href.includes('/v3.8.5/Agent-Pi-DSH-3.8.5-mac-x64.'))
  }
  assert.equal(ui.links['mac-intel-dmg'][1].href, 'https://gh-proxy.org/' + ui.links['mac-intel-dmg'][0].href)
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 15+')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 15+')
  assert.equal(ui.systemFallback.hidden, true)
  assert.equal(ui.systemNote.hidden, false)
  assert.ok(ui.systemNote.innerHTML.includes('macOS 15'))
  assert.doesNotMatch(ui.systemNote.innerHTML, /macOS 1[234]|Monterey|Electron 44/)
})

test('3.8.6 official release keeps all mainline downloads and both current macOS requirements', async () => {
  const ui = await render(release(true, '3.8.6', '-mac-x64'))
  assert.equal(ui.version.textContent, 'v3.8.6')
  assert.equal(ui.electron.textContent, '45.0.0')
  assert.equal(ui.group.hidden, false)
  for (const [key, suffix] of Object.entries(suffixes)) {
    assert.equal(ui.links[key][0].href, 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.8.6/' + 'Agent-Pi-DSH-3.8.6' + suffix)
    assert.equal(ui.links[key][0].hidden, false)
  }
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 15+')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 15+')
  assert.match(ui.systemNote.innerHTML, /3\.8\.6.*macOS 15/)
})

test('a tender release cannot replace the mainline site identity or download links', async () => {
  const data = release(true, '3.8.7', '-mac-x64')
  data.tag_name = 'tender-v3.8.7'
  for (const asset of data.assets) {
    asset.name = asset.name.replace('Agent-Pi-DSH-', 'Agent-Pi-DSH-Tender-')
    asset.browser_download_url = asset.browser_download_url.replace('/v3.8.7/', '/tender-v3.8.7/').replace('/Agent-Pi-DSH-', '/Agent-Pi-DSH-Tender-')
  }
  const ui = await render(data)
  assert.equal(ui.version.textContent, 'v3.8.7')
  assert.equal(ui.panel.getAttribute('data-release-state'), 'fallback')
  assert.equal(ui.links['windows-exe'][0].href, releaseBase + 'Agent-Pi-DSH-3.8.7-x64.exe')
  assert.doesNotMatch(html, /tender-v3\.8\.7|Agent-Pi-DSH-Tender-3\.8\.7/)
})

test('Intel downloads never mix partial standard and Monterey asset families', async () => {
  const data = release(true, '3.8.5', '-mac-x64')
  data.assets = data.assets.filter(asset => !asset.name.endsWith('-mac-x64.zip'))
  data.assets.push(release(true, '3.8.5').assets.find(asset => asset.name.endsWith('-mac-x64-monterey.zip')))
  const ui = await render(data)
  assert.equal(ui.version.textContent, 'v3.8.5')
  assert.equal(ui.group.hidden, true)
  assert.equal(ui.missing.hidden, false)
  for (const key of intel.split(' ')) assert.equal(ui.links[key][0].hidden, true)
})

test('a complete legacy family remains available when the standard family is incomplete', async () => {
  const data = release(true, '3.8.5', '-mac-x64')
  data.assets = data.assets.filter(asset => !asset.name.endsWith('-mac-x64.zip'))
  data.assets.push(...release(true, '3.8.5').assets.filter(asset => asset.name.includes('-mac-x64-monterey.')))
  const ui = await render(data)
  assert.equal(ui.group.hidden, false)
  for (const key of intel.split(' ')) assert.ok(ui.links[key][0].href.includes('-mac-x64-monterey.'))
})

test('complete standard Intel downloads take precedence when both families exist', async () => {
  const data = release(true, '3.8.5', '-mac-x64')
  data.assets.push(...release(true, '3.8.5').assets.filter(asset => asset.name.includes('-mac-x64-monterey.')))
  const ui = await render(data)
  assert.equal(ui.group.hidden, false)
  for (const key of intel.split(' ')) assert.ok(ui.links[key][0].href.includes('-mac-x64.'))
})

test('unknown releases direct users to that release requirements instead of inheriting old macOS claims', async () => {
  const ui = await render(release(true, '3.8.8', '-mac-x64'))
  assert.equal(ui.version.textContent, 'v3.8.8')
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · See Release')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · See Release')
  assert.equal(ui.systemFallback.hidden, true)
  assert.ok(ui.systemNote.innerHTML.includes('Check the system requirements in this GitHub Release'))
  assert.doesNotMatch(ui.systemNote.innerHTML, /macOS \d|Monterey|Electron 44/)
})

test('the footer Electron version follows the known release and preserves the verified fallback', async () => {
  assert.match(html, /data-release-electron-version>45\.2\.0<\/span>/)
  for (const [version, expected] of [['3.8.5', '45.0.0'], ['3.8.6', '45.0.0'], ['3.8.7', '45.2.0'], ['3.8.8', 'See Release'], ['3.8.2', '44.7.0']]) {
    const ui = await render(release(true, version, '-mac-x64'))
    assert.equal(ui.electron.textContent, expected)
  }
})

test('an incomplete primary release or invalid metadata preserves the verified fallback', async () => {
  const incomplete = release(true, '3.8.5', '-mac-x64')
  incomplete.assets = incomplete.assets.filter(asset => !asset.name.endsWith('-x64.exe'))
  const invalid = release(true, '3.8.5', '-mac-x64')
  invalid.body = 'no release identity'
  for (const data of [incomplete, invalid]) {
    const ui = await render(data)
    assert.equal(ui.version.textContent, 'v3.8.7')
    assert.equal(ui.panel.getAttribute('data-release-state'), 'fallback')
    assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 15+')
    assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 15+')
    assert.equal(ui.systemFallback.hidden, false)
    assert.equal(ui.systemNote.hidden, true)
    assert.equal(ui.links['mac-intel-dmg'][0].href, releaseBase + 'Agent-Pi-DSH-3.8.7-mac-x64.dmg')
  }
})

test('the 3.8.7 fallback has matching binary names, sizes, checksums and both Mac requirements', () => {
  for (const suffix of ['-x64.exe', '-mac-arm64.dmg', '-mac-arm64.zip', '-mac-x64.dmg', '-mac-x64.zip', '-linux-x86_64.AppImage', '-linux-amd64.deb']) {
    assert.ok(html.includes('href="' + releaseBase + 'Agent-Pi-DSH-3.8.7' + suffix + '"'), suffix)
  }
  for (const [key, bytes] of Object.entries({ 'windows-exe': 1238813070, 'mac-dmg': 1018689498, 'mac-intel-dmg': 1060159149, 'linux-appimage': 1077290263 })) {
    assert.equal(fallbackText('data-release-size="' + key + '"'), (bytes / 1048576).toFixed(1) + ' MB')
  }
  for (const key of ['windows-exe', 'mac-dmg', 'mac-intel-dmg', 'linux-appimage']) {
    const opening = [...html.matchAll(/<a\b[^>]*\bdata-release-asset="([^"]+)"[^>]*>/g)].filter(match => match[1] === key)
    assert.equal(opening.length, 2, key)
    const direct = opening.find(match => !match[0].includes('data-release-proxy'))[0].match(/href="([^"]+)"/)[1]
    assert.ok(opening.some(match => match[0].includes('href="https://gh-proxy.org/' + direct + '"')), key)
  }
  assert.ok(html.includes(releaseBase + 'Agent-Pi-DSH-3.8.7-x64.exe.sha256'))
  assert.ok(html.includes(releaseBase + 'Agent-Pi-DSH-3.8.7-mac-x64.dmg.sha256'))
  assert.equal(fallbackText('data-release-sha'), windowsSha)
  assert.equal(fallbackText('data-release-date'), '2026-10-31')
  assert.equal(fallbackText('data-kernel-version'), '0.2.2-alpha.2 (master snapshot)')
  assert.match(html, /data-release-system="mac-arm64">Apple Silicon · macOS 15\+/)
  assert.match(html, /data-release-system="mac-x64">Intel x64 · macOS 15\+/)
  assert.doesNotMatch(html, /Monterey|Electron 44|macOS 1[23]\+|releases\/download\/v3\.8\.2\//)
  assert.match(html, /data-release-system-note hidden><\/p>/)
})

test('an offline GitHub API preserves the embedded 3.8.7 fallback links and requirements', async () => {
  const ui = await render(null, { offline: true })
  assert.equal(ui.version.textContent, 'v3.8.7')
  assert.equal(ui.electron.textContent, '45.2.0')
  assert.equal(ui.panel.getAttribute('data-release-state'), 'fallback')
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 15+')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 15+')
  assert.equal(ui.group.hidden, false)
  assert.equal(ui.systemFallback.hidden, false)
  assert.equal(ui.systemNote.hidden, true)
  for (const [key, suffix] of Object.entries(suffixes)) {
    const expected = releaseBase + 'Agent-Pi-DSH-3.8.7' + suffix
    assert.equal(ui.links[key][0].href, expected)
    assert.equal(ui.links[key][0].hidden, false)
    if (ui.links[key][1]) assert.equal(ui.links[key][1].href, 'https://gh-proxy.org/' + expected)
  }
})

test('all release-facing HTML uses the current script cache keys and verified static identity', () => {
  for (const file of ['index.html', 'docs.html', 'code-signing-policy.html', 'privacy-policy.html']) {
    const source = readFileSync(join(website, file), 'utf8')
    const scripts = [...source.matchAll(/assets\/js\/(?:main|release-metadata)\.js\?v=([^"\s]+)/g)]
    assert.ok(scripts.length > 0, file)
    for (const script of scripts) assert.equal(script[1], '387-sync1', file)
    for (const version of source.matchAll(/data-release-version>([^<]+)</g)) assert.equal(version[1], '3.8.7', file)
    for (const sha of source.matchAll(/data-release-sha\s[^>]*>([^<]+)</g)) assert.equal(sha[1], windowsSha, file)
  }
  const docs = readFileSync(join(website, 'docs.html'), 'utf8')
  assert.match(docs, /data-kernel-pin data-kernel-pin-length="10">ce7073d512</)
  assert.doesNotMatch(docs, /Monterey|Electron 44|mac-x64-monterey/)
})

test('the older 3.8.2 API still selects its legacy downloads and historical requirements', async () => {
  const ui = await render(release(true, '3.8.2'))
  assert.equal(ui.version.textContent, 'v3.8.2')
  assert.equal(ui.electron.textContent, '44.7.0')
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 13+')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 12+')
  assert.equal(ui.systemFallback.hidden, true)
  assert.equal(ui.systemNote.hidden, false)
  assert.match(ui.systemNote.innerHTML, /3\.8\.2.*macOS 13.*macOS 12/)
  assert.ok(ui.links['mac-intel-dmg'][0].href.includes('/v3.8.2/Agent-Pi-DSH-3.8.2-mac-x64-monterey.dmg'))
})


test('3.8.7 snapshot identity selects its mainline assets and Electron 45.2 requirements', async () => {
  const ui = await render(release(true, '3.8.7', '-mac-x64'))
  assert.equal(ui.version.textContent, 'v3.8.7')
  assert.equal(ui.electron.textContent, '45.2.0')
  assert.equal(ui.group.hidden, false)
  for (const [key, suffix] of Object.entries(suffixes)) {
    const expected = 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.8.7/Agent-Pi-DSH-3.8.7' + suffix
    assert.equal(ui.links[key][0].href, expected)
    assert.equal(ui.links[key][0].hidden, false)
    if (ui.links[key][1]) assert.equal(ui.links[key][1].href, 'https://gh-proxy.org/' + expected)
  }
  assert.equal(ui.systems['mac-arm64'].textContent, 'Apple Silicon · macOS 15+')
  assert.equal(ui.systems['mac-x64'].textContent, 'Intel x64 · macOS 15+')
  assert.match(ui.systemNote.innerHTML, /3\.8\.7.*macOS 15/)
})

test('the published date uses Africa/Windhoek across the UTC day boundary', async () => {
  const data = release(true, '3.8.7', '-mac-x64')
  data.published_at = '2026-10-30T23:30:00Z'
  const ui = await render(data)
  assert.equal(ui.date.textContent, '2026-10-31')
})
