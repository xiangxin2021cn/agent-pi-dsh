import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function requirePlain(path, directory = false) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error('Schedule upgrade backup requires ordinary files and directories: ' + path)
  }
}

/** Preserve the v1 schedule before the new kernel can write its v2 format. */
export function backupScheduleV1(home) {
  const root = resolve(home)
  const source = join(root, 'storages', 'schedule.json')
  if (!existsSync(source)) return { status: 'absent' }
  requirePlain(root, true)
  requirePlain(join(root, 'storages'), true)
  requirePlain(source)
  const before = readFileSync(source)
  const document = JSON.parse(before.toString('utf8'))
  if (document.unit?.name !== 'schedule') throw new Error('Unrecognized schedule storage envelope')
  if (document.unit.version !== 1) return { status: 'already-new-format' }

  const parent = join(root, '.runtime-install')
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  requirePlain(parent, true)
  const destination = join(parent, 'schedule-v1-before-3.8.7')
  if (existsSync(destination)) {
    requirePlain(destination, true)
    const receiptPath = join(destination, 'receipt.json')
    const backupPath = join(destination, 'schedule.json')
    requirePlain(receiptPath)
    requirePlain(backupPath)
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    const bytes = readFileSync(backupPath)
    if (receipt.schemaVersion !== 1 || receipt.bytes !== bytes.length || receipt.sha256 !== sha256(bytes)) {
      throw new Error('Existing schedule v1 backup failed integrity verification')
    }
    return { status: 'retained', path: destination }
  }

  const stage = mkdtempSync(join(parent, '.schedule-v1-'))
  try {
    const backupPath = join(stage, 'schedule.json')
    writeFileSync(backupPath, before, { flag: 'wx', mode: 0o600 })
    if (!readFileSync(backupPath).equals(before) || !readFileSync(source).equals(before)) {
      throw new Error('Schedule changed during backup; exit the old application and retry')
    }
    writeFileSync(join(stage, 'receipt.json'), JSON.stringify({
      schemaVersion: 1, createdAt: new Date().toISOString(), applicationVersion: '3.8.7',
      source: 'storages/schedule.json', storageVersion: 1, bytes: before.length, sha256: sha256(before),
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    renameSync(stage, destination)
    return { status: 'created', path: destination }
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true })
  }
}
