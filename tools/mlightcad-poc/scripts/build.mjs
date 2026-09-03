import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const toolRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(
  toolRoot,
  '../../bundles/tender-web/lib/cad-viewer'
)
const nodeModulesRoot = join(toolRoot, 'node_modules')
const fontAssetRoot = join(toolRoot, 'assets/fonts')
const fallbackFontFile = 'SourceHanSansCN-Regular.otf'

await build({
  configFile: join(toolRoot, 'vite.config.ts'),
  configLoader: 'runner',
  root: toolRoot
})
await copyRuntimeAssets()
await writeThirdPartyNotices()
await copyFile(join(toolRoot, 'LICENSE-BOUNDARY.md'), join(outputRoot, 'LICENSE-BOUNDARY.md'))

console.log(`MLightCAD PoC built at ${outputRoot}`)

async function copyRuntimeAssets() {
  const workerDir = join(outputRoot, 'workers')
  await mkdir(workerDir, { recursive: true })

  const assets = [
    {
      from: join(
        nodeModulesRoot,
        '@mlightcad/cad-simple-viewer/dist/mtext-renderer-worker.js'
      ),
      to: join(workerDir, 'mtext-renderer-worker.js')
    },
    {
      from: join(
        nodeModulesRoot,
        '@mlightcad/libredwg-converter/dist/libredwg-parser-worker.js'
      ),
      to: join(workerDir, 'libredwg-parser-worker.js')
    },
    {
      from: join(
        nodeModulesRoot,
        '@mlightcad/libredwg-converter/dist/libredwg-web.wasm'
      ),
      to: join(workerDir, 'libredwg-web.wasm')
    }
  ]

  for (const asset of assets) {
    await copyFile(asset.from, asset.to)
  }

  const fontInfoDir = join(outputRoot, 'resources/fonts')
  await mkdir(fontInfoDir, { recursive: true })
  await copyFile(
    join(fontAssetRoot, fallbackFontFile),
    join(fontInfoDir, fallbackFontFile)
  )
  await copyFile(
    join(fontAssetRoot, 'OFL-1.1.txt'),
    join(fontInfoDir, 'OFL-1.1.txt')
  )
  await writeFile(
    join(fontInfoDir, 'fonts.json'),
    JSON.stringify(
      [
        {
          name: [
            'Source Han Sans CN',
            'SourceHanSansCN-Regular',
            'simsun',
            '宋体',
            'txt',
            'romans',
            'arial',
            'helvetica',
            'standard',
            'Microsoft YaHei',
            '微软雅黑',
            'simhei',
            '黑体'
          ],
          file: fallbackFontFile,
          type: 'mesh'
        }
      ],
      null,
      2
    ) + '\n',
    'utf8'
  )
  await writeFile(
    join(fontInfoDir, 'README.txt'),
    [
      'Source Han Sans CN 2.005 is bundled as the offline CAD text fallback.',
      'It is the unmodified Simplified Chinese subset OTF from Adobe and is',
      'distributed under SIL Open Font License 1.1; see OFL-1.1.txt.',
      'Custom SHX and big-font drawings can use substituted glyphs.'
    ].join('\n') + '\n',
    'utf8'
  )
}

