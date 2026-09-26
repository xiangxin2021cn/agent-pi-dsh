import type { WorkbenchRegistry } from '../../../packages/business-projects/workbench-registry.ts'
import { registerTools } from '../../tender-host/src/tools.ts'
import { assertModuleEnabled } from '../../tender-host/src/modules.ts'
import { businessProjectForAgent } from '../../tender-host/src/business-activation.ts'
import { importDsh } from '../../tender-host/src/dsh.ts'
import type { ProductToolOwner } from '../../tender-host/src/plugin-ownership.ts'

const { defineTool } = await importDsh<any>('packages/core/tools/src/index.ts')
export function registerWorkbenchTools(ctx: any, registry: WorkbenchRegistry, owner: ProductToolOwner): void {
  registerTools(ctx, (options) => {
    const execute = options.execute as (...args: any[]) => unknown
    return defineTool({ ...options, execute: (...args: any[]) => registry.run(() => {
      if (String(options.name).startsWith('tender_') && options.name !== 'tender_project') {
        const project = businessProjectForAgent(args[1]?.agent)
        assertModuleEnabled(String(args[0]?.module || project?.module || 'tender'))
      }
      return execute(...args)
    }) })
  }, owner)
}
