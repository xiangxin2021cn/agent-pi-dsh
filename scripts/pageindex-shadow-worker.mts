/** Development-only PageIndex shadow worker. It is not included in the desktop runtime. */
import { resolve } from 'node:path'
import { createPageIndexShadow } from '../bundles/tender-host/src/pageindex-shadow.ts'

function value(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv.includes('--help') || !value('--manuscript')) {
  console.log('Usage: tsx scripts/pageindex-shadow-worker.mts --manuscript <manuscript.md> [--original <source.pdf>] [--pack <pack.json>] [--output <pageindex-tree.json>] [--force]')
  process.exit(process.argv.includes('--help') ? 0 : 2)
}

const status = createPageIndexShadow({
  manuscriptPath: resolve(value('--manuscript')!),
  originalPath: value('--original') ? resolve(value('--original')!) : undefined,
  packPath: value('--pack') ? resolve(value('--pack')!) : undefined,
  outputPath: value('--output') ? resolve(value('--output')!) : undefined,
  force: process.argv.includes('--force'),
})
console.log(JSON.stringify({ state: status.state, path: status.path, reason: status.reason, nodeCount: status.tree?.nodes.length ?? 0 }, null, 2))
