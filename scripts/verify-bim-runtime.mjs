import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyBimPublicRelease } from './bim-public-release.mjs'

const coldEnvironment = () => ({ SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP,
  PATH: join(process.env.SystemRoot || 'C:\\Windows', 'System32'), PYTHONDONTWRITEBYTECODE: '1' })

export function verifyBimRuntime(directory, { publicRelease = false, sourceArchive } = {}) {
  const root = realpathSync(directory)
  const receipt = JSON.parse(readFileSync(join(root, 'BIM-RUNTIME-RECEIPT.json'), 'utf8'))
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.platform, 'win32-x64')
  if (publicRelease) verifyBimPublicRelease(root, { sourceArchive })
  assert.ok(receipt.files.length > 100)
  const seen = new Set()
  for (const file of receipt.files) {
    const path = realpathSync(resolve(root, file.path)), rel = relative(root, path)
    assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), 'Runtime file escaped directory')
    assert.ok(!seen.has(file.path), 'Duplicate runtime file')
    seen.add(file.path)
    const data = readFileSync(path)
    assert.equal(data.length, file.bytes, file.path)
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.path)
  }
  // Reject files added outside the recorded closure (except interpreter caches).
  const walk = (path) => { for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue
    const file = join(path, entry.name)
    assert.ok(!entry.isSymbolicLink(), 'Runtime symlink is not portable')
    if (entry.isDirectory()) walk(file)
    else assert.ok(entry.name === 'BIM-RUNTIME-RECEIPT.json' || seen.has(relative(root, file).replaceAll('\\', '/')), `Unrecorded runtime file: ${file}`)
  } }
  walk(root)
  const code = `import sys,json,pathlib,ifcopenshell,ifcopenshell.geom,numpy,shapely,isodate,dateutil,lark,typing_extensions,six
root=pathlib.Path(sys.executable).resolve().parent
modules=[ifcopenshell,numpy,shapely,isodate,dateutil,lark,typing_extensions,six]
assert all(pathlib.Path(m.__file__).resolve().is_relative_to(root) for m in modules)
assert pathlib.Path(sys.prefix).resolve()==root
assert all(pathlib.Path(p).resolve().is_relative_to(root) for p in sys.path)
import ifcopenshell.api.project,ifcopenshell.api.root,ifcopenshell.api.unit,ifcopenshell.api.context,ifcopenshell.api.geometry
f=ifcopenshell.api.project.create_file()
ifcopenshell.api.root.create_entity(f,ifc_class='IfcProject',name='Runtime test')
ifcopenshell.api.unit.assign_unit(f,units=[ifcopenshell.api.unit.add_si_unit(f,unit_type='LENGTHUNIT')])
c=ifcopenshell.api.context.add_context(f,context_type='Model')
b=ifcopenshell.api.context.add_context(f,context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=c)
e=ifcopenshell.api.root.create_entity(f,ifc_class='IfcWall')
r=ifcopenshell.api.geometry.add_wall_representation(f,context=b,length=2,height=3,thickness=0.2)
ifcopenshell.api.geometry.assign_representation(f,product=e,representation=r)
s=ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(),e)
assert len(s.geometry.verts)>0
print(json.dumps({'python':sys.executable,'version':sys.version.split()[0],'ifcopenshell':ifcopenshell.__version__,'core':ifcopenshell.version_core,'vertices':len(s.geometry.verts)//3}))`
  const result = spawnSync(join(root, 'python/python.exe'), ['-I', '-B', '-c', code], { env: coldEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000 })
  assert.equal(result.status, 0, result.error?.message || result.stderr)
  const actual = JSON.parse(result.stdout)
  assert.equal(actual.version, receipt.pythonVersion, 'BIM Python differs from its receipt')
  assert.equal(actual.ifcopenshell, receipt.ifcopenshellVersion, 'BIM API differs from its receipt')
  assert.equal(actual.core, receipt.coreVersion, 'BIM native core differs from its receipt')
  return { ...actual, files: receipt.files.length, bytes: receipt.files.reduce((sum, f) => sum + f.bytes, 0), redistribution: receipt.redistribution }
}

export function verifyBimProduct(product) {
  const workspace = mkdtempSync(join(tmpdir(), 'agent-pi-bim-runtime-'))
  try {
    const code = `import assert from 'node:assert/strict'; import { realpathSync } from 'node:fs';
const { runBim } = await import(process.argv[1]);
const cwd=process.argv[2], expected=process.argv[3];
const health=await runBim(cwd,{action:'health'});
assert.equal(health.engine.available,true,JSON.stringify(health.issues));
assert.equal(realpathSync(health.engine.pythonExecutable),realpathSync(expected));
const generated=await runBim(cwd,{action:'generate',outputPath:'model.ifc',projectName:'Cold engine',components:[{id:'slab',type:'IfcSlab',name:'slab',sizeMeters:[10,2,0.3],positionMeters:[0,0,0]}]});
const measured=await runBim(cwd,{action:'geometry',sourcePath:'model.ifc',expectedSha256:generated.source.sha256});
assert.equal(measured.coverage.measured,1,JSON.stringify(measured.issues));
assert.ok(Math.abs(measured.elements[0].netVolumeM3-6)<1e-8);
console.log(JSON.stringify({bundledPython:health.engine.pythonExecutable,generatedIfc:true,volumeM3:measured.elements[0].netVolumeM3}));`
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code,
      pathToFileURL(join(product, 'packages/engineering-bim/index.ts')).href, workspace,
      join(product, 'bundles/engineering-bim/runtime/python/python.exe')], { env: coldEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 90000 })
    assert.equal(result.status, 0, result.error?.message || result.stderr)
    return JSON.parse(result.stdout)
  } finally { rmSync(workspace, { recursive: true, force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const product = process.argv[2] === '--product' ? resolve(process.argv[3]) : null
    const directory = product ? join(product, 'bundles/engineering-bim/runtime') : process.argv[2]
    const sourceIndex = process.argv.indexOf('--source-archive')
    if (sourceIndex !== -1) assert.ok(process.argv[sourceIndex + 1], '--source-archive requires a file')
    const result = verifyBimRuntime(directory, { publicRelease: process.argv.includes('--public'), sourceArchive: sourceIndex === -1 ? undefined : process.argv[sourceIndex + 1] })
    if (product) result.product = verifyBimProduct(product)
    console.log(JSON.stringify(result, null, 2))
  }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
