import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadWorkSurfacePolicy } from '../src/worksurface-policy.ts'

test('default navigator fails closed until an audited real-project gate passes every threshold', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ap-worksurface-policy-')), 'gate.json')
  process.env.AGENT_PI_WORKSURFACE_GATE = path
  assert.equal(loadWorkSurfacePolicy().defaultNavigator, false)
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, benchmarkId: 'dev', provenance: 'development-fixture', goldReviewedByHumans: false, taskCount: 96, routeF1: 1, locatorValidity: 1, unsupportedCriticalClaimRate: 0, documentRecallGain: 1, crossProjectLeaks: 0, fallbackVerified: true, boqCoverageAtLeastBaseline: true }))
  assert.equal(loadWorkSurfacePolicy().defaultNavigator, false)
  writeFileSync(path, JSON.stringify({ schemaVersion: 1, benchmarkId: 'real-v1', provenance: 'audited-real-project', goldReviewedByHumans: true, taskCount: 96, routeF1: 0.96, locatorValidity: 1, unsupportedCriticalClaimRate: 0.005, documentRecallGain: 0.11, crossProjectLeaks: 0, fallbackVerified: true, boqCoverageAtLeastBaseline: true }))
  assert.equal(loadWorkSurfacePolicy().defaultNavigator, true)
})
