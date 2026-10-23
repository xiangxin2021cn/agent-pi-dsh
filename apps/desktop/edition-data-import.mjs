import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

const DSH_ENTRIES = ['sessions', 'storages', 'attachments', 'agent-pi', 'knowledge-base', 'skills', 'integrations', 'llm-deepseek', '.credentials.yaml', 'AGENTS.md', 'agent-pi-vision.json', '.agent-presets']
const CODEX_ENTRIES = ['auth.json', 'config.toml', 'agent-pi-main-threads.json', 'sessions', 'skills']
const DATABASE = /\.(?:sqlite\d*|db)$/i
const DATABASE_PART = /\.(?:sqlite\d*|db)(?:-(?:wal|shm))?$/i
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const key = value => process.platform === 'win32' ? resolve(value).toLowerCase() : resolve(value)
const within = (root, value) => { const child = relative(root, value); return !child || !isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep) }
const fail = message => { throw new Error(message) }
async function stat(path) { try { return await lstat(path) } catch (error) { if (error.code === 'ENOENT') return null; throw error } }

async function noLinks(path, missing = false) {
  const absolute = resolve(path), root = parse(absolute).root
  let current = root
  for (const part of relative(root, absolute).split(sep).filter(Boolean)) {
    current = join(current, part)
    const info = await stat(current)
    if (!info) { if (missing) return; fail('来源目录或文件已不存在。') }
    if (info.isSymbolicLink()) fail('迁移不接受符号链接或目录联接，请使用实际资料目录。')
  }
}
async function readFileSafely(root, path) {
  await noLinks(path)
  const info = await lstat(path), actual = await realpath(path)
  if (!info.isFile() || !within(root, actual)) fail('来源包含不支持的文件或越界链接。')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const opened = await file.stat()
    if (opened.dev !== info.dev || opened.ino !== info.ino) fail('复制期间来源文件已变化，请退出旧应用后重试。')
    const bytes = await file.readFile(), after = await file.stat()
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) fail('复制期间来源文件已变化，请退出旧应用后重试。')
    return bytes
  } finally { await file.close() }
}

async function snapshot(source) {
  const files = [], directories = []
  for (const area of ['dsh-home', 'codex-home']) {
    const root = join(source, area), info = await stat(root)
    if (!info) continue
    await noLinks(root)
    if (!info.isDirectory()) fail('来源运行目录必须是实际文件夹。')
    const entries = area === 'dsh-home' ? DSH_ENTRIES : [...CODEX_ENTRIES, ...(await readdir(root)).filter(name => DATABASE_PART.test(name))]
    async function visit(path, local) {
      const info = await stat(path)
      if (!info) return
      if (info.isSymbolicLink()) fail('来源资料中包含符号链接或目录联接，未进行复制。')
      if (info.isDirectory()) {
        directories.push({ area, path: local })
        for (const name of (await readdir(path)).sort()) await visit(join(path, name), local + '/' + name)
      } else {
        const bytes = await readFileSafely(root, path)
        files.push({ area, path: local, bytes: bytes.length, sha256: sha(bytes) })
      }
    }
    for (const name of [...new Set(entries)].sort()) await visit(join(root, name), name)
  }
  files.sort((a,b) => (a.area + '/' + a.path).localeCompare(b.area + '/' + b.path))
  directories.sort((a,b) => (a.area + '/' + a.path).localeCompare(b.area + '/' + b.path))
  return { files, directories }
}
async function requireEmptyTarget(target) {
  for (const area of ['dsh-home', 'codex-home']) if (await stat(join(target, area))) fail('投标专版已有运行资料，不能覆盖。请使用尚未初始化的独立资料目录。')
}
async function checkDatabases(stage, files) {
  const native = files.filter(row => row.area === 'codex-home')
  const databases = native.filter(row => DATABASE.test(row.path))
  for (const row of native.filter(row => /-wal$/i.test(row.path) && DATABASE.test(row.path.slice(0,-4)))) {
    if (!databases.some(database => database.path === row.path.slice(0,-4))) fail('Codex 数据库缺少对应主文件，未发布迁移资料。')
  }
  if (!databases.length) return 0
  const { DatabaseSync } = await import('node:sqlite')
  // SQLite may create shared-memory sidecars even for a read-only connection.
  // Verify a disposable second copy so imported database/WAL bytes stay exact.
  const checkRoot = join(stage, '.sqlite-check')
  await mkdir(checkRoot)
  try {
    for (const [index,row] of databases.entries()) {
      const directory = join(checkRoot,String(index)); await mkdir(directory)
      const path = join(directory,'database.sqlite')
      for (const suffix of ['', '-wal', '-shm']) {
        if (!native.some(file => file.path === row.path + suffix)) continue
        const bytes = await readFileSafely(join(stage,'codex-home'),join(stage,'codex-home',row.path + suffix))
        if (!suffix && bytes.subarray(0,16).toString() !== 'SQLite format 3\0') fail('Codex 数据库格式无效，旧资料保持不变。')
        await writeFile(path + suffix,bytes,{flag:'wx',mode:0o600})
      }
      const database = new DatabaseSync(path,{readOnly:true})
      try { const results=database.prepare('PRAGMA quick_check').all(); if (!results.length || results.some(item=>Object.values(item)[0] !== 'ok')) fail('Codex 数据库副本校验未通过，未发布迁移资料。') }
      finally { database.close() }
    }
  } finally { if (!within(stage,checkRoot)) fail('数据库验证目录不在迁移暂存区中。'); await rm(checkRoot,{recursive:true,force:true}) }
  return databases.length
}

