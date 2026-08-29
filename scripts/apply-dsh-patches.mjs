import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nativeAlphaVersion = '0.1.2-alpha.1'
const nativeAlphaMarkers = [
  'apps/cli/package.json',
  'packages/api/session-controller/package.json',
  'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
]

function isNativeAlphaLayout(dshRoot) {
  try {
    const manifest = JSON.parse(readFileSync(join(dshRoot, 'package.json'), 'utf8'))
    return manifest.version === nativeAlphaVersion
      && nativeAlphaMarkers.every((path) => existsSync(join(dshRoot, path)))
  } catch {
    return false
  }
}

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

export function prepareDshKernel({
  dshRoot,
  patchPath,
  alphaPatchPath = join(root, 'patches/deepseek-harness-agent-pi-alpha1.patch'),
  purpose = 'release',
  run = spawnSync,
}) {
  if (isNativeAlphaLayout(dshRoot)) {
    const result = applyDshPatch({ dshRoot, patchPath: alphaPatchPath, run })
    return `native-alpha1-${purpose}-${result}`
  }
  return applyDshPatch({ dshRoot, patchPath, run })
}

export function main(args = process.argv.slice(2)) {
  const purpose = args.includes('--development') ? 'development' : 'release'
  const positionals = args.filter((arg) => arg !== '--development')
  const dshRoot = resolve(positionals[0] || process.env.DSH_CHECKOUT || join(root, 'vendor/deepseek-harness'))
  const patchPath = resolve(positionals[1] || join(root, 'patches/deepseek-harness-agent-pi.patch'))
  const alphaPatchPath = resolve(positionals[2] || join(root, 'patches/deepseek-harness-agent-pi-alpha1.patch'))
  const result = prepareDshKernel({ dshRoot, patchPath, alphaPatchPath, purpose })
  process.stdout.write(`Agent Pi DSH kernel patch: ${result}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
