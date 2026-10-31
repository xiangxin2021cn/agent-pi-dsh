#!/usr/bin/env node

import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const product = 'do.agentpi.dsh'
const journalName = '.agent-pi-runtime-upgrade.json'
const targets = [
  ['dependencies', 'resources/runtime/deepseek-harness/node_modules', 'resources/runtime/.agent-pi-previous-dsh-node-modules'],
  ['projectBuild', 'resources/runtime/product/bundles/project-plan/target', 'resources/runtime/.agent-pi-previous-project-plan-target'],
]

function stat(path) {
  try { return lstatSync(path) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function ordinaryDirectories(path) {
  for (let current = path; ; current = dirname(current)) {
    const entry = stat(current)
    if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
      throw new Error(`Refusing a linked or non-directory managed path: ${current}`)
    }
    if (current === dirname(current)) break
  }
}

function ordinaryFile(path) {
  ordinaryDirectories(dirname(path))
  const entry = stat(path)
  if (entry && (!entry.isFile() || entry.isSymbolicLink())) throw new Error(`Refusing a non-regular control file: ${path}`)
  return entry
}

function readJournal(path, root) {
  const entry = ordinaryFile(path)
  if (!entry) return null
  if (entry.size > 4096) throw new Error('Runtime upgrade journal is too large')
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (Object.keys(value).sort().join(',') !== 'hadOriginal,installRoot,phase,product,schemaVersion'
      || value.schemaVersion !== 1 || value.product !== product || value.installRoot !== root
      || !['active', 'committing'].includes(value.phase)
      || !value.hadOriginal || Object.keys(value.hadOriginal).sort().join(',') !== 'dependencies,projectBuild'
      || targets.some(([name]) => typeof value.hadOriginal[name] !== 'boolean')) {
    throw new Error('Invalid runtime upgrade journal; no managed directory was changed')
  }
  return value
}

function context(installRoot, repairPending) {
  if (typeof installRoot !== 'string' || !isAbsolute(installRoot)) throw new Error('An absolute installation root is required')
  const root = resolve(installRoot)
  if (root === parse(root).root || root.startsWith('\\\\')) throw new Error('A dedicated local installation directory is required')
  ordinaryDirectories(root)
  const journal = join(root, journalName)
  const pending = `${journal}.new`
  const state = readJournal(journal, root)
  const pendingFile = ordinaryFile(pending)
  let pendingState = null
  if (pendingFile) {
    try { pendingState = readJournal(pending, root) } catch {
      // An interrupted write is recoverable only after ownership and both
      // fixed backup paths have been checked below.
    }
  }
  const receipt = join(root, '.agent-pi-install-root.ini')
  let newInstall = false
  if (ordinaryFile(receipt)) {
    const bytes = readFileSync(receipt)
    const text = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8').replace(/^\uFEFF/, '')
    const section = text.match(/^\[AgentPiDSH\]\s*\r?\n([^\[]*)/m)?.[1]
    const fields = Object.fromEntries((section || '').split(/\r?\n/).filter(line => line.includes('=')).map(line => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    }))
    if (fields.Schema !== '1' || fields.Product !== product || resolve(fields.InstallLocation || '.') !== root) {
      throw new Error('The installation root receipt does not own this mainline installation')
    }
  } else {
    const entries = stat(root) ? readdirSync(root).filter(name => name !== '.' && name !== '..') : []
    const legacy = ordinaryFile(join(root, 'agent-pi-DSH.exe'))
      && (ordinaryFile(join(root, 'resources/app.asar')) || ordinaryFile(join(root, 'resources/app.asar.old')))
    if (basename(root) !== 'Agent Pi DSH' || (entries.length > 0 && !legacy && !state && !pendingState)) {
      throw new Error('The installation root is neither a new dedicated directory nor a recognized legacy installation')
    }
    newInstall = entries.length === 0
  }
  const paths = targets.map(([name, current, backup]) => ({ name, current: join(root, current), backup: join(root, backup) }))
  for (const item of paths) {
    ordinaryDirectories(item.current)
    ordinaryDirectories(item.backup)
    if (stat(item.backup) && (state || pendingState) && !(state || pendingState).hadOriginal[item.name]) {
      throw new Error('Unexpected backup in runtime upgrade transaction')
    }
  }
  if (!state && paths.some(item => stat(item.backup))) throw new Error('Unowned runtime upgrade backup already exists')
  // A crash before atomic rename cannot have begun deleting backups. A valid
  // current journal supersedes even a truncated regular pending write. Without
  // that journal, neither backup may exist before an initial write is cleared.
  if (pendingFile) {
    if (repairPending) {
      if (state || !pendingState) rmSync(pending)
      else renameSync(pending, journal)
    }
  }
  return { root, journal, pending, paths, state: state || pendingState, newInstall }
}

function writeJournal(ctx, value) {
  ordinaryFile(ctx.journal)
  if (ordinaryFile(ctx.pending)) throw new Error('A runtime journal write is already pending')
  writeFileSync(ctx.pending, `${JSON.stringify(value)}\n`, { flag: 'wx' })
  renameSync(ctx.pending, ctx.journal)
  ctx.state = value
}

function removeDirectory(path) {
  ordinaryDirectories(path)
  if (stat(path)) {
    // Node unlinks nested junctions instead of traversing into shared peers.
    rmSync(path, { recursive: true, maxRetries: 3, retryDelay: 100 })
  }
}

function finishCommit(ctx) {
  for (const item of ctx.paths) removeDirectory(item.backup)
}

function restore(ctx) {
  if (!ctx.state) return
  if (ctx.state.phase === 'committing') throw new Error('The verified commit must finish before staging or rollback')
  for (const item of ctx.paths.toReversed()) {
    if (stat(item.backup)) {
      if (!ctx.state.hadOriginal[item.name]) throw new Error('Unexpected backup in runtime upgrade transaction')
      removeDirectory(item.current)
      mkdirSync(dirname(item.current), { recursive: true })
      renameSync(item.backup, item.current)
    } else if (!ctx.state.hadOriginal[item.name]) {
      removeDirectory(item.current)
    }
  }
  rmSync(ctx.journal)
  ctx.state = null
}

export function stageRuntime(installRoot, mode) {
  if (!['check', 'stage', 'rollback', 'commit', 'finish'].includes(mode)) throw new Error('Only check, stage, rollback, commit, or finish is allowed')
  const ctx = context(installRoot, mode !== 'check')
  if (mode === 'check') return { mode, installRoot: ctx.root, active: !!ctx.state, committing: ctx.state?.phase === 'committing' }
  if (mode === 'rollback') {
    restore(ctx)
  } else if (mode === 'commit') {
    if (ctx.state) {
      if (ctx.state.phase === 'active') {
        const modules = ctx.paths[0].current
        ordinaryDirectories(join(modules, '.pnpm'))
        if (!stat(join(modules, '.pnpm')) || stat(ctx.paths[1].current)) throw new Error('Fresh production dependencies or removed project build output are not ready')
        writeJournal(ctx, { ...ctx.state, phase: 'committing' })
      }
      finishCommit(ctx)
    }
  } else if (mode === 'finish') {
    if (ctx.state) {
      const officeBackup = join(ctx.root, 'resources/runtime/product/vendor/.agent-pi-univer-previous')
      const archiveBackup = join(ctx.root, 'resources/app.asar.old')
      ordinaryDirectories(officeBackup)
      ordinaryFile(archiveBackup)
      if (ctx.state.phase !== 'committing' || ctx.paths.some(item => stat(item.backup)) || stat(officeBackup) || stat(archiveBackup)) {
        throw new Error('The verified runtime, Office, and app archive backups must be committed before finishing')
      }
      rmSync(ctx.journal)
      ctx.state = null
    }
  } else {
    restore(ctx)
    for (const item of ctx.paths) if (stat(item.backup)) throw new Error(`Unowned upgrade backup already exists: ${item.backup}`)
    mkdirSync(ctx.root, { recursive: true })
    if (ctx.newInstall) {
      // A failed first install must remain recognizable to the next installer,
      // even after its unverified app.asar and dependency tree are rolled back.
      writeFileSync(join(ctx.root, '.agent-pi-install-root.ini'), `[AgentPiDSH]\nSchema=1\nProduct=${product}\nInstallLocation=${ctx.root}\n`, { flag: 'wx' })
    }
    const hadOriginal = Object.fromEntries(ctx.paths.map(item => [item.name, !!stat(item.current)]))
    writeJournal(ctx, { schemaVersion: 1, product, installRoot: ctx.root, phase: 'active', hadOriginal })
    try {
      for (const item of ctx.paths) if (hadOriginal[item.name]) {
        mkdirSync(dirname(item.backup), { recursive: true })
        renameSync(item.current, item.backup)
      }
    } catch (error) {
      restore(ctx)
      throw error
    }
  }
  return { mode, installRoot: ctx.root, active: !!ctx.state }
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2) throw new Error('Usage: installer-stage-runtime.mjs <absolute-install-root> <check|stage|rollback|commit|finish>')
  const result = stageRuntime(args[0], args[1])
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.committing) process.exitCode = 20
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
