import { AsyncLocalStorage } from 'node:async_hooks'

// Native Codex models never enter the DSH child-LLM routing parameters.
const selectedOptions = new AsyncLocalStorage<{ model?: string; reasoningEffort?: string }>()
type Context = Record<string, any>
type PluginApply = (ctx: Context, config: Record<string, any>) => void

function withService(ctx: Context, name: string, service: unknown): Context {
  return new Proxy(ctx, {
    get(target, key) {
      if (key === name) return service
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** Keep the official provider's cwd, sandbox, subprocess and run lifecycle. */
export function applyCodexModelProvider(ctx: Context, config: Record<string, any>, apply: PluginApply, wrapperPath: string): void {
  const createProvider = (options: Record<string, any>, reasoningEffort?: string) => {
    let provider: any
    let providerContext = withService(ctx, 'subagents', {
      registerProvider(value: unknown) { provider = value },
    })
    const subprocess = new Proxy(ctx.subprocess, {
      get(target, key) {
        if (key === 'spawn') return (spec: any) => target.spawn({
          ...spec,
          argv: [
            spec.argv[0], wrapperPath,
            ...(reasoningEffort === undefined ? [] : ['--config', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`]),
            ...spec.argv.slice(2),
          ],
        })
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    providerContext = withService(providerContext, 'subprocess', subprocess)
    apply(providerContext, options)
    if (!provider) throw new Error('Codex provider did not register')
    return provider
  }
  const provider = createProvider(config)
  ctx.subagents.registerProvider({
    name: provider.name,
    capabilities: provider.capabilities,
    inheritsParentContext: provider.inheritsParentContext,
    start(request: unknown) {
      const selected = selectedOptions.getStore()
      const instance = selected === undefined || (!selected.model && !selected.reasoningEffort) ? provider : createProvider({
        ...config,
        ...(selected.model === undefined ? {} : { model: selected.model }),
      }, selected.reasoningEffort)
      return instance.start(request)
    },
  })
}

/** Keep the official tool's foreground/background collection and cancellation. */
export function applyCodexModelTool(ctx: Context, config: Record<string, any>, apply: PluginApply): void {
  const tools = new Proxy(ctx.tools, {
    get(target, key) {
      if (key !== 'register') {
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
      return (definition: any) => target.register({
        ...definition,
        parameters: {
          ...definition.parameters,
          properties: {
            ...definition.parameters.properties,
            model: {
              type: 'string',
              minLength: 1,
              description: 'Native Codex model id for this task only. Omit to use the configured Codex default. Do not supply a DSH LLM provider.',
            },
            reasoningEffort: {
              type: 'string',
              minLength: 1,
              description: 'Codex reasoning effort for this task only, chosen from the selected model supportedReasoningEfforts. Omit to use the configured Codex default.',
            },
          },
        },
        execute(args: Record<string, unknown>, exec: unknown) {
          const { model, reasoningEffort, ...delegation } = args
          if (model !== undefined && (typeof model !== 'string' || !model.trim())) {
            throw new Error('Codex model must be a non-empty model id')
          }
          if (reasoningEffort !== undefined && (typeof reasoningEffort !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(reasoningEffort))) {
            throw new Error('Codex reasoning effort must be a supported effort id')
          }
          return selectedOptions.run({
            ...(model === undefined ? {} : { model: (model as string).trim() }),
            ...(reasoningEffort === undefined ? {} : { reasoningEffort: reasoningEffort as string }),
          }, () => (
            definition.execute(delegation, exec)
          ))
        },
      })
    },
  })
  apply(withService(ctx, 'tools', tools), config)
}
