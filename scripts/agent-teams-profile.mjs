export const TEAM_PACKAGES = ['agent-team-profile', 'agent-team', 'tool-agent-team', 'client-ui-agent-team']
export const TEAM_BUNDLES = TEAM_PACKAGES.slice(0, 1).map(name => `@deepseek-ai/dsh-experimental-${name}`)

// The official Host layer changes global rows. Presets own a second set of
// legacy controls, so apply the same composition there when Teams is enabled.
export function configureTeamPreset(text) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  return text.replaceAll('\r\n', '\n').replace(/(^([ \t]*)- id: (tool-subagent-control|tool-subagent-list-agents|tool-subagent|tool-subagent-fork)\r?\n)([\s\S]*?)(?=^\2- id:|^\S|(?![\s\S]))/gm,
    (block, header, indent, _id, body) => header + body.replace(/^([ \t]*)disabled:.*\r?\n/gm, '') + `${indent}  disabled: true\n`)
    .replaceAll('\n', newline)
}
