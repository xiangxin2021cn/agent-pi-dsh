const denial = 'External CLI delegation cannot preserve this DSH sandbox or approval policy. Continue with DSH native tools; do not change permissions or request a new approval setting.'

interface Actor {
  id: string
  session: { id: string }
  ctx: { get(name: string): any }
}
export interface OarActorPolicyProof {
  readonly actorSessionId: string
  readonly sandboxMode: 'danger-full-access'
  readonly approvalPolicy: 'never'
  readonly permissionPreset: string
}

/** Admission proof only: native CLIs do not inherit DSH's ongoing tool policy. */
export function captureOarActorPolicy(actor?: Actor): OarActorPolicyProof {
  if (!actor?.session?.id || actor.id !== actor.session.id || typeof actor.ctx?.get !== 'function') throw new Error(denial)
  const session = actor.session
  const sandbox = actor.ctx.get('sandboxPolicy'), approval = actor.ctx.get('approval'), presets = actor.ctx.get('permissionPresets')
  if (typeof sandbox?.resolve !== 'function' || typeof approval?.overrideOf !== 'function' || typeof presets?.current !== 'function') throw new Error(denial)
  const mode = sandbox.resolve({ session })?.mode
  const policy = approval.overrideOf(session) ?? approval.config?.policy ?? 'ask'
  const preset = presets.current(session)
  if (mode !== 'danger-full-access' || policy !== 'never' || typeof preset !== 'string' || !preset.trim() || preset === 'auto') throw new Error(denial)
  return Object.freeze({ actorSessionId: session.id, sandboxMode: mode, approvalPolicy: policy, permissionPreset: preset })
}

/** A monotonic native-pipeline guard; never asks or changes the actor's policy. */
export function registerOarPolicyGuard(ctx: {
  tools: { guard(guard: (exec: { name: string; agent?: Actor }) => string | undefined): unknown }
  provide(name: string, service: unknown): unknown
}): void {
  ctx.tools.guard(exec => {
    if (exec.name !== 'subagent_oar') return
    try { captureOarActorPolicy(exec.agent) }
    catch { return denial }
  })
  ctx.provide('agentPiOarPolicy', Object.freeze({ apiVersion: 1, toolName: 'subagent_oar', enforcement: 'admission-only' }))
}
