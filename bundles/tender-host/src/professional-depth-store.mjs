import { createHash } from 'node:crypto'
import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTaskStore } from '../../../packages/professional-tasks/task.ts'

// Keep the public depth shape for existing clients; the task is the only writer.
export function createDepthStore(home, options = {}) {
  const tasks = createTaskStore(home)
  const legacyPath = (id) => join(home, 'agent-pi', 'professional-depth', `${createHash('sha256').update(id).digest('hex')}.json`)
  const project = (task) => ({ ...structuredClone(task.quality),
    brief: { ...task.quality.brief, purpose: task.brief.objective || task.quality.brief.purpose },
    sessionId: task.sessionId, revision: task.revision })
  const readTask = (id) => {
    const owner = options.sessionIdFor?.(id) || id
    const path = legacyPath(owner)
    const task = tasks.read(owner)
    if (!existsSync(path) || task.migration?.depth) return task
    const legacy = JSON.parse(readFileSync(path, 'utf8'))
    if (legacy.sessionId !== owner) throw new Error('专业深度状态与当前对话不匹配。')
    const backup = `${path}.before-task-integration`
    if (!existsSync(backup)) copyFileSync(path, backup, constants.COPYFILE_EXCL)
    return tasks.importLegacyQuality(owner, legacy)
  }
  return {
    read(id) {
      const task = readTask(id)
      return task.revision || task.migration?.depth ? project(task) : undefined
    },
    importLegacy(state) {
      return project(tasks.importLegacyQuality(state.sessionId, state))
    },
    write(state, actor = 'user') {
      const task = readTask(state.sessionId)
      if (task.revision !== state.revision) throw new Error('任务要求已更新，请刷新后按最新版本修改。')
      const { sessionId, revision, ...quality } = structuredClone(state)
      const objective = actor === 'user' || !task.brief.objective ? quality.brief.purpose : task.brief.objective
      quality.brief.purpose = objective
      const patch = { quality }
      if (objective !== task.brief.objective) {
        patch.brief = { ...task.brief, objective }
        patch.briefProvenance = { ...task.briefProvenance, objective: {
          origin: actor === 'user' ? 'user' : 'inference', status: actor === 'user' ? 'explicit' : 'provisional', updatedRevision: revision + 1,
        } }
      }
      return project(tasks.update(sessionId, patch, revision, actor, { summary: '更新本次任务的专业深度与检查记录' }))
    },
  }
}
