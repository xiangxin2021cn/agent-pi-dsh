import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const HOST_RESTART_FILE = 'host-restart.json'

export type RestartReason = 'oom' | 'crash'

export interface HostRestartRecord {
  at: number
  code: number | null
  reason: RestartReason
  pending: boolean
}

export function hostRestartPath(home = process.env.DSH_HOME || ''): string {
  return join(String(home || ''), HOST_RESTART_FILE)
}

export function classifyRestartReason(code: number | null | undefined): RestartReason {
  const n = Number(code)
  if (n === 134 || n === 3221226505 || n === 3221225794 || n === 3221225477) return 'oom'
  return 'crash'
}

export function writeHostRestart(
  home: string,
  rec: { at: number; code: number | null; reason?: RestartReason },
): HostRestartRecord {
  const next: HostRestartRecord = {
    at: rec.at,
    code: rec.code,
    reason: rec.reason || classifyRestartReason(rec.code),
    pending: true,
  }
  const path = hostRestartPath(home)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(next)}\n`, 'utf8')
  return next
}

export function readHostRestart(home = process.env.DSH_HOME || ''): HostRestartRecord | null {
  const path = hostRestartPath(home)
  if (!path || path === HOST_RESTART_FILE || !existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<HostRestartRecord>
    if (!raw || typeof raw.at !== 'number') return null
    return {
      at: raw.at,
      code: typeof raw.code === 'number' ? raw.code : null,
      reason: raw.reason === 'oom' ? 'oom' : 'crash',
      pending: raw.pending !== false,
    }
  } catch {
    return null
  }
}

export function ackHostRestart(at: number, home = process.env.DSH_HOME || ''): HostRestartRecord | null {
  const current = readHostRestart(home)
  if (!current) return null
  if (current.at !== at) return current
  const next = { ...current, pending: false }
  writeFileSync(hostRestartPath(home), `${JSON.stringify(next)}\n`, 'utf8')
  return next
}

export function hostStatus(home = process.env.DSH_HOME || ''): { restart: HostRestartRecord | null } {
  return { restart: readHostRestart(home) }
}

export function buildCrashResumePrompt(restart: { reason?: string } | null | undefined): string {
  const oom = restart && restart.reason === 'oom'
  return `【主机已自动重启 — 请在本会话继续】
${oom ? '上次是内存不足退出。并行仍走 dsh 原生 subagent/workflow；不要一次扇出十几路同一进程工人。' : '宿主进程异常退出后已自动拉起。'}
不要盲目重跑已有 Official Output。
TOOL_OUTCOME_UNKNOWN：只读/幂等可重做；写文件前先看目标在不在。
从中断处继续当前阶段。`
}
