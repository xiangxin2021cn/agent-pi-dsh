import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export interface WorkSurfacePolicy {
  mode: 'shadow' | 'default'
  defaultNavigator: boolean
  artifactPath: string
  benchmarkId?: string
  reason: string
}

export function workSurfacePolicyPath(): string {
  if (process.env.AGENT_PI_WORKSURFACE_GATE) return resolve(process.env.AGENT_PI_WORKSURFACE_GATE)
  if (process.env.DSH_HOME) return resolve(process.env.DSH_HOME, 'worksurface-release-gate.json')
  return resolve(homedir(), '.agent-pi', 'worksurface-release-gate.json')
}

/** Fail closed: only an audited artifact satisfying every published threshold switches default. */
export function loadWorkSurfacePolicy(): WorkSurfacePolicy {
  const artifactPath = workSurfacePolicyPath()
  if (!existsSync(artifactPath)) {
    return { mode: 'shadow', defaultNavigator: false, artifactPath, reason: 'release-gate-missing' }
  }
  try {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as {
      schemaVersion?: number
      benchmarkId?: string
      provenance?: string
      goldReviewedByHumans?: boolean
      taskCount?: number
      routeF1?: number
      locatorValidity?: number
      unsupportedCriticalClaimRate?: number
      documentRecallGain?: number
      crossProjectLeaks?: number
      fallbackVerified?: boolean
      boqCoverageAtLeastBaseline?: boolean
    }
    const passed = artifact.schemaVersion === 1
      && artifact.provenance === 'audited-real-project'
      && artifact.goldReviewedByHumans === true
      && Number(artifact.taskCount) >= 80
      && Number(artifact.routeF1) >= 0.95
      && Number(artifact.locatorValidity) === 1
      && Number(artifact.unsupportedCriticalClaimRate) <= 0.01
      && Number(artifact.documentRecallGain) >= 0.10
      && Number(artifact.crossProjectLeaks) === 0
      && artifact.fallbackVerified === true
      && artifact.boqCoverageAtLeastBaseline === true
    return passed
      ? { mode: 'default', defaultNavigator: true, artifactPath, benchmarkId: artifact.benchmarkId, reason: 'audited-release-gate-passed' }
      : { mode: 'shadow', defaultNavigator: false, artifactPath, benchmarkId: artifact.benchmarkId, reason: 'release-gate-failed' }
  } catch {
    return { mode: 'shadow', defaultNavigator: false, artifactPath, reason: 'release-gate-corrupt' }
  }
}
