export function normalizeCompactionFallbackPreference(value) {
  const stored = typeof value === 'boolean'
    ? value
    : (value && typeof value === 'object' && !Array.isArray(value)
        ? value.compactionFallbackEnabled
        : undefined)
  return { enabled: typeof stored === 'boolean' ? stored : true }
}

export function createCompactionFallbackPreferenceUpdate(enabled) {
  if (typeof enabled !== 'boolean') {
    throw new TypeError('compaction fallback preference must be a boolean')
  }
  return { compactionFallbackEnabled: enabled }
}

export function applyCompactionFallbackEnv(env, preference) {
  const { enabled } = normalizeCompactionFallbackPreference(preference)
  return {
    ...env,
    AGENT_PI_COMPACTION_FALLBACK: enabled ? '1' : '0',
  }
}
