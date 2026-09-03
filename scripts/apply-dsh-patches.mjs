import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Refuse product builds from a modified official DSH checkout. */
export function assertDshCheckoutClean({ dshRoot, expectedCommit = null, run = spawnSync }) {
  if (!existsSync(join(dshRoot, '.git'))) {
    throw new Error(`DSH checkout is not a Git worktree: ${dshRoot}`)
  }
  const result = run(
    'git',
    ['-C', dshRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8', windowsHide: true },
  )
  if (result.status !== 0) {
    throw new Error(`Failed to inspect the official DSH checkout.\n${result.stderr || result.stdout || ''}`)
  }
  const dirty = String(result.stdout || '').trim()
  if (dirty) {
    throw new Error(
      `Official DSH checkout must remain byte-clean; move Agent Pi behavior to product overlays.\n${dirty}`,
    )
  }
  if (expectedCommit) {
    const head = run('git', ['-C', dshRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true })
    if (head.status !== 0) {
      throw new Error(`Failed to resolve the official DSH checkout commit.\n${head.stderr || head.stdout || ''}`)
    }
    const actualCommit = String(head.stdout || '').trim()
    if (actualCommit !== expectedCommit) {
      throw new Error(`Official DSH checkout is ${actualCommit}; DSH_PIN requires ${expectedCommit}`)
    }
  }
  return 'clean'
}

/** Backward-compatible entrypoint now enforcing the no-kernel-patch rule. */
export function prepareDshKernel({ dshRoot, run = spawnSync }) {
  return assertDshCheckoutClean({ dshRoot, run })
}

export function main(args = process.argv.slice(2)) {
  const positionals = args.filter((arg) => !arg.startsWith('--'))
  const dshRoot = resolve(positionals[0] || process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness'))
  const expectedCommit = readFileSync(join(root, 'DSH_PIN'), 'utf8').trim()
  const result = assertDshCheckoutClean({ dshRoot, expectedCommit })
  process.stdout.write(`Agent Pi DSH kernel guard: ${result} upstream checkout\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
