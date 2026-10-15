import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const website = join(import.meta.dirname, '..')
const main = readFileSync(join(website, 'assets/js/main.js'), 'utf8')
const metadata = readFileSync(join(website, 'assets/js/release-metadata.js'), 'utf8')
const suffixes = {
  'windows-exe': '-x64.exe',
  'mac-dmg': '-mac-arm64.dmg',
  'linux-appimage': '-linux-x86_64.AppImage',
  'mac-intel-dmg': '-mac-x64-monterey.dmg',
  'mac-intel-zip': '-mac-x64-monterey.zip',
  'mac-intel-sha': '-mac-x64-monterey.dmg.sha256',
}
const intel = 'mac-intel-dmg mac-intel-zip mac-intel-sha'

function element(attributes = {}) {
  return {
    textContent: 'fallback', hidden: false, href: 'fallback',
    setAttribute(key, value) { attributes[key] = value },
    getAttribute(key) { return attributes[key] ?? null },
    hasAttribute(key) { return Object.hasOwn(attributes, key) },
  }
}

function release(withIntel = true) {
  const version = '3.8.3'
  return {
    tag_name: 'v' + version, published_at: '2026-10-15T10:00:00Z',
    body: '<!-- agent-pi-release-meta: ' + JSON.stringify({ schema: 1, appVersion: version, kernel: { releaseTag: 'dsh-v0.2.1-alpha.2', commit: 'a'.repeat(40) } }) + ' -->',
    assets: Object.entries(suffixes).filter(([key]) => withIntel || !key.startsWith('mac-intel')).map(([key, suffix]) => ({
      name: 'Agent-Pi-DSH-' + version + suffix, state: 'uploaded', size: 1048576,
      digest: 'sha256:' + 'b'.repeat(64),
      browser_download_url: 'https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v' + version + '/Agent-Pi-DSH-' + version + suffix,
    })),
  }
}

async function render(data) {
  const version = element()
  const group = element({ 'data-require-release-asset': intel })
  const missing = element({ 'data-missing-release-asset': intel })
  const links = Object.fromEntries(Object.keys(suffixes).map(key => [key, [element(), element({ 'data-release-proxy': '' })]]))
  const sizes = Object.fromEntries(Object.keys(suffixes).map(key => [key, element()]))
  const context = {
    window: {}, fetch: async () => ({ ok: true, json: async () => data }),
    document: {
      getElementById: () => element(),
      querySelectorAll(selector) {
        if (selector === '[data-rel-version], [data-release-version]' || selector === '[data-rel-version]') return [version]
        if (selector === '[data-require-release-asset], [data-missing-release-asset]') return [group, missing]
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
  return { version, group, missing, links, sizes }
}

test('complete Intel assets update together and retain accelerator prefixes', async () => {
  const ui = await render(release())
  assert.equal(ui.version.textContent, 'v3.8.3')
  assert.equal(ui.group.hidden, false)
  assert.equal(ui.missing.hidden, true)
  for (const key of intel.split(' ')) {
    assert.equal(ui.links[key][1].href, 'https://gh-proxy.org/' + ui.links[key][0].href)
    assert.ok(ui.links[key][0].href.includes('/v3.8.3/Agent-Pi-DSH-3.8.3-mac-x64-monterey.'))
  }
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
