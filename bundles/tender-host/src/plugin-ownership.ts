export type ProductPluginOwner = 'host' | 'workbench' | 'knowledge'
export type ProductToolOwner = ProductPluginOwner | 'tender'
export const WORKBENCH_ROUTES = ['modules', 'skills', 'workbench', 'citations', 'projects', 'session-project', 'stage', 'pricing', 'memory']

export function routeOwner(pathname: string): ProductPluginOwner {
  const segment = pathname.slice('/api/agent-pi/'.length).split('/')[0]
  if (segment === 'kb') return 'knowledge'
  return WORKBENCH_ROUTES.includes(segment) ? 'workbench' : 'host'
}

export function toolOwner(name: string): ProductToolOwner {
  if (['tender_knowledge', 'tender_workspace', 'tender_capability', 'tender_pricing_workbook', 'tender_evidence'].includes(name)) return 'tender'
  return name.startsWith('kb_') ? 'knowledge' : 'workbench'
}
