export interface PdfRoi { x: number; y: number; width: number; height: number }
export interface EngineeringPdfInput {
  action: 'inventory' | 'text' | 'render' | 'tiles' | 'coverage'
  path: string
  page?: number
  startPage?: number
  limit?: number
  offset?: number
  dpi?: number
  roi?: PdfRoi
  tilePixels?: number
  overlapPixels?: number
}
export interface PdfPageInfo {
  page: number
  pdfViewBox: number[]
  rotation: number
  userUnit: number
  pdfCoordinateUnit: '1/72 inch multiplied by userUnit'
  viewport: { width: number; height: number; unit: 'pt'; origin: 'top-left'; rotationApplied: true }
  pdfToViewportTransform: number[]
  engineeringScale: null
}
export interface PdfSource {
  path: string
  sha256: string
  bytes: number
  pageCount: number
}
export interface PdfTextItem {
  index: number
  text: string
  fontName: string
  direction: string
  hasEOL: boolean
  pdfTransform: number[]
  pdfWidth: number
  pdfHeight: number
  viewportBaseline: number[]
  viewportQuad: number[][]
  normalizedBounds: PdfRoi
  boundsKind: 'text-advance-estimate'
}
export interface PdfReceipt {
  sourceSha256: string
  parameterFingerprint: string
  action: 'inventory' | 'text' | 'render'
  pages: number[]
  textRange?: { page: number; start: number; end: number; total?: number; chars: number }
  roi?: PdfRoi
  imagePath?: string
  createdAt: string
}
