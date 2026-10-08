import { constants } from 'node:buffer'
import { closeSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { AcDbDxfFiler } = require('@mlightcad/data-model')
const chunkCharacters = 1024 * 1024

/** Only called in the isolated conversion worker; dxfOut itself is synchronous. */
export function writeDatabaseDxf(database, output) {
  const prototype = AcDbDxfFiler.prototype
  const writeGroup = prototype.writeGroup, toString = prototype.toString
  const fd = openSync(output, 'wx')
  let scratch, characters = 0, complete = false
  const flush = () => {
    if (!scratch) return
    writeFileSync(fd, toString.call(scratch), 'utf8')
    scratch = undefined
    characters = 0
  }
  try {
    // The pinned model has no output-sink option. Keep its DXF section traversal,
    // handles and formatting, but collect formatted groups in a bounded filer.
    prototype.writeGroup = function (code, value) {
      if (this.database !== database) return writeGroup.call(this, code, value)
      if (value == null) return this
      let length
      if (typeof value === 'string') length = value.length
      else if (value instanceof Uint8Array) length = value.byteLength * 2
      else if (typeof value === 'number') length = Math.max(String(value).length, this.precision + 32)
      else if (typeof value === 'boolean') length = 1
      else { value = String(value); length = value.length }
      const groupCharacters = String(Math.trunc(code)).length + length + 2
      if (groupCharacters >= constants.MAX_STRING_LENGTH) throw new Error('DXF 单个组值超过 JavaScript 字符串上限；未截断输出。')
      if (characters + groupCharacters > chunkCharacters) flush()
      scratch ||= new AcDbDxfFiler({ database, precision: this.precision, version: this.version })
      writeGroup.call(scratch, code, value)
      characters += groupCharacters
      if (characters >= chunkCharacters) flush()
      return this
    }
    prototype.toString = function () {
      if (this.database !== database) return toString.call(this)
      flush()
      return ''
    }
    database.dxfOut()
    complete = true
  } finally {
    prototype.writeGroup = writeGroup
    prototype.toString = toString
    closeSync(fd)
    if (!complete) unlinkSync(output)
  }
}
