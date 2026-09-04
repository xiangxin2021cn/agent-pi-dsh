import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const scriptNames = [
  'init-tender-profile.mjs',
  'deepseek-model-capacities.mjs',
  'heal-agent-loop-settings.mjs',
  'univer-profile-migration.mjs',
  'migrate-legacy-agent-preset-sessions.mjs',
  'enable-desktop-web-fetch.mjs',
  'enable-desktop-codex.mjs',
  'enable-desktop-compaction.mjs',
]

function writeFixtureFile(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function writePackage(root, path, name, { bundle = true, lib = false } = {}) {
  writeFixtureFile(join(root, path, 'package.json'), `${JSON.stringify({
    name,
    version: '0.0.0-test',
    ...(bundle ? { dsh: { bundle: {} } } : {}),
  })}\n`)
  if (lib) writeFixtureFile(join(root, path, 'lib/index.js'), 'export {}\n')
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'agent-pi-compaction-profile-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  for (const name of scriptNames) {
    const destination = join(root, 'scripts', name)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(sourceRoot, 'scripts', name), destination)
  }
  cpSync(
    join(sourceRoot, 'bundles/agent-pi-compaction'),
    join(root, 'bundles/agent-pi-compaction'),
    {
      recursive: true,
      // The initializer wires ignored runtime junctions here. They are host
      // state, not fixture input, and cpSync can crash while cloning them on
      // Windows. The fixture creates its own junctions against dsh-checkout.
      filter: (source) => !source.split(/[\\/]/).includes('node_modules'),
    },
  )

  writePackage(root, 'bundles/tender-host', 'dsh-tender-host')
  writePackage(root, 'bundles/tender-web', 'dsh-tender-web')
  writePackage(root, 'vendor/dsh-super-injector', '@dsh-external/dsh-super-injector', { lib: true })
  writePackage(root, 'vendor/dshmarket', 'dshmarket')
  copyFileSync(join(sourceRoot, 'vendor/dshmarket/compatibility.js'), join(root, 'vendor/dshmarket/compatibility.js'))
  writePackage(root, 'vendor/anysearch-dsh', '@anysearch/anysearch-dsh', { lib: true })

  const dsh = join(root, 'dsh-checkout')
  writePackage(dsh, 'packages/subagent/subagent-codex', '@deepseek-ai/dsh-subagent-codex')
  writePackage(dsh, 'packages/web/web-fetch-http', '@deepseek-ai/dsh-web-fetch-http', { lib: true })
  writePackage(dsh, 'packages/compaction/compaction-basic', '@deepseek-ai/dsh-compaction-basic', { bundle: false, lib: true })
  for (const name of [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-attachment',
    '@deepseek-ai/dsh-credentials',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-skill',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-web',
    '@deepseek-ai/schemastery',
  ]) {
    writePackage(dsh, join('node_modules', ...name.split('/')), name, { bundle: false })
  }
  mkdirSync(join(dsh, 'node_modules/.pnpm/@openai+codex@0.0.0-test'), { recursive: true })

  const preset = `- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
  config:
    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'

    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'
- id: delegation
  name: cordis:group
  group: true
  config:
    - id: tool-subagent-codex
      name: '@deepseek-ai/dsh-tool-subagent'
      disabled: true
      config:
        provider: codex
`
  for (const id of ['standard', 'ptc', 'minimal', 'cordis']) {
    writeFixtureFile(
      join(dsh, 'packages/preset/agent-presets/presets', id, 'agent.cordis.yml'),
      preset,
    )
  }
  for (const name of ['agent.cordis.yml', 'preset.yml', 'router-bootstrap.mjs', 'router-core.mjs']) {
    writeFixtureFile(join(root, 'vendor/dsh-router-standard/preset', name), preset)
  }

  return {
    root,
    dsh,
    home: join(root, 'dsh-home'),
    patchPath: join(root, 'dsh-home/profiles/tender/cordis.patch.yml'),
    settingsPath: join(root, 'dsh-home/settings.yaml'),
  }
}

