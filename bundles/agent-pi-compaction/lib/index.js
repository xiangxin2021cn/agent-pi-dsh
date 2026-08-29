import z from '@deepseek-ai/schemastery'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import {
  BlockAssembler,
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

function finishError(finish) {
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    return Object.assign(new Error(finish.failure.message), { code: finish.failure.code })
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
      source: { kind: 'plugin', plugin: 'dsh-agent-pi-compaction' },
    }),
  ]
  const options = {
    provider: target.provider,
    model: target.model,
    messages,
    ...(input.system === undefined ? {} : { system: input.system }),
    ...(input.tools === undefined ? {} : { tools: [...input.tools] }),
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
  }

  async summarize(input, agent, signal) {
    try {
      return await super.summarize(input, agent, signal)
    } catch (primaryError) {
      const failures = [primaryError]
      for (const target of this.summarizationFallbacks) {
        try {
          return await summarizeWithTarget(this.ctx, target, input, agent, signal)
        } catch (fallbackError) {
          failures.push(fallbackError)
        }
      }
      throw new AggregateError(failures, 'compaction summarization failed for the current route and every configured fallback')
    }
  }
}

export default AgentPiCompactionEngine
