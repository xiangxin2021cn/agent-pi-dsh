import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dshRuntimeFilePolicy } from './dsh-build-receipt.mjs'
import { detailImage, languageChain, localFiles, readPackageDocument } from '../vendor/deepseek-harness/packages/util/plugin-detail/lib/index.js'

const dsh = fileURLToPath(new URL('../vendor/deepseek-harness/', import.meta.url))
const signal = new AbortController().signal
const maxBytes = 4 * 1024 * 1024

test('the native detail reader opens every experimental locale description and its preview', async () => {
  let documents = 0
  let images = 0
  const experimental = join(dsh, 'packages/experimental')
  for (const entry of readdirSync(experimental, { withFileTypes: true })) {
    const root = join(experimental, entry.name)
    if (!entry.isDirectory() || !existsSync(join(root, 'package.json')) || !existsSync(join(root, 'locale'))) continue
    const files = localFiles(root, 'fixed-source')
    for (const locale of readdirSync(join(root, 'locale')).filter(name => name.endsWith('.json'))) {
      const language = locale.slice(0, -5)
      const meta = JSON.parse(readFileSync(join(root, 'locale', locale), 'utf8')).meta
      if (meta?.detail === undefined) continue
      const document = await readPackageDocument(files, '', languageChain(language), maxBytes, signal)
      assert.equal(document?.origin, 'locale', `${entry.name}/${locale}`)
      assert.equal(document.path, meta.detail)
      documents += 1
      for (const [, destination] of document.markdown.matchAll(/!\[[^\]]*\]\(([^\s)]+)\)/g)) {
        const image = detailImage(document.path, destination)
        if (!image) continue
        assert.ok(await files.read(image.path, maxBytes, signal), `${entry.name}/${image.path}`)
        images += 1
      }
    }
  }
  assert.ok(documents > 0)
  assert.ok(images > 0)
})

test('Windows payload filtering retains package docs and artwork but excludes root development docs', { skip: process.platform !== 'win32' }, async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'ap-detail-copy-'))
  const source = join(scratch, 'source')
  const staged = join(scratch, 'staged')
  const packagePath = 'packages/experimental/forge-bundle'
  try {
    mkdirSync(join(source, packagePath), { recursive: true })
    for (const relative of ['package.json', 'locale', 'docs']) {
      cpSync(join(dsh, packagePath, relative), join(source, packagePath, relative), { recursive: true })
    }
    mkdirSync(join(source, 'docs'), { recursive: true })
    writeFileSync(join(source, 'docs/developer-guide.md'), '# Do not package\n')
    const result = spawnSync('robocopy', [source, staged, '/E', '/XJ', '/R:0', '/W:0',
      '/XD', ...dshRuntimeFilePolicy.excludedDirectoryNames,
      ...dshRuntimeFilePolicy.excludedRootDirectoryNames.map(name => join(source, name)),
      '/XF', ...dshRuntimeFilePolicy.excludedFileNames, ...dshRuntimeFilePolicy.excludedFileGlobs,
      '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { encoding: 'utf8', windowsHide: true })
    assert.ifError(result.error)
    assert.ok(result.status >= 0 && result.status < 8, `robocopy exit ${result.status}`)
    assert.equal(existsSync(join(staged, 'docs')), false)
    const files = localFiles(join(staged, packagePath), 'staged')
    for (const language of ['zh', 'en']) {
      const document = await readPackageDocument(files, '', languageChain(language), maxBytes, signal)
      assert.equal(document.path, `docs/DETAIL${language === 'zh' ? '.zh' : ''}.md`)
      const destination = /!\[[^\]]*\]\(([^\s)]+)\)/.exec(document.markdown)?.[1]
      const image = detailImage(document.path, destination)
      assert.ok(image)
      assert.ok(await files.read(image.path, maxBytes, signal))
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('the native detail reader still rejects traversal and a linked document escaping its package', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'ap-detail-safe-'))
  const root = join(scratch, 'package')
  try {
    mkdirSync(join(root, 'locale'), { recursive: true })
    mkdirSync(join(scratch, 'outside'), { recursive: true })
    writeFileSync(join(scratch, 'outside/DETAIL.md'), '# Outside\n')
    const files = localFiles(root, 'fixture')
    for (const detail of ['../outside/DETAIL.md', '/outside/DETAIL.md', 'C:/outside/DETAIL.md', 'docs\\DETAIL.md']) {
      writeFileSync(join(root, 'locale/zh.json'), JSON.stringify({ meta: { detail } }))
      await assert.rejects(readPackageDocument(files, '', ['zh'], maxBytes, signal), error => error.reason === 'invalid')
    }
    symlinkSync(join(scratch, 'outside'), join(root, 'docs'), process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(root, 'locale/zh.json'), '{"meta":{"detail":"docs/DETAIL.md"}}')
    await assert.rejects(readPackageDocument(files, '', ['zh'], maxBytes, signal), error => error.reason === 'invalid')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
