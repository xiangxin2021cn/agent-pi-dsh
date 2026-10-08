import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { writeDatabaseDxf } from './cad-dxf-output.mjs'
import { inspectDwgModel } from './cad-dwg-model-quality.mjs'

const require = createRequire(import.meta.url)
const { AcDbDatabase, acdbHostApplicationServices } = require('@mlightcad/data-model')
const { AcDbLibreDwgConverter } = require('@mlightcad/libredwg-converter')

async function main(source, output) {
  const runtime = new URL('../lib/cad-decoder/', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('CAD-HOST-CLEAN-BUILD.json', runtime), 'utf8'))
  for (const name of ['libredwg-web.mjs', 'libredwg-wasm-factory.mjs', 'libredwg-web.wasm']) {
    const artifact = manifest.artifacts.find(file => file.path === name)
    const contents = readFileSync(new URL(name, runtime))
    if (!artifact || contents.length !== artifact.bytes || createHash('sha256').update(contents).digest('hex') !== artifact.sha256) throw new Error('CAD host 解码器与 clean-build 来源记录不一致：' + name)
  }
  const { LibreDwg, Dwg_File_Type } = await import(new URL('libredwg-web.mjs', runtime))
  const { default: factory } = await import(new URL('libredwg-wasm-factory.mjs', runtime))
  const wasm = await factory({ wasmBinary: readFileSync(new URL('libredwg-web.wasm', runtime)) })
  const libredwg = LibreDwg.createByWasmInstance(wasm)
  const bytes = readFileSync(source)
  if (bytes.length < 64 || !/^(?:AC10\d\d|AC1\.\d\d)$/.test(bytes.toString('ascii', 0, 6))) {
    throw new Error('Input is not a DWG file')
  }
  const converter = new AcDbLibreDwgConverter({ useWorker: false })
  converter.parse = async (data) => {
    const pointer = libredwg.dwg_read_data(data, Dwg_File_Type.DWG)
    if (!pointer) throw new Error('MLightCAD could not read the DWG')
    try {
      const result = libredwg.convertEx(pointer)
      const quality = inspectDwgModel(result.database)
      console.log('CAD_DWG_MODEL_QUALITY ' + JSON.stringify(quality))
      if (!quality.valid) throw new Error(`DWG 块与图层关系校核未通过：图层引用 ${quality.issues.unresolvedLayers}，块引用 ${quality.issues.unresolvedBlocks}；未将失真几何用于算量。`)
      return { model: result.database, data: result.stats }
    } finally {
      libredwg.dwg_free(pointer)
    }
  }
  const database = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = database
  await converter.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), database)
  writeDatabaseDxf(database, output)
}

main(process.argv[2], process.argv[3]).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
