import type { BusinessProjectRecord } from '../../../packages/business-projects/types.ts'
import { usesTenderControlProfile } from './modules.ts'
import { getTenderResponseCoverage } from './tender-responses.ts'

/** All three UI surfaces read the same projection; a corrupt ledger remains visible. */
export function responseCoverageForProject(cwd: string, project: BusinessProjectRecord) {
  if (project.module !== 'china-tender' && !usesTenderControlProfile(project)) return null
  try { return getTenderResponseCoverage(cwd, project.projectId, project.module === 'china-tender' ? 'china-tender' : 'tender') }
  catch (error) { return { projectId: project.projectId, error: String((error as Error).message || error) } }
}
