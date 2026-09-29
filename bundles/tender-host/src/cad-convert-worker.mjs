import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web'

const require = createRequire(import.meta.url)
const { AcDbDatabase, acdbHostApplicationServices } = require('@mlightcad/data-model')
const { AcDbLibreDwgConverter } = require('@mlightcad/libredwg-converter')

async function main(source, output) {
  const workers = resolve(dirname(fileURLToPath(import.meta.url)), '../../tender-web/lib/cad-viewer/workers')
  const libredwg = await LibreDwg.create(workers.replaceAll('\\', '/'))
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
      return { model: result.database, data: result.stats }
    } finally {
      libredwg.dwg_free(pointer)
    }
  }
  const database = new AcDbDatabase()
  acdbHostApplicationServices().workingDatabase = database
  await converter.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), database)
  writeFileSync(output, database.dxfOut())
}

main(process.argv[2], process.argv[3]).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
