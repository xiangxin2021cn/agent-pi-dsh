import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bundle = join(root, 'bundles/project-plan')
const runtime = join(bundle, 'runtime')
const javaHome = process.env.JAVA_HOME
if (!javaHome || !existsSync(join(javaHome, 'bin', process.platform === 'win32' ? 'jlink.exe' : 'jlink'))) {
  throw new Error('JAVA_HOME must point to a Java 17 JDK containing jlink')
}
const suffix = process.platform === 'win32' ? '.exe' : ''
function removeBuildPath(path) {
  const child = relative(bundle, resolve(path))
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Refusing removal outside project-plan bundle')
  rmSync(path, { recursive: true, force: true })
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: bundle, stdio: 'inherit', windowsHide: true, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`)
}
const javaVersion = spawnSync(join(javaHome, 'bin', `java${suffix}`), ['-version'], { encoding: 'utf8', windowsHide: true })
if (!/version "17\./.test(javaVersion.stderr)) throw new Error('Project plan runtime requires Java 17')
const runtimeOnly = process.argv.includes('--runtime-only')
if (!runtimeOnly) {
  run(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', ['-B', '-ntp', 'compile', 'dependency:copy-dependencies', '-DoutputDirectory=target/lib'],
    { shell: process.platform === 'win32' })
  run(process.platform === 'win32' ? 'mvn.cmd' : 'mvn', ['-B', '-ntp', 'dependency:copy-dependencies', '-Dclassifier=sources', '-DoutputDirectory=target/sources'],
    { shell: process.platform === 'win32' })
  mkdirSync(runtime, { recursive: true })
  for (const name of ['lib', 'classes', 'sources']) {
    const dest = join(runtime, name)
    // Fixed children of this bundle only; never follow arbitrary input paths.
    removeBuildPath(dest)
    cpSync(join(bundle, 'target', name), dest, { recursive: true })
  }
  const jarTool = join(javaHome, 'bin', `jar${suffix}`)
  for (const name of readdirSync(join(runtime, 'lib')).filter(name => name.endsWith('.jar'))) {
    const archive = join(runtime, 'lib', name)
    const listing = spawnSync(jarTool, ['tf', archive], { encoding: 'utf8', windowsHide: true })
    if (listing.status !== 0) throw new Error(`Cannot inspect licenses in ${name}`)
    const entries = listing.stdout.split(/\r?\n/).filter(path => !path.endsWith('/') &&
      /(?:LICENSE|NOTICE|COPYING|pom\.xml$)/i.test(path))
    if (entries.some(path => path.includes('..') || path.startsWith('/') || path.includes('\\'))) throw new Error('Unsafe jar license entry')
    if (entries.length) {
      const destination = join(runtime, 'legal', name)
      mkdirSync(destination, { recursive: true })
      run(jarTool, ['xf', archive, ...entries], { cwd: destination })
    }
  }
}
for (const name of ['lib/mpxj-16.7.0.jar', 'classes/ProjectPlan.class']) {
  if (!existsSync(join(runtime, name))) throw new Error(`Missing project plan build input: ${name}`)
}
const stage = mkdtempSync(join(bundle, '.jre-build-'))
try {
  run(join(javaHome, 'bin', `jlink${suffix}`), ['--add-modules',
    'java.base,java.desktop,java.xml,java.logging,java.sql,java.naming,java.management,jdk.crypto.ec,jdk.charsets',
    '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=2', '--output', join(stage, 'jre')])
  removeBuildPath(join(runtime, 'jre'))
  renameSync(join(stage, 'jre'), join(runtime, 'jre'))
} finally { removeBuildPath(stage) }
const hashes = {}
for (const name of readdirSync(join(runtime, 'lib')).filter(name => name.endsWith('.jar')).sort()) {
  hashes[name] = createHash('sha256').update(readFileSync(join(runtime, 'lib', name))).digest('hex')
}
writeFileSync(join(runtime, 'build-receipt.json'), JSON.stringify({
  mpxj: '16.7.0', platform: process.platform, arch: process.arch,
  java: javaVersion.stderr.trim(), jars: hashes,
  source: createHash('sha256').update(readFileSync(join(bundle, 'src/ProjectPlan.java'))).digest('hex'),
  bridge: createHash('sha256').update(readFileSync(join(runtime, 'classes/ProjectPlan.class'))).digest('hex'),
}, null, 2) + '\n')
console.log(`Project plan runtime prepared: ${runtime}`)