function runInitializer(fixture, fallbackPreference) {
  const env = {
    ...process.env,
    DSH_CHECKOUT: fixture.dsh,
    DSH_HOME: fixture.home,
    AGENT_PI_SKIP_UNIVER_INSTALL: '1',
    AGENT_PI_OFFICIAL_PLUGIN_ADD: '0',
  }
  delete env.AGENT_PI_SKILLS_ROOT
  delete env.DSH_BUNDLED_SKILL_DIR
  if (fallbackPreference === undefined) delete env.AGENT_PI_COMPACTION_FALLBACK
  else env.AGENT_PI_COMPACTION_FALLBACK = fallbackPreference

  const result = spawnSync(process.execPath, [join(fixture.root, 'scripts/init-tender-profile.mjs')], {
    cwd: fixture.root,
    encoding: 'utf8',
    env,
    windowsHide: true,
  })
  assert.equal(result.status, 0, `initializer failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  return result
}

function presetTexts(fixture) {
  return [
    ...['standard', 'ptc', 'cordis'].map((id) => readFileSync(join(
      fixture.home,
      '.agent-pi-presets',
      id,
      'agent.cordis.yml',
    ), 'utf8')),
    readFileSync(join(fixture.home, '.agent-presets/router-standard/agent.cordis.yml'), 'utf8'),
  ]
}

test('missing preference enables one complete fallback while the session model stays primary', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture)

  const patch = readFileSync(fixture.patchPath, 'utf8')
  assert.doesNotMatch(patch, /^- id: compaction-basic$/m)
  for (const preset of presetTexts(fixture)) {
    assert.match(
      preset,
      /name: ['"]?dsh-agent-pi-compaction['"]?\r?\n      config:/,
    )
    assert.equal((preset.match(/thresholdRatio: 0\.72/g) ?? []).length, 1)
    assert.equal((preset.match(/summarizationFallbacks:/g) ?? []).length, 1)
    assert.match(preset, /provider: deepseek-official/)
    assert.match(preset, /model: deepseek-v4-flash-vision-exp/)
    assert.match(preset, /maxTokens: 32768/)
    assert.doesNotMatch(preset, /summarizationProvider|summarizationModel/)
  }
})

test('Agent Pi system preset copies receive the Codex product overlay without mutating DSH', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture)

  for (const id of ['standard', 'ptc', 'cordis']) {
    const official = readFileSync(join(
      fixture.dsh,
      'packages/preset/agent-presets/presets',
      id,
      'agent.cordis.yml',
    ), 'utf8')
    const product = readFileSync(join(
      fixture.home,
      '.agent-pi-presets',
      id,
      'agent.cordis.yml',
    ), 'utf8')
    assert.match(official, /tool-subagent-codex[\s\S]*?disabled: true/)
    assert.doesNotMatch(product, /tool-subagent-codex[\s\S]*?disabled: true/)
    assert.match(product, /name: ['"]?dsh-agent-pi-compaction['"]?/)
  }
})

test('alpha.1 managed overlay reuses the built-in web fetch provider id', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture)

  const patch = readFileSync(fixture.patchPath, 'utf8')
  assert.doesNotMatch(patch, /- insert:\r?\n[\s\S]*?- id: web-fetch-http/)
  assert.match(patch, /- id: web\r?\n  config:\r?\n[\s\S]*?fetchProvider: http/)
})

test('preference value 0 disables only cross-provider fallback and keeps 72 percent automatic compaction', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture, '0')

  const patch = readFileSync(fixture.patchPath, 'utf8')
  assert.doesNotMatch(patch, /summarizationFallbacks:/)
  assert.doesNotMatch(patch, /^- id: compaction-basic$/m)
  for (const preset of presetTexts(fixture)) {
    assert.equal((preset.match(/thresholdRatio: 0\.72/g) ?? []).length, 1)
    assert.doesNotMatch(preset, /summarizationFallbacks:/)
  }
})

test('repeated initialization is byte-stable and does not duplicate compaction configuration', (t) => {
  const fixture = createFixture(t)
  runInitializer(fixture)
  const firstPatch = readFileSync(fixture.patchPath, 'utf8')
  const firstPreset = readFileSync(join(
    fixture.home,
    '.agent-pi-presets/standard/agent.cordis.yml',
  ), 'utf8')

  runInitializer(fixture)
  const secondPatch = readFileSync(fixture.patchPath, 'utf8')
  const secondPreset = readFileSync(join(
    fixture.home,
    '.agent-pi-presets/standard/agent.cordis.yml',
  ), 'utf8')

  assert.equal(secondPatch, firstPatch)
  assert.equal(secondPreset, firstPreset)
  assert.equal((secondPreset.match(/thresholdRatio: 0\.72/g) ?? []).length, 1)
  assert.equal((secondPreset.match(/summarizationFallbacks:/g) ?? []).length, 1)
})


test('legacy code preset default migrates to standard while valid defaults remain untouched', (t) => {
  const fixture = createFixture(t)
  writeFixtureFile(fixture.settingsPath, 'agent-presets:\n  default: code\nlocale:\n  preference: zh\n')
  runInitializer(fixture)
  const migrated = readFileSync(fixture.settingsPath, 'utf8')
  assert.match(migrated, /agent-presets:\r?\n  default: standard/)
  assert.match(migrated, /locale:\r?\n  preference: zh/)
  assert.doesNotMatch(migrated, /default: code/)

  writeFixtureFile(fixture.settingsPath, 'agent-presets:\n  default: router-standard\n')
  runInitializer(fixture)
  const preserved = readFileSync(fixture.settingsPath, 'utf8')
  assert.match(preserved, /agent-presets:\r?\n  default: router-standard/)
  assert.doesNotMatch(preserved, /default: standard/)
})

test('initializer migrates a persisted legacy code session before DSH resumes it', (t) => {
  const fixture = createFixture(t)
  const path = join(fixture.home, 'sessions/project/session-legacy-code/session.jsonl')
  const event = `${JSON.stringify({
    type: 'user/message', seq: 0, time: 2, data: { content: 'preserve this event' },
  })}\n`
  writeFixtureFile(path, `${JSON.stringify({
    type: 'session',
    version: 0,
    id: 'session-legacy-code',
    createdAt: 1,
    cwd: fixture.root,
    delegationDepth: 0,
    agentPreset: 'code',
  })}\n${event}`)

  runInitializer(fixture)

  const lines = readFileSync(path, 'utf8').split('\n')
  assert.equal(JSON.parse(lines[0]).agentPreset, 'standard')
  assert.equal(`${lines[1]}\n`, event)
})
test('unrelated user provider and model settings remain byte-for-byte unchanged', (t) => {
  const fixture = createFixture(t)
  const settings = `agent-default-model:
  provider: custom-provider
  model: custom-model
custom-provider:
  apiKey: keep-secret-reference
  models:
    - id: custom-model
      contextWindow: 777777
      maxTokens: 12345
`
  writeFixtureFile(fixture.settingsPath, settings)

  runInitializer(fixture)

  assert.equal(readFileSync(fixture.settingsPath, 'utf8'), settings)
})

test('an unmarked custom overlay is preserved byte-for-byte', (t) => {
  const fixture = createFixture(t)
  const customPatch = `# user-owned overlay
- id: custom-plugin
  config:
    keep: exactly
`
  writeFixtureFile(fixture.patchPath, customPatch)

  runInitializer(fixture)

  assert.equal(readFileSync(fixture.patchPath, 'utf8'), customPatch)
})

test('alpha.1 preserves dsh-im installation but does not activate the incompatible bundle', (t) => {
  const fixture = createFixture(t)
  const profileDir = join(fixture.home, 'profiles/tender')
  writePackage(profileDir, 'node_modules/@xmanrui/dsh-im', '@xmanrui/dsh-im')
  writeFixtureFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-tender',
    private: true,
    dependencies: { '@xmanrui/dsh-im': '^3.2.0' },
    dsh: { profile: { bundles: ['@xmanrui/dsh-im'] } },
  }, null, 2)}\n`)

  runInitializer(fixture)

  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  assert.equal(manifest.dependencies['@xmanrui/dsh-im'], '^3.2.0')
  assert.doesNotMatch(JSON.stringify(manifest.dsh.profile.bundles), /@xmanrui\/dsh-im/)
})

