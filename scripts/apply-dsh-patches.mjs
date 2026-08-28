import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function applyDshPatch({ dshRoot, patchPath, run = spawnSync }) {
  if (!existsSync(join(dshRoot, '.git'))) {
    throw new Error(`DSH checkout is not a Git worktree: ${dshRoot}`)
  }
  if (!existsSync(patchPath)) throw new Error(`DSH patch is missing: ${patchPath}`)

  const gitApply = (args) => run(
    'git',
    ['-C', dshRoot, 'apply', '--ignore-space-change', ...args, patchPath],
    { encoding: 'utf8', windowsHide: true },
  )
  if (gitApply(['--reverse', '--check']).status === 0) return 'already-applied'

  const check = gitApply(['--check'])
  if (check.status !== 0) {
    throw new Error(
      `Agent Pi patch does not match the pinned DSH checkout.\n${check.stderr || check.stdout || ''}`,
    )
  }
  const applied = gitApply(['--whitespace=nowarn'])
  if (applied.status !== 0) {
    throw new Error(`Failed to apply Agent Pi DSH patch.\n${applied.stderr || applied.stdout || ''}`)
  }
  return 'applied'
}

export function main(args = process.argv.slice(2)) {
  const dshRoot = resolve(args[0] || process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness'))
  const patchPath = resolve(args[1] || join(root, 'patches/deepseek-harness-agent-pi.patch'))
  const result = applyDshPatch({ dshRoot, patchPath })
  process.stdout.write(`Agent Pi DSH kernel patch: ${result}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
