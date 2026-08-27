import { importDsh } from './dsh.ts'

export interface PromptOptimizationAttachment {
  name: string
  type?: string
  size?: number
}

export interface PromptOptimizationContext {
  input: string
  attachments?: PromptOptimizationAttachment[]
  workingDirectory?: string
  model?: string
  provider?: string
  connectionName?: string
  reasoningEffort?: string
}

export interface PromptOptimizationResult {
  optimizedPrompt: string
  fallback: boolean
  changed?: boolean
}

export interface LlmStreamRuntime {
  stream: (options: Record<string, unknown>) => AsyncIterable<{
    type: string
    text?: string
    reason?: { kind?: string } | string
    block?: { type?: string; text?: string }
  }>
}

function formatAttachment(attachment: PromptOptimizationAttachment): string {
  const parts = [attachment.name]
  if (attachment.type) parts.push(`type=${attachment.type}`)
  if (typeof attachment.size === 'number') parts.push(`size=${attachment.size}`)
  return `- ${parts.join(', ')}`
}

function looksLikeStructuredPrompt(input: string): boolean {
  return /^##\s*任务目标/m.test(input)
    && /^##\s*(关键约束|执行步骤|输出格式|验收标准)/m.test(input)
}

export function buildPromptOptimizationInstruction(context: PromptOptimizationContext): string {
  const input = context.input.trim()
  const attachments = context.attachments?.length
    ? context.attachments.map(formatAttachment).join('\n')
    : '无'
  const runtime = [
    context.workingDirectory ? `工作目录：${context.workingDirectory}` : undefined,
    context.connectionName ? `连接：${context.connectionName}` : undefined,
    context.provider ? `路由：${context.provider}` : undefined,
    context.model ? `模型：${context.model}` : undefined,
  ].filter(Boolean).join('\n') || '无'

  return [
    '你是 Agent π 的“发送前指令优化器”。请把用户原始输入改写成更清晰、更可执行、更利于智能体遵从的提示词。',
    '',
    '你的目标不是套用某个行业模板，而是理解用户当前这句话真正想让智能体完成什么。',
    '请根据原始输入判断任务类型，例如：写作、代码修改、调研、数据分析、文件处理、审查、自动化配置、日常问答等，然后选择最合适的表达方式。',
    '',
    '硬性规则：',
    '- 保留用户的真实意图、语言和约束，不要改变任务目标。',
    '- 保留用户给出的文件路径、文件名、数字、日期、人名、产品名、模型名、格式要求和限制条件。',
    '- 不要编造文件、数据、条款、页码、结论或用户没有提供的背景。',
    '- 不要把通用任务强行改写成招投标、工程、合同、代码或任何用户没有提到的领域任务。',
    '- 如果任务涉及附件、文件、数据表、文档、规范、来源或证据，要求智能体优先依据用户提供的附件、工作目录文件或对话上下文。',
    '- 如果任务是代码或应用修改，要求智能体先定位相关实现，再做最小必要改动并验证。',
    '- 如果任务很简单，只做轻量澄清，不要扩写成长模板。',
    '- 缺信息时由智能体先做可确定部分，或在执行中用工具查阅；不要改写成问卷。',
    '- 不要写入“需要确认”“请确认”“是否需要”“待用户确认”“待核实后执行”等让用户再回答的字眼。',
    '- 输出要适合直接发送给智能体执行。',
    '- 只输出优化后的提示词，不要解释优化过程，不要包裹代码块。',
    '',
    '可选结构，按任务需要取舍，不要机械全用：',
    '任务目标、已知上下文、输入材料、关键约束、执行步骤、输出格式、验收标准。',
    '',
    '当前上下文：',
    runtime,
    '',
    '附件：',
    attachments,
    '',
    '用户原始输入：',
    input,
  ].join('\n')
}