test('public runtime preserves a user-installed Univer package instead of replacing it from vendor', (t) => {
  const fixture = createFixture(t)
  const newline = String.fromCharCode(10)
  const bundled = join(fixture.root, 'vendor/dsh-univer-office')
  writeFixtureFile(join(bundled, 'package.json'), JSON.stringify({
    name: 'dsh-univer-office',
    version: '0.2.9',
    dsh: { bundle: {} },
  }) + newline)
  writeFixtureFile(join(bundled, 'lib/index.js'), 'export {}' + newline)
  writeFixtureFile(
    join(bundled, 'lib/client.js'),
    'var inject = ["slots", "locale", "uiConversation"];' + newline
    + 'ctx.uiConversation.events.register(univerTurnDefinition);' + newline
    + 'const chat = props.useConversation((snapshot) => snapshot.views.get("chat"));' + newline
    + 'for (const turn of chat.timeline.turns.values()) {}' + newline,
  )

  const profileDir = join(fixture.home, 'profiles/tender')
  const installed = join(profileDir, 'node_modules/dsh-univer-office')
  writeFixtureFile(join(installed, 'package.json'), JSON.stringify({
    name: 'dsh-univer-office',
    version: '0.2.10',
    dsh: { bundle: {} },
  }) + newline)
  writeFixtureFile(join(installed, 'lib/index.js'), 'export {}' + newline)
  writeFixtureFile(
    join(installed, 'lib/client.js'),
    'var inject = ["slots", "locale", "uiConversation"];' + newline
    + 'ctx.uiConversation.events.register(univerTurnDefinition);' + newline
    + 'for (const turn of session.chat.timeline.turns.values()) {}' + newline,
  )
  writeFixtureFile(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-tender',
    private: true,
    dependencies: { 'dsh-univer-office': '^0.2.10' },
    dsh: { profile: { bundles: ['dsh-univer-office'] } },
  }, null, 2) + newline)

  runInitializer(fixture)

  const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
  const client = readFileSync(join(profileDir, 'node_modules/dsh-univer-office/lib/client.js'), 'utf8')
  assert.equal(manifest.dependencies['dsh-univer-office'], '^0.2.10')
  assert.ok(client.includes('ctx.uiConversation.events.register(univerTurnDefinition)'))
  assert.ok(client.includes('session.chat.timeline'))
})
