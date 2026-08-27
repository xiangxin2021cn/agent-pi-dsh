/**
 * Local PDF text probe and extract. Digital specs skip MinerU; mixed/scanned stay on the cloud path.
 * Sampling covers the head, a middle slice, and the tail so a typeset cover cannot hide scan pages.
 */
import { readFileSync } from 'node:fs'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

export const TEXT_PAGE_MIN_CHARS = 40
export const DIGITAL_COVERAGE = 0.8
export const DIGITAL_AVG_CHARS = 80
export const SCAN_COVERAGE = 0.3

export type PdfTextKind = 'digital' | 'mixed' | 'scanned'

export interface PdfTextSample {
  page: number
  chars: number
}

export interface PdfTextProbe {
  kind: PdfTextKind
  pageCount: number
  coverage: number
  avgChars: number
  useOcr: boolean
  useLocalText: boolean
  samples: PdfTextSample[]
}

let workerReady = false

function ensurePdfjsWorker(): void {
  if (workerReady) return
  GlobalWorkerOptions.workerSrc = new URL(
    '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url,
  ).href
  workerReady = true
}

export function countableChars(text: string): number {
  return String(text || '').replace(/\s+/g, '').length
}

export function samplePageNumbers(pageCount: number): number[] {
  const total = Math.max(0, Math.floor(pageCount))
  if (total < 1) return []
  const head = Math.min(10, total)
  const tail = Math.min(3, total)
  const chosen = new Set<number>()
  for (let page = 1; page <= head; page++) chosen.add(page)
  if (total > head + tail) {
    const midStart = Math.max(head + 1, Math.floor(total / 3))
    const step = Math.max(1, Math.floor(total / 8))
    for (let index = 0; index < 3; index++) {
      const page = Math.min(total - tail, midStart + index * step)
      if (page > head) chosen.add(page)
    }
  }
  for (let page = Math.max(1, total - tail + 1); page <= total; page++) chosen.add(page)
  return [...chosen].sort((left, right) => left - right)
}

export function classifyPdfText(samples: PdfTextSample[]): Omit<PdfTextProbe, 'pageCount' | 'samples'> {
  if (samples.length === 0) {
    return { kind: 'scanned', coverage: 0, avgChars: 0, useOcr: true, useLocalText: false }
  }
  const textPages = samples.filter((sample) => sample.chars >= TEXT_PAGE_MIN_CHARS).length
  const coverage = textPages / samples.length
  const avgChars = samples.reduce((sum, sample) => sum + sample.chars, 0) / samples.length
  const useLocalText = coverage >= DIGITAL_COVERAGE && avgChars >= DIGITAL_AVG_CHARS
  const useOcr = coverage < SCAN_COVERAGE
  const kind: PdfTextKind = useLocalText ? 'digital' : useOcr ? 'scanned' : 'mixed'
  return { kind, coverage, avgChars, useOcr, useLocalText }
}

function itemsToText(items: Array<{ str?: string; hasEOL?: boolean }>): string {
  let out = ''
  for (const item of items) {
    out += item.str || ''
    out += item.hasEOL ? '\n' : ' '
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()
}

async function loadPdf(filePath: string) {
  ensurePdfjsWorker()
  const data = new Uint8Array(readFileSync(filePath))
  return getDocument({
    data,
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
  }).promise
}

export async function readPdfPageText(filePath: string, pageNumber: number): Promise<string> {
  const pdf = await loadPdf(filePath)
  try {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    return itemsToText(content.items as Array<{ str?: string; hasEOL?: boolean }>)
  } finally {
    await pdf.destroy()
  }
}

export async function probePdfText(filePath: string): Promise<PdfTextProbe> {
  const pdf = await loadPdf(filePath)
  try {
    const pageCount = pdf.numPages
    const pages = samplePageNumbers(pageCount)
    const samples: PdfTextSample[] = []
    for (const pageNumber of pages) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = itemsToText(content.items as Array<{ str?: string; hasEOL?: boolean }>)
      samples.push({ page: pageNumber, chars: countableChars(text) })
    }
    return { ...classifyPdfText(samples), pageCount, samples }
  } finally {
    await pdf.destroy()
  }
}

export async function extractPdfTextMarkdown(filePath: string): Promise<{ markdown: string; pageCount: number; chars: number }> {
  const pdf = await loadPdf(filePath)
  try {
    const pageCount = pdf.numPages
    const parts: string[] = []
    let chars = 0
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = itemsToText(content.items as Array<{ str?: string; hasEOL?: boolean }>)
      chars += countableChars(text)
      parts.push(`<!-- page ${pageNumber} -->\n\n${text}`.trimEnd())
    }
    return { markdown: parts.join('\n\n'), pageCount, chars }
  } finally {
    await pdf.destroy()
  }
}
