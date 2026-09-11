export function normalizeAgentTeamsPreference(value) {
  return { enabled: value?.agentTeamsEnabled === true }
}

export function createAgentTeamsPreferenceUpdate(enabled) {
  if (typeof enabled !== 'boolean') throw new TypeError('Agent Teams preference must be a boolean')
  return { agentTeamsEnabled: enabled }
}
