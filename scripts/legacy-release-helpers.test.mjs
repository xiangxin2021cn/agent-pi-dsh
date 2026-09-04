import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const helpers = [
  {
    path: join(root, 'release', 'push-github-homepage.mjs'),
    replacement: /README\.md must be updated through the normal reviewed branch\/PR flow/,
  },
  {
    path: join(root, 'release', 'push-workflow.mjs'),
    replacement: /publish-win-and-trigger-platforms\.ps1 -Tag v3\.6\.0/,
  },
]

test('legacy direct-write release helpers fail before GitHub authentication or API access', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'agent-pi-retired-release-'))
  const ghLog = join(fixture, 'gh.log')
  const apiLog = join(fixture, 'api.log')
  const preload = join(fixture, 'block-network.cjs')

  writeFileSync(preload, `
const { appendFileSync } = require('node:fs')
globalThis.fetch = async (...args) => {
  appendFileSync(process.env.API_LOG, String(args[0]) + '\\n')
  throw new Error('unexpected GitHub API access')
}
`)

  if (process.platform === 'win32') {
    writeFileSync(join(fixture, 'gh.cmd'), '@echo off\r\n>>"%GH_LOG%" echo called\r\nexit /b 97\r\n')
  } else {
    const gh = join(fixture, 'gh')
    writeFileSync(gh, '#!/bin/sh\nprintf "called\\n" >> "$GH_LOG"\nexit 97\n')
    chmodSync(gh, 0o755)
  }

  const searchPath = `${fixture}${delimiter}${process.env.PATH ?? ''}`
  try {
    for (const helper of helpers) {
      const source = readFileSync(helper.path, 'utf8')
      assert.doesNotMatch(source, /api\.github\.com|gh auth token|execSync\s*\(|fetch\s*\(/)

      const result = spawnSync(process.execPath, [helper.path], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          API_LOG: apiLog,
          GH_LOG: ghLog,
          NODE_OPTIONS: `--require=${preload}`,
          PATH: searchPath,
          Path: searchPath,
        },
        windowsHide: true,
      })

      assert.notEqual(result.status, 0)
      assert.match(`${result.stdout}\n${result.stderr}`, /retired and intentionally fails closed/)
      assert.match(`${result.stdout}\n${result.stderr}`, helper.replacement)
      assert.equal(existsSync(ghLog), false, `${helper.path} invoked gh`)
      assert.equal(existsSync(apiLog), false, `${helper.path} accessed the GitHub API`)
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
