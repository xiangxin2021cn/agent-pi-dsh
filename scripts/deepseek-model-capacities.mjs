export const DEEPSEEK_MODEL_CAPACITIES = Object.freeze({
  'deepseek-v4-flash': Object.freeze({ contextWindow: 1_000_000, maxTokens: 384_000 }),
  'deepseek-v4-pro': Object.freeze({ contextWindow: 1_000_000, maxTokens: 384_000 }),
  'deepseek-v4-flash-vision-exp': Object.freeze({ contextWindow: 1_000_000, maxTokens: 384_000 }),
})

function splitLines(text) {
  const lines = []
  const pattern = /([^\r\n]*)(\r\n|\n|\r)/g
  let match
  let offset = 0
  while ((match = pattern.exec(text)) !== null) {
    lines.push({ content: match[1], eol: match[2] })
    offset = pattern.lastIndex
  }
  if (offset < text.length) lines.push({ content: text.slice(offset), eol: '' })
  return lines
}

function indentation(line) {
  return line.match(/^[ \t]*/)?.[0] ?? ''
}

function isSignificant(line) {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('#')
}

function scalarValue(value) {
  let normalized = value.trim().replace(/\s+#.*$/, '').trim()
  if ((normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1)
  }
  return normalized
}

function blockEnd(lines, start, outerIndent) {
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!isSignificant(lines[index].content)) continue
    if (indentation(lines[index].content).length <= outerIndent) return index
  }
  return lines.length
}

export function repairDeepSeekModelCapacities(yamlText) {
  const lines = splitLines(yamlText)
  const insertions = []

  for (let providerIndex = 0; providerIndex < lines.length; providerIndex += 1) {
    if (!/^llm-deepseek:\s*(?:#.*)?$/.test(lines[providerIndex].content)) continue

    const providerEnd = blockEnd(lines, providerIndex, 0)
    const childIndents = lines
      .slice(providerIndex + 1, providerEnd)
      .map((line) => line.content)
      .filter(isSignificant)
      .map((line) => indentation(line).length)
      .filter((width) => width > 0)
    const providerChildIndent = Math.min(...childIndents)
    if (!Number.isFinite(providerChildIndent)) continue

    for (let modelsIndex = providerIndex + 1; modelsIndex < providerEnd; modelsIndex += 1) {
      const modelsLine = lines[modelsIndex].content
      if (indentation(modelsLine).length !== providerChildIndent
        || !/^[ \t]+models:\s*(?:#.*)?$/.test(modelsLine)) continue

      const modelsEnd = blockEnd(lines, modelsIndex, providerChildIndent)
      const listIndents = lines
        .slice(modelsIndex + 1, modelsEnd)
        .map((line) => line.content)
        .filter(isSignificant)
        .filter((line) => /^[ \t]*-\s+/.test(line))
        .map((line) => indentation(line).length)
        .filter((width) => width > providerChildIndent)
      const itemIndent = Math.min(...listIndents)
      if (!Number.isFinite(itemIndent)) continue

      for (let itemIndex = modelsIndex + 1; itemIndex < modelsEnd; itemIndex += 1) {
        const itemLine = lines[itemIndex].content
        if (indentation(itemLine).length !== itemIndent) continue
        const idMatch = itemLine.match(/^[ \t]*-\s+id:\s*(.*?)\s*$/)
        if (!idMatch) continue
        const modelId = scalarValue(idMatch[1])
        if (!Object.hasOwn(DEEPSEEK_MODEL_CAPACITIES, modelId)) continue
        const capacity = DEEPSEEK_MODEL_CAPACITIES[modelId]

        const itemEnd = blockEnd(lines, itemIndex, itemIndent)
        const directIndents = lines
          .slice(itemIndex + 1, itemEnd)
          .map((line) => line.content)
          .filter(isSignificant)
          .map((line) => indentation(line).length)
          .filter((width) => width > itemIndent)
        const directIndent = Math.min(...directIndents)
        const propertyIndent = Number.isFinite(directIndent)
          ? indentation(lines.slice(itemIndex + 1, itemEnd)
            .find((line) => isSignificant(line.content)
              && indentation(line.content).length === directIndent).content)
          : `${indentation(itemLine)}  `
        const directLines = lines
          .slice(itemIndex + 1, itemEnd)
          .map((line) => line.content)
          .filter((line) => indentation(line).length === propertyIndent.length)
        const missing = []
        if (!directLines.some((line) => /^[ \t]*(?:contextWindow|"contextWindow"|'contextWindow')\s*:/.test(line))) {
          missing.push(`${propertyIndent}contextWindow: ${capacity.contextWindow}`)
        }
        if (!directLines.some((line) => /^[ \t]*(?:maxTokens|"maxTokens"|'maxTokens')\s*:/.test(line))) {
          missing.push(`${propertyIndent}maxTokens: ${capacity.maxTokens}`)
        }
        if (missing.length > 0) insertions.push({ after: itemIndex, lines: missing })
      }
    }
    providerIndex = providerEnd - 1
  }

  if (insertions.length === 0) return { yaml: yamlText, changed: false }

  const fallbackEol = lines.find((line) => line.eol)?.eol ?? '\n'
  for (const insertion of insertions.sort((a, b) => b.after - a.after)) {
    const anchor = lines[insertion.after]
    const eol = anchor.eol || fallbackEol
    const inserted = insertion.lines.map((content) => ({ content, eol }))
    if (!anchor.eol) inserted.at(-1).eol = ''
    anchor.eol = eol
    lines.splice(insertion.after + 1, 0, ...inserted)
  }
  return {
    yaml: lines.map((line) => `${line.content}${line.eol}`).join(''),
    changed: true,
  }
}
