import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Static contracts inspect authored source, never tsdown printer formatting.
 * Runtime tests load lib/client.js and execute the generated DSH factory.
 */
export const clientSource = [
  '../src/client/index.js',
  '../src/client/api-client.js',
  '../src/client/file-preview-overlay.js',
  '../src/client/knowledge-base-panel.js',
  '../src/client/native-attachment-adapter.js',
  '../src/client/session-monitor.js',
  '../src/client/workbench-view.js',
  '../src/client/styles.js',
  '../src/codex-turn.ts',
  '../src/file-icons.ts',
  '../src/md-preview.ts',
  '../src/selection-rewrite.ts',
  '../src/session-transaction.ts',
  '../src/session-wake.ts',
].map((path) => readFileSync(join(here, path), 'utf8')).join('\n')
