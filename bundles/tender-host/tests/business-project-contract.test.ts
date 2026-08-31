import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  createBusinessProject,
  getBusinessProject,
  updateBusinessProjectContract,
} from '../../../packages/business-projects/index.ts'

test('project goal and terminal deliverables persist in registry and project shell', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ap-project-contract-'))
  const created = createBusinessProject({
    workspaceRootPath: cwd,
    projectId: 'road-bid',
    module: 'tender',
    name: 'Road bid',
    rootPath: cwd,
    workflowId: 'tender-main',
    createDirectory: false,
    projectGoal: '分析招标、完成组价并交付正式标书。',
    terminalDeliverables: ['BOQ 全量组价', '正式投标文件'],
  })
  assert.equal(created.projectGoal, '分析招标、完成组价并交付正式标书。')

  const updated = updateBusinessProjectContract(cwd, 'tender', 'road-bid', {
    projectGoal: '完成可核验的正式投标递交。',
    terminalDeliverables: ['正式投标文件', '正式投标文件', '最终人工冻结'],
  })
  assert.equal(getBusinessProject(cwd, 'tender', 'road-bid')?.projectGoal, '完成可核验的正式投标递交。')
  assert.deepEqual(updated.terminalDeliverables, ['正式投标文件', '最终人工冻结'])

  const shellPath = join(cwd, '.agent-pi', 'business', 'tender', 'road-bid', 'project-shell.json')
  const shell = JSON.parse(readFileSync(shellPath, 'utf8')) as typeof updated
  assert.equal(shell.projectGoal, updated.projectGoal)
  assert.deepEqual(shell.terminalDeliverables, updated.terminalDeliverables)
})
