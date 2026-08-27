/** Canonical KB category for a user-owned writing template. */
export const KB_USER_TEMPLATE_CATEGORY = '用户模板'

const CATEGORY_ALIASES = new Set(['用户模板', '用户模版', '模板', '模版'])

/**
 * True when the KB category means "clone this document's format/outline/depth".
 * Accepts the common 模版 spelling.
 */
export function isUserTemplateCategory(category?: string): boolean {
  return CATEGORY_ALIASES.has(String(category || '').trim())
}

/**
 * File or display name that should land in 用户模板 when the caller omitted a category.
 * Matches 用户模板 / 施工方案模板 / xxx-template, not a random 规范.pdf.
 */
export function looksLikeUserTemplateName(name?: string): boolean {
  const base = String(name || '').replace(/^.*[\\/]/, '')
  if (!base) return false
  const stem = base.replace(/\.[^.]+$/, '')
  if (/(用户模板|用户模版)/.test(stem)) return true
  if (/(模板|模版)$/.test(stem)) return true
  if (/(^|[^a-z0-9])template([^a-z0-9]|$)/i.test(stem)) return true
  return false
}

/**
 * Store 用户模版 as 用户模板. If the caller left the category empty, infer from the file name.
 * An explicit 规范/合同/范文/方法标准 is never overwritten.
 */
export function resolveKbCategory(input?: string, nameHint?: string): string {
  const raw = String(input || '').trim()
  if (isUserTemplateCategory(raw)) return KB_USER_TEMPLATE_CATEGORY
  if (raw && raw !== '未分类') return raw
  if (looksLikeUserTemplateName(nameHint || '')) return KB_USER_TEMPLATE_CATEGORY
  return raw || '未分类'
}

export function userTemplateInstruction(entries: Array<{ category: string; slug: string; name: string }>): string {
  const templates = entries.filter((entry) => isUserTemplateCategory(entry.category))
  if (templates.length === 0) return ''
  const slugs = templates.map((entry) => entry.slug).join(', ')
  return [
    `User templates for THIS task (category 用户模板): ${slugs}.`,
    'Read skill kb-user-template. Before writing any business deliverable, kb_search / kb_read_chunk these slugs and clone their format, heading tree, section order, and content depth.',
    "Fill the cloned outline with THIS project's facts. Do not copy names, quantities, dates, or clause answers from the template. Cite project sources; the template is form only.",
  ].join('\n')
}
