import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { addKbFile, createKbFolder, exportKbTransfer, importKbTransfer, kbOverview } from '../src/kb.ts'
import {
  KB_TRANSFER_KIND,
  looksLikeKbTransfer,
  looksLikeKbTransferName,
  openKbTransfer,
  sealKbTransfer,
} from '../src/kb-transfer.ts'
import { readUserSkill, saveUserSkill } from '../src/modules.ts'

function isolateRoots(label: string) {
  const root = mkdtempSync(join(tmpdir(), label))
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  process.env.AGENT_PI_SKILLS_ROOT = join(root, 'skills')
  mkdirSync(join(root, 'kb'), { recursive: true })
  mkdirSync(join(root, 'skills'), { recursive: true })
  return root
}

const SKILL_MD = `---
name: site-method
description: 现场方法传递夹具，仅测试导入导出。
---

# 现场方法

先读本机规范再写步骤。
`

test('sealKbTransfer and openKbTransfer round-trip a payload', () => {
  const payload = {
    kind: KB_TRANSFER_KIND,
    schemaVersion: 1 as const,
    exportedAt: '2026-08-22T00:00:00.000Z',
    items: [{
      type: 'entry' as const,
      slug: 'coto-ch1',
      name: 'CHAPTER 1.md',
      category: '规范',
      folderName: 'COTO 2020',
      manuscript: '# 1 Scope\n\nApplies to roadworks.\n',
    }],
  }
  const sealed = sealKbTransfer(payload)
  assert.equal(looksLikeKbTransfer(sealed), true)
  assert.equal(sealed.subarray(0, 4).toString('ascii'), 'APKB')
  assert.equal(sealed.includes(Buffer.from('Applies to roadworks')), false)
  const opened = openKbTransfer(sealed)
  assert.equal(opened.items[0]?.type, 'entry')
  if (opened.items[0]?.type === 'entry') {
    assert.equal(opened.items[0].manuscript.includes('Applies to roadworks'), true)
    assert.equal(opened.items[0].folderName, 'COTO 2020')
  }
})

test('openKbTransfer rejects zip, json, and a forged header', () => {
  assert.throws(() => openKbTransfer(Buffer.from('PK\x03\x04not-a-zip')), /不是 Agent Pi 传递包/)
  assert.throws(() => openKbTransfer(Buffer.from('{"kind":"agent-pi-kb-transfer"}')), /不是 Agent Pi 传递包/)
  const forged = Buffer.concat([Buffer.from('APKB'), Buffer.from([1]), Buffer.alloc(40, 7)])
  assert.throws(() => openKbTransfer(forged), /无法打开|损坏|不是本应用/)
  assert.equal(looksLikeKbTransferName('规范.apkb'), true)
  assert.equal(looksLikeKbTransferName('规范.zip'), false)
})

test('exporting a ready markdown entry and importing it restores category and folder', () => {
  const src = isolateRoots('ap-kb-xfer-src-')
  const md = join(src, '房屋规范.md')
  writeFileSync(md, '# 1.1 总则\n\n适用房屋工程。\n')
  const folder = createKbFolder('规范', '房屋规范')
  const added = addKbFile({ path: md, category: '规范', folderId: folder.id })
  assert.equal(added.entry.parseStatus, 'ready')
  const exported = exportKbTransfer({ slugs: [added.entry.slug] })
  assert.match(exported.filename, /\.apkb$/i)
  assert.equal(looksLikeKbTransfer(exported.body), true)

  isolateRoots('ap-kb-xfer-dst-')
  const imported = importKbTransfer(exported.body)
  assert.equal(imported.entries.length, 1)
  assert.equal(imported.entries[0]?.category, '规范')
  assert.equal(imported.entries[0]?.folderName, '房屋规范')
  const overview = kbOverview()
  assert.equal(overview.entries[0]?.category, '规范')
  assert.equal(overview.folders.some((item) => item.name === '房屋规范' && item.category === '规范'), true)
  assert.ok(overview.entries[0]?.folderId)
})

test('exporting a user skill and importing it into another skills root', () => {
  isolateRoots('ap-kb-xfer-skill-src-')
  saveUserSkill('site-method', SKILL_MD)
  const exported = exportKbTransfer({ skillSlugs: ['site-method'] })
  isolateRoots('ap-kb-xfer-skill-dst-')
  const imported = importKbTransfer(exported.body)
  assert.equal(imported.skills.length, 1)
  assert.equal(imported.skills[0]?.slug, 'site-method')
  assert.equal(imported.skills[0]?.created, true)
  const skill = readUserSkill('site-method')
  assert.match(skill.markdown, /先读本机规范再写步骤/)
})

test('a staged file cannot be exported', () => {
  const root = isolateRoots('ap-kb-xfer-staged-')
  process.env.AGENT_PI_KB_ROOT = join(root, 'kb')
  mkdirSync(join(root, 'kb'), { recursive: true })
  writeFileSync(join(root, 'kb', 'registry.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{
      slug: 'raw-pdf',
      name: 'scan.pdf',
      category: '规范',
      sourcePath: join(root, 'scan.pdf'),
      managedPath: '',
      originalName: 'scan.pdf',
      sourceHash: 'x',
      sizeBytes: 1,
      chunkCount: 0,
      parseStatus: 'staged',
      createdAt: 't',
      updatedAt: 't',
    }],
    removedSeeds: [],
  }))
  assert.throws(() => exportKbTransfer({ slugs: ['raw-pdf'] }), /原始文档区|解析/)
})
