export const WORKBENCH_PLUGIN_DEFAULTS = [
  ['dsh-agent-pi-task-guide', 'task-guide'],
  ['dsh-agent-pi-workbench', 'workbench'],
  ['dsh-agent-pi-knowledge', 'knowledge'],
  ['dsh-agent-pi-engineering', 'engineering'],
  ['dsh-agent-pi-engineering-rebar', 'engineering-rebar'],
  ['dsh-agent-pi-engineering-cad', 'engineering-cad'],
  ['dsh-agent-pi-engineering-pdf', 'engineering-pdf'],
  ['dsh-agent-pi-engineering-road', 'engineering-road'],
  ['dsh-agent-pi-engineering-bim', 'engineering-bim'],
  ['dsh-agent-pi-engineering-civil', 'engineering-civil'],
  ['dsh-agent-pi-engineering-delivery', 'engineering-delivery'],
  ['dsh-agent-pi-china-tender', 'china-tender'],
  ...['tender', 'delivery', 'investment'].map((domain) => ['dsh-agent-pi-workbench-' + domain, 'workbench-' + domain]),
]

/** Seed each bundled capability once. Native plugin uninstall remains authoritative. */
export function workbenchPluginDefaults(dependencies, previouslySeeded = []) {
  return WORKBENCH_PLUGIN_DEFAULTS.filter(([name]) => !previouslySeeded.includes(name) || Object.hasOwn(dependencies, name))
}
