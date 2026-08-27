import assert from 'node:assert/strict'
import { test } from 'node:test'
import { standardizeKbMarkdown } from '../src/kb-md-standardize.ts'

const ppv = [
  'Table A1.2.3-1: Peak particle velocity limits',
  '<table><tr><td>STRUCTURE / PIPELINE TYPE AND CONDITION</td><td>MAXIMUM PEAK PARTICLE VELOCITY (PPV) (mm/sec measured at a frequency of 50 Hz)</td></tr>',
  '<tr><td>Fragile buildings (old and / or poorly constructed)</td><td>2,5</td></tr>',
  '<tr><td>Old or low quality houses</td><td>5,0</td></tr>',
  '<tr><td>Steel pipelines</td><td>12,5</td></tr></table>',
].join('\n')

test('MinerU HTML tables become GitHub-flavored pipe tables', () => {
  const md = standardizeKbMarkdown(ppv)
  assert.doesNotMatch(md, /<table|<tr|<td/)
  assert.match(md, /Table A1\.2\.3-1: Peak particle velocity limits/)
  assert.match(md, /\| STRUCTURE \/ PIPELINE TYPE AND CONDITION \| MAXIMUM PEAK PARTICLE VELOCITY/)
  assert.match(md, /\| --- \| --- \|/)
  assert.match(md, /\| Fragile buildings \(old and \/ or poorly constructed\) \| 2,5 \|/)
  assert.match(md, /\| Steel pipelines \| 12,5 \|/)
})

test('escaped MinerU list markers become ordinary Markdown lists', () => {
  const md = standardizeKbMarkdown([
    'A1.1.1 SCOPE',
    '\\- Scope',
    '\\- Definitions',
    '\\1. Workmanship',
    '• Construction equipment',
  ].join('\n'))
  assert.match(md, /^- Scope$/m)
  assert.match(md, /^- Definitions$/m)
  assert.match(md, /^1\. Workmanship$/m)
  assert.doesNotMatch(md, /\\- Scope/)
})

test('already-clean pipe tables stay stable', () => {
  const src = '| Item | Unit |\n| --- | --- |\n| C1.2.8 | day |\n'
  assert.equal(standardizeKbMarkdown(src), standardizeKbMarkdown(standardizeKbMarkdown(src)))
  assert.match(standardizeKbMarkdown(src), /\| Item \| Unit \|/)
})
