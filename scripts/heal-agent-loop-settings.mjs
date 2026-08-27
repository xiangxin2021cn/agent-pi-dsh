/**
 * Remove the 3.3.3 product stamp `agent-loop.maxParallelToolCalls: 4`.
 * Omission restores the DSH agent-loop default (10). Other user-set values stay.
 *
 * @param {string} text
 * @returns {string}
 */
export function removeProductParallelCap(text) {
  if (!/(?:^|\n)agent-loop:\s*\n/.test(text)) return text
  return text.replace(
    /((?:^|\n)agent-loop:\s*\n)((?:[ \t].*\n)*)/,
    (_full, header, body) => {
      const nextBody = String(body).replace(/^[ \t]+maxParallelToolCalls:\s*4[ \t]*\r?\n/m, '')
      if (!nextBody.trim()) return '\n'
      return `${header}${nextBody}`
    },
  )
}
