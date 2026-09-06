import { AsyncLocalStorage } from 'node:async_hooks'

// Native Codex models never enter the DSH child-LLM routing parameters.
const selectedModel = new AsyncLocalStorage<string | undefined>()
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
export function applyCodexModelProvider(ctx: Context, config: Record<string, any>, apply: PluginApply): void {
  const createProvider = (options: Record<string, any>) => {
    let provider: any
    apply(withService(ctx, 'subagents', {
      registerProvider(value: unknown) { provider = value },
    }), options)
    if (!provider) throw new Error('Codex provider did not register')
    return provider
  }
  const provider = createProvider(config)
  ctx.subagents.registerProvider({
    name: provider.name,
    capabilities: provider.capabilities,
    inheritsParentContext: provider.inheritsParentContext,
    start(request: unknown) {
      const model = selectedModel.getStore()
      const instance = model === undefined ? provider : createProvider({ ...config, model })
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
          },
        },
        execute(args: Record<string, unknown>, exec: unknown) {
          const { model, ...delegation } = args
          if (model !== undefined && (typeof model !== 'string' || !model.trim())) {
            throw new Error('Codex model must be a non-empty model id')
          }
          return selectedModel.run(model === undefined ? undefined : model.trim(), () => (
            definition.execute(delegation, exec)
          ))
        },
      })
    },
  })
  apply(withService(ctx, 'tools', tools), config)
}
