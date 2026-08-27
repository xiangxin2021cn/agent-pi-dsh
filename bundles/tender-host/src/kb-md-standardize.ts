/**
 * MinerU writes tables as HTML (official output) and often escapes list markers.
 * The Knowledge Base preview only renders GitHub-flavored pipe tables and
 * ordinary `-` / `1.` lists. Run this after every MinerU merge, and again on
 * commit/reindex so already-imported manuscripts become readable without a
 * second cloud parse.
 */

const HTML_TABLE = /<table\b[\s\S]*?<\/table>/gi

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cellText(html: string): string {
  return decodeEntities(html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function escapePipes(cell: string): string {
  return cell.replace(/\|/g, '\\|')
}

function htmlTableToMarkdown(html: string): string {
  const rows: string[][] = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html))) {
    const cells: string[] = []
    const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(rowMatch[1] || ''))) {
      cells.push(cellText(cellMatch[1] || ''))
    }
    if (cells.length > 0) rows.push(cells)
  }
  if (rows.length === 0) return html
  const width = Math.max(...rows.map((row) => row.length))
  const pad = (row: string[]) => {
    const next = row.slice()
    while (next.length < width) next.push('')
    return next
  }
  const line = (row: string[]) => `| ${pad(row).map(escapePipes).join(' | ')} |`
  return [line(rows[0]!), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n')
}

/**
 * Turn MinerU / extract leftovers into Markdown the preview can render.
 * Idempotent on already-clean pipe tables.
 */
export function standardizeKbMarkdown(text: string): string {
  let out = String(text || '').replace(/\r\n/g, '\n')
  out = out.replace(HTML_TABLE, (table) => {
    const markdown = htmlTableToMarkdown(table)
    return markdown.includes('|') ? `\n\n${markdown}\n\n` : table
  })
  out = out.replace(/<\/?(?:html|body|head|div)[^>]*>/gi, '')
  out = out.replace(/^[ \t]*\\([-*+])[ \t]+/gm, '$1 ')
  out = out.replace(/^[ \t]*\\(\d+)\.[ \t]+/gm, '$1. ')
  out = out.replace(/[ \t]+\n/g, '\n')
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trimStart()
}
