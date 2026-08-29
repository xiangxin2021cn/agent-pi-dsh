import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createDshWebUrlTracker, isAuthenticatedDshWebUrl } from '../dsh-web-url.mjs'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(desktopRoot, '../..')

test('tracker recovers the authenticated DSH URL when stdout is split across chunks', () => {
  const tracker = createDshWebUrlTracker(3080)

  assert.equal(tracker.push('booting\ndsh web: http://127.0.0.1:30'), null)
  assert.equal(
    tracker.push('80/?token=secret-token\n'),
    'http://127.0.0.1:3080/?token=secret-token',
  )
})

test('tracker rejects unauthenticated, non-loopback, and wrong-port URLs', () => {
  const tracker = createDshWebUrlTracker(3080)

  assert.equal(tracker.push('dsh web: http://127.0.0.1:3080/\n'), null)
  assert.equal(tracker.push('dsh web: http://example.com:3080/?token=secret\n'), null)
  assert.equal(tracker.push('dsh web: http://127.0.0.1:3081/?token=secret\n'), null)
})

test('authenticated URL predicate requires a loopback URL, expected port, and token', () => {
  assert.equal(isAuthenticatedDshWebUrl('http://127.0.0.1:3080/?token=secret', 3080), true)
  assert.equal(isAuthenticatedDshWebUrl('http://localhost:3080/?token=secret', 3080), true)
  assert.equal(isAuthenticatedDshWebUrl('http://127.0.0.1:3080/', 3080), false)
  assert.equal(isAuthenticatedDshWebUrl('http://127.0.0.1:3081/?token=secret', 3080), false)
  assert.equal(isAuthenticatedDshWebUrl('https://example.com:3080/?token=secret', 3080), false)
})

test('desktop boot waits without consuming the one-time authenticated URL and packages its helper', () => {
  const main = readFileSync(join(desktopRoot, 'main.mjs'), 'utf8')
  const desktopPackage = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  const payload = readFileSync(join(root, 'scripts/pack-runtime-payload.mjs'), 'utf8')
  const stamp = readFileSync(join(root, 'scripts/stamp-electron-asar-version.mjs'), 'utf8')

  assert.match(main, /advertisedUrl\.push\(chunk\)/)
  assert.match(main, /appUrl = await waitForDshUrl\(\)/)
  assert.match(main, /await dshServerAlive\(new URL\(candidate\)\.origin\)/)
  assert.match(main, /function dshServerAlive\(url\)[\s\S]*fetch\(url, \{ method: 'HEAD' \}\)/)
  assert.doesNotMatch(main, /authenticatedDshUrlAlive/)
  assert.ok(desktopPackage.build.files.includes('dsh-web-url.mjs'))
  assert.match(payload, /'dsh-web-url\.mjs'/)
  assert.match(stamp, /asar\.extractFile\(archive, 'dsh-web-url\.mjs'\)/)
  assert.match(stamp, /writeFileSync\(join\(dir, 'dsh-web-url\.mjs'\)/)
})
