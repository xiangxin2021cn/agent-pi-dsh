import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSupervisedDesktopHost, RELAUNCH_REQUEST_FILE } from '../lib/restart.js'

test('Agent Pi desktop env is a supervised host', () => {
  assert.equal(isSupervisedDesktopHost({ AGENT_PI_DESKTOP: '1' }), true)
  assert.equal(isSupervisedDesktopHost({ DSH_BUNDLED_SKILL_DIR: 'C:\\skills' }), true)
})

test('plain CLI dsh is not a supervised host', () => {
  assert.equal(isSupervisedDesktopHost({}), false)
  assert.equal(isSupervisedDesktopHost({ AGENT_PI_DESKTOP: '0' }), false)
})

test('relaunch marker name stays stable for the Electron shell', () => {
  assert.equal(RELAUNCH_REQUEST_FILE, 'request-relaunch.json')
})
