/**
 * Reading-quality rule for knowledge-base manuscripts.
 * Applies when the model writes or rewrites a pack for a source document
 * or a 用户模板. Does not apply to stage drafts or ordinary chat.
 */

export const KB_MANUSCRIPT_LAYOUT_RULE = [
  'manuscript.md is what the user opens in the Knowledge Base preview. A raw PDF extract (<!-- page N --> plus one paragraph per page, broken mid-word spaces, scattered TOC dots) is a draft, not the library.',
  'Rewrite it as readable Markdown that a person can scan like the printed source: ATX headings for CHAPTER / PART / CONTENTS / clause ids (A2.1.1, 第1.1.1条), real lists for the table of contents, Markdown tables for tables, restored word spaces, short paragraphs under each heading.',
  'Do not invent clauses, numbers, or sentences. Source documents and 用户模板 use this same standard. kb_prepare_document writes page PNGs by default — read_image those pages and rewrite from the printed layout. Pass images:false only when the text-layer draft is enough.',
  'Never paste the full manuscript into chat.',
].join(' ')

/**
 * True when the extract has page markers or length but almost no Markdown headings.
 * Those files look like a wall of text in the preview.
 */
export function manuscriptLooksUnstructured(text?: string): boolean {
  const body = String(text || '').replace(/\r\n/g, '\n')
  if (body.length < 400) return false
  const atx = (body.match(/^#{1,6}\s+\S/gm) || []).length
  const pages = (body.match(/<!--\s*page\s+\d+\s*-->/gi) || []).length
  if (pages >= 2 && atx < pages) return true
  return atx === 0 && body.length >= 800
}
