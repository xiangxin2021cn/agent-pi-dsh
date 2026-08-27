export interface PreviewSelectionFollowup {
  filePath: string
  selectedText: string
  instruction: string
}

/** Send a preview selection rewrite into the parent session, not a side chat. */
export function buildPreviewSelectionFollowup(input: PreviewSelectionFollowup): string {
  const filePath = String(input.filePath || '').trim()
  const instruction = String(input.instruction || '').trim()
  const selected = String(input.selectedText || '').trim()
  if (!filePath || !instruction || !selected) {
    throw new Error('file path, selection, and instruction are required')
  }
  const clipped = selected.length > 8000 ? `${selected.slice(0, 8000)}\n…(选区已截断)` : selected
  return `【预览选区修改 — 请在本主会话继续，使用本项目记忆】

文件: ${filePath}
用户要求: ${instruction}

<selected_text>
${clipped}
</selected_text>

请直接改这个文件并保存。不要另开对话，不要只口头改一版。改完用一句话说明改了什么。`
}
