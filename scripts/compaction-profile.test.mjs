import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
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
  'install-univer-runtime-deps.mjs',
  'enable-desktop-web-fetch.mjs',
  'enable-desktop-codex.mjs',
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

  writePackage(root, 'bundles/tender-host', 'dsh-tender-host')
  writePackage(root, 'bundles/tender-web', 'dsh-tender-web')
  writePackage(root, 'vendor/dsh-super-injector', '@dsh-external/dsh-super-injector', { lib: true })
  writePackage(root, 'vendor/dshmarket', 'dshmarket')
  writePackage(root, 'vendor/anysearch-dsh', '@anysearch/anysearch-dsh', { lib: true })

  const dsh = join(root, 'dsh-checkout')
  writePackage(dsh, 'packages/subagent/subagent-codex', '@deepseek-ai/dsh-subagent-codex')
  writePackage(dsh, 'packages/web/web-fetch-http', '@deepseek-ai/dsh-web-fetch-http', { lib: true })
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

  const preset = '# isolated test preset\n'
  for (const id of ['standard', 'code', 'cordis']) {
    writeFixtureFile(join(dsh, 'apps/cli/config/agent-presets', id, 'agent.cordis.yml'), preset)
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

function compactionBlocks(patch) {
  return patch.match(/^- id: compaction-basic\r?\n(?:^[ \t]+.*\r?\n?)*/gm) ?? []
}

const enabledBlock = `- id: compaction-basic
  config:
    thresholdRatio: 0.72
    summarizationFallbacks:
      - provider: deepseek-official
        model: deepseek-v4-flash-vision-exp
        maxTokens: 32768
`

const disabledBlock = `- id: compaction-basic
  config:
    thresholdRatio: 0.72
`

test('missing preference enables one complete fallback while the session model stays primary', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture)

  const patch = readFileSync(fixture.patchPath, 'utf8')
  const blocks = compactionBlocks(patch)
  assert.deepEqual(blocks, [enabledBlock])
  assert.doesNotMatch(blocks[0], /summarizationProvider|summarizationModel/)
})

test('preference value 0 disables only cross-provider fallback and keeps 72 percent automatic compaction', (t) => {
  const fixture = createFixture(t)

  runInitializer(fixture, '0')

  const patch = readFileSync(fixture.patchPath, 'utf8')
  assert.deepEqual(compactionBlocks(patch), [disabledBlock])
  assert.doesNotMatch(patch, /summarizationFallbacks:/)
})

test('repeated initialization is byte-stable and does not duplicate compaction configuration', (t) => {
  const fixture = createFixture(t)
  runInitializer(fixture)
  const first = readFileSync(fixture.patchPath, 'utf8')

  runInitializer(fixture)
  const second = readFileSync(fixture.patchPath, 'utf8')

  assert.equal(second, first)
  assert.deepEqual(compactionBlocks(second), [enabledBlock])
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