export function createPromptOptimizationFallback(context: PromptOptimizationContext): string {
  const input = context.input.trim()
  if (looksLikeStructuredPrompt(input)) return input

  const attachments = context.attachments?.length
    ? context.attachments.map(formatAttachment).join('\n')
    : '未提供附件'
  const materialHint = context.attachments?.length
    ? '优先读取并引用上述附件中的真实内容；关键数字、条款、页码、参数、表格数据和结论必须来自附件或工作目录中的可核验材料。'
    : '如需使用外部材料或工作目录文件，请先明确说明需要读取哪些材料；不要编造未提供的数据、条款、页码、参数或结论。'

  return [
    '## 任务目标',
    input,
    '',
    '## 输入材料',
    attachments,
    '',
    '## 关键约束',
    `- ${materialHint}`,
    '- 区分原始材料事实和你的分析判断。',
    '- 对关键数据、引用内容、规范或来源性材料，必须说明依据来源；缺材料就标缺口并继续可确定部分，不要停下来问用户确认。',
    '- 不要编造未提供的背景、文件名、页码、金额、日期、参数或技术细节。',
    '- 不要加入“需要确认的问题”或任何请用户再确认的段落。',
    '',
    '## 执行步骤',
    '1. 先理解用户要完成的最终结果和当前可用上下文。',
    '2. 如任务涉及文件或数据，先读取相关材料并提取可核验事实。',
    '3. 按任务类型执行：写作重视结构和可用性，代码修改重视定位、最小改动和验证，分析任务重视依据和结论边界。',
    '4. 直接产出可用结果；缺材料处标缺口，不要改写成问卷。',
    '',
    '## 输出格式',
    '- 使用清晰标题和分点结构。',
    '- 关键结论后附依据；缺依据则标缺口。',
    '- 如生成正式文档，请同时给出可落地的文件名建议。',
    '',
    '## 验收标准',
    '- 结论可追溯到材料或明确标注为分析判断。',
    '- 不遗漏用户原始任务中的核心要求。',
    '- 输出可直接发给智能体执行，而不是交给用户确认。',
  ].join('\n')
}

export function normalizeOptimizedPrompt(value: string | null | undefined): string {
  let text = (value ?? '').trim()
  const fence = text.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/)
  if (fence) text = (fence[1] ?? '').trim()
  return text.replace(/^["']([\s\S]*)["']$/, '$1').trim()
}

export function optimizePrompt(context: PromptOptimizationContext): PromptOptimizationResult & { fallback: true } {
  const input = context.input.trim()
  if (!input) throw new Error('Prompt is empty')
  const optimizedPrompt = createPromptOptimizationFallback(context)
  return {
    optimizedPrompt,
    fallback: true,
    changed: optimizedPrompt.trim() !== input,
  }
}

function finishKind(reason: { kind?: string } | string | undefined): string {
  if (!reason) return ''
  if (typeof reason === 'string') return reason
  return String(reason.kind || '')
}

async function collectStreamText(llm: LlmStreamRuntime, options: Record<string, unknown>): Promise<string> {
  let text = ''
  for await (const chunk of llm.stream(options)) {
    if (chunk.type === 'text-delta' && chunk.text) text += chunk.text
    if (chunk.type === 'block-end' && chunk.block?.type === 'text' && chunk.block.text) {
      if (!text.includes(chunk.block.text)) text += chunk.block.text
    }
    if (chunk.type === 'finish') {
      const kind = finishKind(chunk.reason)
      if (kind === 'error' || kind === 'aborted') {
        throw new Error(`optimize stream ${kind}`)
      }
    }
  }
  return text
}

export async function optimizePromptWithLlm(
  context: PromptOptimizationContext,
  llm?: LlmStreamRuntime | null,
): Promise<PromptOptimizationResult> {
  const input = context.input.trim()
  if (!input) throw new Error('Prompt is empty')
  const fallbackPrompt = createPromptOptimizationFallback(context)
  const provider = String(context.provider || '').trim()
  const model = String(context.model || '').trim()
  if (!llm || typeof llm.stream !== 'function' || !provider || !model) {
    return { optimizedPrompt: fallbackPrompt, fallback: true, changed: fallbackPrompt.trim() !== input }
  }

  try {
    const { createUserMessage } = await importDsh<{
      createUserMessage: (input: { content: Array<{ type: 'text'; text: string }>; source: { kind: 'plugin'; plugin: string } }) => unknown
    }>('packages/llm/llm/src/message.ts')
    const instruction = buildPromptOptimizationInstruction(context)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 45_000)
    try {
      const options: Record<string, unknown> = {
        provider,
        model,
        system: '只输出优化后的提示词正文。不要解释，不要加标题说明，不要包裹代码块。',
        messages: [createUserMessage({
          content: [{ type: 'text', text: instruction }],
          source: { kind: 'plugin', plugin: 'tender-host' },
        })],
        temperature: 0.2,
        maxTokens: 2400,
        signal: controller.signal,
      }
      if (context.reasoningEffort) options.reasoningEffort = context.reasoningEffort
      const modelResult = normalizeOptimizedPrompt(await collectStreamText(llm, options))
      const optimizedPrompt = modelResult || fallbackPrompt
      return {
        optimizedPrompt,
        fallback: !modelResult,
        changed: optimizedPrompt.trim() !== input,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return { optimizedPrompt: fallbackPrompt, fallback: true, changed: fallbackPrompt.trim() !== input }
  }
}
