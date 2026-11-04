import z from '@deepseek-ai/schemastery'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import {
  BlockAssembler,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  IMAGE_OFFLOAD_REQUIRED_CODE,
  LlmError,
  contentHasImage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'

const optionalPolicy = {
  thresholdRatio: z.number(),
  retainRatio: z.number(),
  retainTokens: z.number().step(1).min(0),
  summarizationProvider: z.string(),
  summarizationModel: z.string(),
  maxTokens: z.number().step(1).min(1),
  compactionRetries: z.number().step(1).min(0),
  maxOverflowRetries: z.number().step(1).min(0),
}
const modelPolicy = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  ...optionalPolicy,
})
const fallbackTarget = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  maxTokens: z.number().step(1).min(1),
})

const SUMMARY_OPEN_TAG = '<compacted-summary>'
const COMPLETION_RETRY_HEADROOM = 1024
const MINIMUM_RETRY_COMPLETION = 4096
const COMPACTION_INSTRUCTION = [
  'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.',
  '',
  'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.',
  '',
  '## Primary Request and Intent',
  '- [the user\'s original and evolving goals; quote verbatim where the exact wording matters]',
  '',
  '## Key Technical Concepts',
  '- [technologies, frameworks, patterns, and conventions in play]',
  '',
  '## Files and Code',
  '- [exact path: why it matters, key changes or snippets]',
  '',
  '## Errors and Fixes',
  '- [error: how it was resolved, plus any related user feedback]',
  '',
  '## Pending Jobs',
  '- [explicitly requested work not yet completed]',
  '',
  '## Current Work',
  '- [precisely what was in progress at this checkpoint]',
  '',
  '## Next Step',
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  '',
  '## Critical Context',
  '- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]',
  '',
  'Rules:',
  '- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.',
  '- Capture user feedback and explicit instructions faithfully, especially corrections.',
  '- Do NOT mention this summarization request or that the context was compacted.',
  '- Output only the checkpoint text: do not call any tool or take any other action.',
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`,
].join('\n')

// The provider counts the serialized prompt, including tools and images. Use
// its rejection's exact counts if normal compaction could not retry the step.
function overflowCompletionBudget(message, requestedMaxTokens) {
  const counts = /\bmaximum context length is (\d+) tokens\.\s*However, you requested (\d+) tokens \((\d+) in the messages, (\d+) in the completion\)/i.exec(message)
  if (!counts) return undefined
  const [window, total, input, completion] = counts.slice(1).map(Number)
  if (![window, total, input, completion].every(Number.isSafeInteger)
    || input + completion !== total || total <= window || completion !== requestedMaxTokens) {
    return undefined
  }
  const budget = window - input - COMPLETION_RETRY_HEADROOM
  return budget >= MINIMUM_RETRY_COMPLETION ? budget : undefined
}

function finishError(finish) {
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    return new LlmError(finish.failure.message, finish.failure.code, finish.failure)
  }
  if (finish.kind === 'max-tokens') {
    return Object.assign(new Error('summarization truncated at the token cap (incomplete checkpoint)'), {
      code: 'MAX_TOKENS',
    })
  }
  return undefined
}

async function summarizeWithTarget(ctx, target, input, agent, signal) {
  const assembler = new BlockAssembler()
  const messages = [
    ...input.messages,
    createUserMessage({
      content: [{ type: 'text', text: COMPACTION_INSTRUCTION }],
      source: { kind: 'plugin:dsh-agent-pi-compaction' },
    }),
  ]
  const options = {
    provider: target.provider,
    model: target.model,
    messages,
    ...(input.system === undefined ? {} : { system: input.system }),
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
    toolHistory: agent.session.toolHistory(),
    maxTokens: target.maxTokens ?? 32768,
    sessionId: agent.session.id,
    purpose: 'compaction',
    ...(signal === undefined ? {} : { signal }),
  }
  for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
  const error = finishError(assembler.finish)
  if (error !== undefined) throw error
  const rawOutput = assembler.blocks()
  if (contentHasImage(rawOutput)) {
    throw new LlmError('compaction summary cannot contain image output', 'UNSUPPORTED_CONTENT')
  }
  const summary = rawOutput.filter((block) => block.type === 'text')
  if (!summary.some((block) => block.text.trim().length > 0)) {
    throw new Error('summarization produced no text summary content')
  }
  return {
    summary,
    rawOutput,
    llmStreamCall: true,
    provider: options.provider,
    model: options.model,
    maxTokens: options.maxTokens,
    ...(assembler.usage === undefined ? {} : { usage: assembler.usage }),
  }
}

function allowSummaryFallback(error, signal) {
  signal?.throwIfAborted()
  if (error instanceof LlmError && error.code === IMAGE_OFFLOAD_REQUIRED_CODE) throw error
}

/** DSH compaction with current-route-first, explicit cross-provider fallbacks. */
export class AgentPiCompactionEngine extends BasicCompactionEngine {
  static Config = z.object({
    ...optionalPolicy,
    modelPolicies: z.array(modelPolicy),
    auto: z.boolean(),
    summarizationFallbacks: z.array(fallbackTarget),
  })

  constructor(ctx, config = {}) {
    const { summarizationFallbacks = [], ...baseConfig } = config
    super(ctx, baseConfig)
    this.summarizationFallbacks = summarizationFallbacks.map((target) => ({ ...target }))
    if (this.config.auto) this.registerCompletionRecovery()
  }

  registerCompletionRecovery() {
    const budgets = new WeakMap()

    this.ctx.on('agent/request-error', async ({ agent, failure, provider, step, signal }, next) => {
      const action = await next()
      if (action?.kind === 'retry' || signal.aborted || failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE) {
        return action
      }
      const previous = budgets.get(agent)
      if (previous?.signal === signal && previous.step === step) return action

      const header = agent.session.requestHeader()
      if (!header || header.config.provider !== provider) return action
      const maxTokens = overflowCompletionBudget(failure.message, header.config.maxTokens)
      if (maxTokens === undefined) return action

      budgets.set(agent, {
        step, signal, maxTokens,
        originalMaxTokens: header.adapterDefaults?.maxTokens ? undefined : header.config.maxTokens,
      })
      return { kind: 'retry' }
    }, { prepend: true })

    // On this kernel the request waterfall is the control hook that records
    // the temporary cap in the replayable request header before dispatch.
    this.ctx.on('agent/request', async ({ agent, step, signal }, next) => {
      const config = await next()
      const budget = budgets.get(agent)
      if (!budget) return config
      if (budget.signal === signal && budget.step === step) return { ...config, maxTokens: budget.maxTokens }

      budgets.delete(agent)
      if (config.maxTokens !== budget.maxTokens) return config
      const restored = { ...config }
      if (budget.originalMaxTokens === undefined) delete restored.maxTokens
      else restored.maxTokens = budget.originalMaxTokens
      return restored
    })
  }

  async summarize(input, agent, signal) {
    try {
      return await super.summarize(input, agent, signal)
    } catch (primaryError) {
      allowSummaryFallback(primaryError, signal)
      const failures = [primaryError]
      for (const target of this.summarizationFallbacks) {
        try {
          return await summarizeWithTarget(this.ctx, target, input, agent, signal)
        } catch (fallbackError) {
          allowSummaryFallback(fallbackError, signal)
          failures.push(fallbackError)
        }
      }
      throw new AggregateError(failures, 'compaction summarization failed for the current route and every configured fallback')
    }
  }
}

export default AgentPiCompactionEngine
