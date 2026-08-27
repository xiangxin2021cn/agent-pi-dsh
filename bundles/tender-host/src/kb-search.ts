/**
 * Layer 4 lexical engine: MiniSearch BM25 over structure units.
 * Field boost is clauseId > title > headingPath > body. No vectors.
 * Documents carry textNorm / titles / clause ids only — never a manuscript copy.
 */
import { writeFileSync } from 'node:fs'
import MiniSearch from 'minisearch'
import { normalizeClauseId } from './kb-structure.ts'

interface SearchableChunk {
  id: string
  title: string
  textNorm?: string
  metadata: {
    headingPath: string[]
    clauseRefs: string[]
    kind?: string
  }
}

export const KB_SEARCH_ENGINE = 'minisearch-bm25'
export const KB_SEARCH_FIELDS = ['clauseId', 'title', 'headingPath', 'body'] as const
export const KB_SEARCH_BOOST = {
  clauseId: 8,
  title: 4,
  headingPath: 2,
  body: 1,
} as const

export interface KbSearchDocument {
  id: string
  slug: string
  chunkId: string
  clauseId: string
  title: string
  headingPath: string
  body: string
}

const CLAUSE_TOKEN = /[A-Za-z]?\d+(?:\.\d+)+/g

/** Tokenize a field or query. Clause ids stay whole so prefix search can follow A1.2 → A1.2.3. */
export function tokenizeKb(text: string, fieldName?: string): string[] {
  if (!text) return []
  if (fieldName === 'clauseId') return tokenizeClauseField(text)
  return tokenizeMixed(text)
}

function tokenizeClauseField(text: string): string[] {
  const tokens = new Set<string>()
  for (const raw of text.split(/[\s,;|/]+/)) {
    const id = (normalizeClauseId(raw) || raw).trim().toLocaleLowerCase()
    if (id) tokens.add(id)
  }
  return [...tokens]
}

function tokenizeMixed(text: string): string[] {
  const tokens = new Set<string>()
  for (const match of text.matchAll(CLAUSE_TOKEN)) {
    const id = normalizeClauseId(match[0])
    if (id) tokens.add(id.toLocaleLowerCase())
  }
  const remainder = text.replace(CLAUSE_TOKEN, ' ')
  for (const token of tokenizeWords(remainder)) tokens.add(token)
  return [...tokens]
}

function tokenizeWords(value: string): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  const tokens = normalized
    .split(/[\s,.;:!?()[\]{}"'`\\/|+-]+/)
    .filter((token) => token.length >= 2 && !/^\d{1,2}$/.test(token))
  for (const segment of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let size = 2; size <= 3; size++) {
      for (let index = 0; index <= segment.length - size; index++) {
        tokens.push(segment.slice(index, index + size))
      }
    }
  }
  return tokens
}

/** Skip TOC rows. Body is the compact search string, not display text. */
export function searchDocumentFromChunk(slug: string, chunk: SearchableChunk): KbSearchDocument | null {
  if (chunk.metadata.kind === 'toc') return null
  const clauseId = [chunk.id, ...chunk.metadata.clauseRefs].filter(Boolean).join(' ')
  return {
    id: `${slug}::${chunk.id}`,
    slug,
    chunkId: chunk.id,
    clauseId,
    title: chunk.title,
    headingPath: chunk.metadata.headingPath.join(' '),
    body: chunk.textNorm || '',
  }
}

export function createKbMiniSearch(): MiniSearch {
  return new MiniSearch({
    fields: [...KB_SEARCH_FIELDS],
    storeFields: ['slug', 'chunkId', 'title'],
    idField: 'id',
    tokenize: tokenizeKb,
    searchOptions: {
      boost: { ...KB_SEARCH_BOOST },
      prefix: (term) => term.length >= 3,
      fuzzy: false,
      combineWith: 'OR',
    },
  })
}

export function persistMiniSearchIndex(filePath: string, documents: KbSearchDocument[]): void {
  const index = createKbMiniSearch()
  if (documents.length > 0) index.addAll(documents)
  writeFileSync(filePath, `${JSON.stringify({
    schemaVersion: 1,
    engine: KB_SEARCH_ENGINE,
    fields: [...KB_SEARCH_FIELDS],
    boost: { ...KB_SEARCH_BOOST },
    index: index.toJSON(),
  })}\n`, 'utf8')
}