async function writeThirdPartyNotices() {
  const lock = JSON.parse(await readFile(join(toolRoot, 'package-lock.json'), 'utf8'))
  const runtimePackages = collectRuntimePackages(lock)
  const licenseDir = join(outputRoot, 'licenses')
  await mkdir(licenseDir, { recursive: true })
  const fontLicenseTarget = 'SourceHanSansCN-OFL-1.1.txt'
  await copyFile(
    join(fontAssetRoot, 'OFL-1.1.txt'),
    join(licenseDir, fontLicenseTarget)
  )

  const rows = []
  for (const packageName of runtimePackages) {
    const packageDir = join(nodeModulesRoot, ...packageName.split('/'))
    const manifest = JSON.parse(
      await readFile(join(packageDir, 'package.json'), 'utf8')
    )
    const entries = await readdir(packageDir, { withFileTypes: true })
    const licenseFiles = entries
      .filter(
        (entry) =>
          entry.isFile() && /^(licen[cs]e|copying|notice)([-.]|$)/i.test(entry.name)
      )
      .map((entry) => entry.name)

    const copiedFiles = []
    for (const fileName of licenseFiles) {
      const targetName = `${sanitizePackageName(packageName)}-${fileName}`
      await copyFile(join(packageDir, fileName), join(licenseDir, targetName))
      copiedFiles.push(`licenses/${targetName}`)
    }

    rows.push({
      name: packageName,
      version: manifest.version,
      license: manifest.license || 'Not declared',
      files: copiedFiles
    })
  }

  await addLicenseFallback(
    rows,
    '@mlightcad/mtext-parser',
    '@mlightcad/mtext-renderer',
    'MIT'
  )
  await attachGplLicense(rows)
  rows.push({
    name: 'Source Han Sans CN',
    version: '2.005',
    license: 'OFL-1.1',
    note: 'Unmodified official Simplified Chinese subset OTF; Reserved Font Name Source',
    files: [`licenses/${fontLicenseTarget}`]
  })

  const lines = [
    '# Third-party notices',
    '',
    'Generated from the production dependency closure in `package-lock.json`.',
    '',
    '| Package | Version | Declared license | Bundled license note | License copy |',
    '| --- | --- | --- | --- | --- |'
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.version} | ${row.license} | ${row.note || 'No metadata conflict observed'} | ${row.files.join('<br>') || 'See SPDX declaration'} |`
    )
  }

  lines.push(
    '',
    '> Important: the DWG parser path (`@mlightcad/libredwg-converter` and',
    '> `@mlightcad/libredwg-web`) is GPL-3.0. See `LICENSE-BOUNDARY.md` before',
    '> distributing this PoC as part of Agent Pi DSH.',
    ''
  )

  await writeFile(
    join(outputRoot, 'THIRD_PARTY_NOTICES.md'),
    lines.join('\n'),
    'utf8'
  )

  async function addLicenseFallback(rows, targetName, sourceName, spdx) {
    const target = rows.find((row) => row.name === targetName)
    if (!target || target.files.length > 0) return

    const source = rows.find((row) => row.name === sourceName)
    if (!source || source.files.length === 0) {
      throw new Error(`No ${spdx} license text available for ${targetName}`)
    }

    const sourcePath = join(outputRoot, source.files[0])
    const targetNameSafe = `${sanitizePackageName(targetName)}-${spdx}.txt`
    const targetPath = join(licenseDir, targetNameSafe)
    await copyFile(sourcePath, targetPath)
    target.files.push(
      `licenses/${targetNameSafe} (standard ${spdx} text copied from ${sourceName})`
    )
  }

  async function attachGplLicense(rows) {
    const gplTarget = join(licenseDir, 'GPL-3.0.txt')
    await copyFile(join(toolRoot, 'licenses/GPL-3.0.txt'), gplTarget)

    const converter = rows.find(
      (row) => row.name === '@mlightcad/libredwg-converter'
    )
    const web = rows.find((row) => row.name === '@mlightcad/libredwg-web')
    if (!converter || !web) {
      throw new Error('LibreDWG runtime packages are missing from the lockfile')
    }

    converter.note =
      'npm manifest says GPL-3.0; upstream bundled LICENSE text says MIT'
    converter.files = converter.files.map(
      (file) => `${file} (verbatim upstream file; text says MIT)`
    )
    converter.files.push(
      'licenses/GPL-3.0.txt (GNU official text for manifest-declared GPL-3.0)'
    )

    web.note =
      'npm manifest says GPL-3.0; npm tarball contains no LICENSE file'
    web.files.push(
      'licenses/GPL-3.0.txt (GNU official text for manifest-declared GPL-3.0)'
    )
  }
}

function collectRuntimePackages(lock) {
  const packages = lock.packages || {}
  const rootDependencies = packages['']?.dependencies || {}
  const pending = Object.keys(rootDependencies)
  const visited = new Set()

  while (pending.length > 0) {
    const packageName = pending.shift()
    if (!packageName || visited.has(packageName)) continue
    visited.add(packageName)

    const lockEntry = packages[`node_modules/${packageName}`]
    if (!lockEntry) {
      throw new Error(`Missing lock entry for runtime package ${packageName}`)
    }

    const linkedRuntimeDependencies = {
      ...(lockEntry.dependencies || {}),
      ...(lockEntry.optionalDependencies || {}),
      ...(lockEntry.peerDependencies || {})
    }

    for (const dependencyName of Object.keys(linkedRuntimeDependencies)) {
      const dependencyEntry = packages[`node_modules/${dependencyName}`]
      if (dependencyEntry && dependencyEntry.dev !== true) {
        pending.push(dependencyName)
      }
    }
  }

  return [...visited].sort((left, right) => left.localeCompare(right))
}

function sanitizePackageName(packageName) {
  return packageName.replace(/^@/, '').replaceAll('/', '-')
}