/** Called only after the customer chooses Copy and the old application has stopped.
 * The two home directories must not exist yet; other Electron userData files may exist.
 * Secrets are copied only as requested source files, never embedded in the receipt.
 */
export async function importEditionData({ sourceUserData, targetUserData, sourceConfirmedStopped } = {}) {
  if (sourceConfirmedStopped !== true) fail('请确认旧版 Agent Pi DSH 已完全退出，再复制原项目资料。')
  if (typeof sourceUserData !== 'string' || typeof targetUserData !== 'string' || !isAbsolute(sourceUserData) || !isAbsolute(targetUserData)) fail('来源和目标必须是实际的绝对资料目录。')
  const source = resolve(sourceUserData), target = resolve(targetUserData)
  if (key(source) === key(target) || within(source, target) || within(target, source)) fail('来源和投标专版资料目录必须相互独立。')
  await noLinks(source)
  if (!(await lstat(source)).isDirectory()) fail('来源资料目录不存在。')
  await noLinks(target, true)
  await mkdir(target, { recursive: true })
  await noLinks(target)
  await requireEmptyTarget(target)
  const lockPath = join(target, '.edition-data-import.lock'), lock = await open(lockPath, 'wx')
  const stage = join(target, '.edition-import-' + randomUUID()), published = []
  let staged = false
  try {
    await requireEmptyTarget(target)
    const before = await snapshot(source)
    if (!before.files.length) fail('旧目录中没有可复制的项目会话、知识库、技能或 Codex 资料。')
    await mkdir(stage); staged = true
    for (const area of ['dsh-home', 'codex-home']) await mkdir(join(stage, area))
    for (const row of before.directories) await mkdir(join(stage, row.area, row.path), { recursive: true })
    for (const row of before.files) {
      const bytes = await readFileSafely(join(source, row.area), join(source, row.area, row.path))
      if (sha(bytes) !== row.sha256) fail('复制期间来源文件已变化，请退出旧应用后重试。')
      const destination = join(stage, row.area, row.path)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
    }
    const copied = await snapshot(stage)
    if (JSON.stringify(copied) !== JSON.stringify(before)) fail('复制副本与来源快照不一致，未发布迁移资料。')
    const sqliteDatabases = await checkDatabases(stage, before.files)
    const after = await snapshot(source)
    if (JSON.stringify(after) !== JSON.stringify(before)) fail('复制期间来源文件集合或内容已变化，请确认旧应用退出后重试。')
    const count = (area, paths) => before.files.filter(row => row.area === area && paths.some(path => row.path === path || row.path.startsWith(path + '/'))).length
    const receipt = { schemaVersion: 1, importedAt: new Date().toISOString(), files: before.files.length, bytes: before.files.reduce((total,row)=>total+row.bytes,0), snapshotSha256: sha(JSON.stringify(before)),
      sessionFiles: count('dsh-home', ['sessions']), nativeThreadFiles: count('codex-home', ['agent-pi-main-threads.json', 'sessions']), knowledgeFiles: count('dsh-home', ['knowledge-base']), skillFiles: count('dsh-home', ['skills']) + count('codex-home', ['skills']), sqliteDatabases }
    await writeFile(join(stage, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    for (const area of ['dsh-home', 'codex-home']) {
      await noLinks(target)
      if (await stat(join(target, area))) fail('目标运行目录在复制期间已被创建，未覆盖现有资料。')
      await rename(join(stage, area), join(target, area)); published.push(area)
    }
    const receiptPath = join(target, 'edition-data-import-receipt.json')
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    if (!within(target,stage) || dirname(stage) !== target) fail('迁移暂存目录不在目标资料目录中。')
    await rm(stage, { recursive: true })
    return { ...receipt, receiptPath }
  } catch (error) {
    for (const area of published.reverse()) await rename(join(target, area), join(stage, area))
    if (staged) await writeFile(join(stage, 'failure.json'), JSON.stringify({ status: 'failed', message: error.message, at: new Date().toISOString() }) + '\n', { mode: 0o600 }).catch(()=>{})
    throw error
  } finally { await lock.close(); await rm(lockPath, { force: true }) }
}
