import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, sep } from 'node:path'
import test from 'node:test'
import { inspectKnownPluginCompatibility, prepareKnownPluginCompatibility } from '../vendor/dshmarket/compatibility.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'reviewed-plugins-'))
  t.after(() => {
    assert.ok(realpathSync(root).startsWith(realpathSync(tmpdir()) + sep))
    rmSync(root, { recursive: true, force: true })
  })
  return root
}
function packageAt(root, name, version, source, main = './lib/index.js') {
  const directory = join(root, 'node_modules', name)
  mkdirSync(join(directory, 'lib'), { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, main }))
  writeFileSync(join(directory, 'lib/index.js'), source)
  return directory
}

test('unknown IM generations and modified reviewed-version entry bytes remain blocked', t => {
  for (const version of ['5.9.1', '5.9.2', '6.0.0']) {
    const root = fixture(t)
    packageAt(root, '@xmanrui/dsh-im', version, 'ctx.get("typertGateway").stream()')
    assert.equal(inspectKnownPluginCompatibility(root, '@xmanrui/dsh-im').status, 'incompatible')
  }
})

test('unreviewed email legacy calls remain blocked even when source resembles a guarded branch', t => {
  for (const version of ['0.14.1', '0.21.2', '0.21.3']) {
    const root = fixture(t)
    const directory = packageAt(root, 'dsh-email', version, 'export function apply() {}')
    writeFileSync(join(directory, 'lib/runtime.js'), 'const legacy = typeof ctx.settings.register === "function"; legacy ? ctx.settings.register("mail", schema) : {};')
    assert.equal(inspectKnownPluginCompatibility(root, 'dsh-email').status, 'incompatible')
  }
})

const reviewed = [
  { name: '@xmanrui/dsh-im', version: '5.9.1', files: ['lib/index.js'] },
  { name: 'dsh-email', version: '0.21.2', files: ['lib/index.js', 'lib/runtime.js', 'lib/tools.js', 'lib/approval.js', 'lib/host-config.js'] },
]
const sourceProfile = process.env.AGENT_PI_REVIEWED_PLUGIN_FIXTURE_ROOT
function copyReviewed(t, row) {
  assert.ok(sourceProfile && isAbsolute(sourceProfile), 'Pass the explicit reviewed candidate profile')
  const root = fixture(t), directory = packageAt(root, row.name, row.version, '')
  for (const path of row.files) {
    mkdirSync(dirname(join(directory, path)), { recursive: true })
    copyFileSync(join(sourceProfile, 'node_modules', row.name, path), join(directory, path))
  }
  return { root, directory }
}

for (const row of reviewed) {
  test(`reviewed ${row.name}@${row.version} is accepted without rewriting its runtime`, { skip: !sourceProfile }, t => {
    const { root, directory } = copyReviewed(t, row)
    const before = row.files.map(path => readFileSync(join(directory, path)))
    const checked = inspectKnownPluginCompatibility(root, row.name)
    assert.equal(checked.status, 'compatible', checked.reason)
    assert.equal(prepareKnownPluginCompatibility(root, row.name).changed, false)
    row.files.forEach((path, index) => assert.deepEqual(readFileSync(join(directory, path)), before[index]))
  })

  test(`reviewed ${row.name} refuses changed bytes and an escaped runtime entry`, { skip: !sourceProfile }, t => {
    const { root, directory } = copyReviewed(t, row)
    const entry = join(directory, 'lib/index.js'), original = readFileSync(entry)
    writeFileSync(entry, Buffer.concat([original, Buffer.from('\n')]))
    assert.equal(inspectKnownPluginCompatibility(root, row.name).status, 'incompatible')
    writeFileSync(entry, original)
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: row.name, version: row.version, main: '../escaped.js' }))
    assert.equal(inspectKnownPluginCompatibility(root, row.name).status, 'incompatible')
  })

  test(`reviewed ${row.name} refuses a linked library outside its package`, { skip: !sourceProfile }, t => {
    const { root, directory } = copyReviewed(t, row)
    const outside = join(root, 'outside-lib')
    mkdirSync(outside)
    for (const path of row.files) copyFileSync(join(directory, path), join(outside, path.split('/').at(-1)))
    rmSync(join(directory, 'lib'), { recursive: true })
    symlinkSync(outside, join(directory, 'lib'), process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(inspectKnownPluginCompatibility(root, row.name).status, 'incompatible')
  })
}

test('reviewed entry bytes cannot authorize a different DSH source pin', { skip: !sourceProfile }, t => {
  const product = fixture(t)
  mkdirSync(join(product, 'skills'))
  writeFileSync(join(product, 'DSH_PIN'), '0000000000000000000000000000000000000000\n')
  const previous = process.env.DSH_BUNDLED_SKILL_DIR
  process.env.DSH_BUNDLED_SKILL_DIR = join(product, 'skills')
  try {
    for (const row of reviewed) {
      const { root } = copyReviewed(t, row)
      assert.equal(inspectKnownPluginCompatibility(root, row.name).status, 'incompatible')
    }
  } finally {
    if (previous === undefined) delete process.env.DSH_BUNDLED_SKILL_DIR
    else process.env.DSH_BUNDLED_SKILL_DIR = previous
  }
})
