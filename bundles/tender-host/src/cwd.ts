export function sessionCwd(exec: { agent?: { session?: { header?: { cwd?: string } } } }): string {
  const cwd = exec.agent?.session?.header?.cwd
  if (!cwd) throw new Error('No session workspace cwd. Open or create a dsh workspace first.')
  return cwd
}

export function textResult(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}
