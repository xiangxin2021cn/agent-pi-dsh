import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { readCadDrawing } from '../src/reader.ts'
import { queryCad } from '../../../packages/engineering-cad/index.ts'

// Explicit local validation only. Real project drawings are never included in the bundle.
const [cwd, path] = process.argv.slice(2)
if (!cwd || !path) throw new Error('Usage: node real-cad-smoke.mjs <actual workspace> <relative drawing path>')
const sha = () => createHash('sha256').update(readFileSync(resolve(cwd, path))).digest('hex')
const before = sha(), start = Date.now(), { source, index, references } = await readCadDrawing(cwd, path)
if (sha() !== before) throw new Error('Original source changed during verification.')
const { byLayer, ...inventory } = index.inventory
console.log(JSON.stringify({ source, elapsedMs: Date.now() - start, originalUnchanged: true, inventory, parser: index.parser, units: index.units, layers: index.layers.length, layouts: index.layouts.length, blocks: index.blocks.length, references, issues: index.issues, textQueryTotal: queryCad(index, { types: ['TEXT', 'MTEXT', 'ATTRIB'] }).total, dimensions: queryCad(index, { types: ['DIMENSION'] }).total }, null, 2))
