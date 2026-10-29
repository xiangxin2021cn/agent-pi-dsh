import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const writingDnaReceiptSha256 = 'e5622b340e89d15b7dbe61a39b15ddd8b30a12195d158c9813e9fddb96de6796'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Keep the reviewed MIT skill and every referenced template byte-exact. */
export function verifyWritingDnaSkill(productRoot) {
  const skill = join(resolve(productRoot), 'skills/writing-dna-skill')
  const bytes = readFileSync(join(skill, 'UPSTREAM.json'))
  if (sha256(bytes) !== writingDnaReceiptSha256) throw new Error('Writing DNA upstream receipt differs from the reviewed pin')
  const receipt = JSON.parse(bytes)
  for (const entry of receipt.files) {
    const file = join(skill, entry.path)
    if (statSync(file).size !== entry.bytes || sha256(readFileSync(file)) !== entry.sha256) {
      throw new Error('Writing DNA upstream source differs: ' + entry.path)
    }
  }
  return { commit: receipt.commit, license: receipt.license, sourceFiles: receipt.files.length, receiptSha256: writingDnaReceiptSha256 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const productRoot = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..')
  console.log(JSON.stringify(verifyWritingDnaSkill(productRoot)))
}
