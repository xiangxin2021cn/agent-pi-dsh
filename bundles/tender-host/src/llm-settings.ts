import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const KIMI_CODING_OPENAI = 'https://api.kimi.com/coding/v1'
const KIMI_CODING_ANTHROPIC = 'https://api.kimi.com/coding'

/**
 * Kimi Coding 的 k3 走 Anthropic Messages：客户端会再拼 `/v1/messages`。
 * 配置成 OpenAI 形态的 `/coding/v1` 会打到 `/coding/v1/v1/messages` → 404。
 */
export function normalizeKimiCodingBaseUrl(text: string): string {
  return text.replace(
    /(^|\n)([ \t]*baseURL:[ \t]*)https:\/\/api\.kimi\.com\/coding\/v1\/?(?=\s|$)/g,
    `$1$2${KIMI_CODING_ANTHROPIC}`,
  )
}

export function repairKimiCodingSettings(home = process.env.DSH_HOME): boolean {
  if (!home) return false
  const path = join(home, 'settings.yaml')
  if (!existsSync(path)) return false
  const before = readFileSync(path, 'utf8')
  if (!before.includes(KIMI_CODING_OPENAI)) return false
  const after = normalizeKimiCodingBaseUrl(before)
  if (after === before) return false
  writeFileSync(path, after)
  return true
}
