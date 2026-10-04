import { resolve, join } from 'node:path'
import { officialProjectDir } from './outputs.ts'
import { projectDir } from './fsutil.ts'

export function isGeneratedProjectSource(cwd: string, projectId: string, path: string, module = 'tender'): boolean {
  const normalized = resolve(cwd,path).replace(/\\/g,'/').toLocaleLowerCase()
  if (normalized.includes('/agent pi outputs/') || normalized.includes('/orchestration/reports/')) return true
  return [officialProjectDir(cwd,projectId),join(projectDir(cwd,module,projectId),'orchestration','reports')].some(root=>{
    const prefix = resolve(root).replace(/\\/g,'/').toLocaleLowerCase()
    return normalized===prefix || normalized.startsWith(prefix+'/')
  })
}
