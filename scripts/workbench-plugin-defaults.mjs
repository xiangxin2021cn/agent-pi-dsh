export const WORKBENCH_PLUGIN_DEFAULTS = [
  ['dsh-agent-pi-workbench', 'workbench'],
  ['dsh-agent-pi-knowledge', 'knowledge'],
  ...['tender', 'delivery', 'investment'].map((domain) => ['dsh-agent-pi-workbench-' + domain, 'workbench-' + domain]),
]

/** Seed each bundled capability once. Native plugin uninstall remains authoritative. */
export function workbenchPluginDefaults(dependencies, previouslySeeded = []) {
  return WORKBENCH_PLUGIN_DEFAULTS.filter(([name]) => !previouslySeeded.includes(name) || Object.hasOwn(dependencies, name))
}
