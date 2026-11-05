import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, lstatSync, openSync, readFileSync, readdirSync, readSync, realpathSync, unlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, relative, sep } from 'node:path'
import {
  buildUniverRuntimeReceipt, defaultUniverRuntimeLockPath, productionRuntimeManifest, validateUniverRuntimeLock,
  verifyUniverRuntimeReceipt, writeUniverRuntimeReceipt,
} from './install-univer-runtime-deps.mjs'

const thinMachO = new Set([0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe])

function isMachO(path) {
  const fd = openSync(path, 'r')
  const header = Buffer.alloc(8)
  try {
    if (readSync(fd, header, 0, header.length, 0) !== header.length) return false
  } finally {
    closeSync(fd)
  }
  const magic = header.readUInt32BE(0)
  if (thinMachO.has(magic)) return true
  const swapped = magic === 0xbebafeca || magic === 0xbfbafeca
  if (!swapped && magic !== 0xcafebabe && magic !== 0xcafebabf) return false
  // Java classes share the fat Mach-O magic, but have a class version here.
  const architectures = swapped ? header.readUInt32LE(4) : header.readUInt32BE(4)
  return architectures > 0 && architectures < 20
}

export async function collectMacSigningPaths(contents, runtime, isBinaryFile) {
  const paths = []
  async function walk(directory) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) continue
      if (stat.isDirectory()) {
        await walk(path)
        if (['.app', '.framework'].includes(extname(name))) paths.push(path)
      } else if (stat.isFile()) {
        if (extname(name) === '.cstemp') unlinkSync(path)
        else if (path.startsWith(`${runtime}${sep}`) ? isMachO(path) : await isBinaryFile(path)) paths.push(path)
      }
    }
  }
  await walk(contents)
  return paths
}

export default async function sign(options, packager) {
  assert.equal(process.platform, 'darwin')
  const preview = process.env.AGENT_PI_MACOS_ADHOC_PREVIEW === '1'
  assert.equal(options.identity === '-', preview, 'Ad-hoc signing is limited to the Mac preview job')
  const developerId = '-R=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.13] exists'
  const require = createRequire(join(packager.projectDir, 'package.json'))
  const signerRequire = createRequire(require.resolve('@electron/osx-sign'))
  assert.equal(signerRequire('../../package.json').version, '1.3.3', 'Review the macOS signing walk before updating osx-sign')
  const { signAsync } = require('@electron/osx-sign')
  const walkApi = signerRequire('./util.js')
  const { isBinaryFile } = signerRequire('isbinaryfile')
  const runtime = join(options.app, 'Contents/Resources/runtime')
  const runtimeReal = realpathSync(runtime)
  const plugin = join(runtime, 'product/vendor/dsh-univer-office')
  const manifest = JSON.parse(readFileSync(join(plugin, 'package.json'), 'utf8'))
  const { dependencies } = productionRuntimeManifest(manifest)
  const lock = validateUniverRuntimeLock(manifest, JSON.parse(readFileSync(defaultUniverRuntimeLockPath, 'utf8')))
  const before = verifyUniverRuntimeReceipt(plugin, dependencies, lock)
  const previousIgnore = options.ignore ?? []

  const signOptions = {
    ...options,
    ignore: [].concat(previousIgnore, path => {
      if (!path.startsWith(`${runtime}${sep}`)) return false
      const stat = lstatSync(path)
      if (!stat.isDirectory() && (!stat.isFile() || !isMachO(path))) return true
      // pnpm links are sealed as links by the outer app signature.
      return realpathSync(path) !== join(runtimeReal, relative(runtime, path))
    }),
    optionsForFile(path) {
      if (path === options.app) {
        // osx-sign signs all nested code before the outer app resource seal.
        const signed = buildUniverRuntimeReceipt(plugin, dependencies, lock)
        for (const [packageIndex, pkg] of signed.packages.entries()) {
          const original = before.packages[packageIndex]
          assert.equal(pkg.lockPath, original?.lockPath)
          for (const [fileIndex, file] of pkg.files.entries()) {
            const prior = original.files[fileIndex]
            assert.equal(file.path, prior?.path)
            if (file.sha256 === prior.sha256) continue
            const binary = join(plugin, pkg.lockPath, file.path)
            assert.ok(pkg.native && /\.(?:node|dylib)$/.test(file.path) && isMachO(binary), `Unexpected change while signing Univer: ${file.path}`)
            execFileSync('/usr/bin/codesign', [
              '--verify', '--strict', ...(preview ? [] : [developerId]), binary,
            ], { stdio: 'inherit' })
            original.files[fileIndex] = file
          }
        }
        assert.deepEqual(signed, before, 'Unexpected Univer runtime inventory changes during signing')
        writeUniverRuntimeReceipt(plugin, dependencies, lock)
        verifyUniverRuntimeReceipt(plugin, dependencies, lock)
      }
      return options.optionsForFile?.(path)
    },
  }

  // osx-sign 1.3.3 walks with stat and recursive Promise.all before applying
  // ignore rules. Following the pnpm links exhausts handles and heap.
  const originalWalk = walkApi.walkAsync
  assert.equal(typeof originalWalk, 'function')
  try {
    walkApi.walkAsync = contents => {
      assert.equal(contents, join(options.app, 'Contents'))
      return collectMacSigningPaths(contents, runtime, isBinaryFile)
    }
    await signAsync(signOptions)
  } finally {
    walkApi.walkAsync = originalWalk
  }
}
