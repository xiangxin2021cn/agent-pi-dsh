export function createFilePreviewOverlay(dependencies) {
  const {
    DocBtn,
    FileContextMenu,
    Icon,
    PREVIEW_HEAD_CHARS,
    PREVIEW_TABLE_ROW_CAP,
    React,
    ReactDOM,
    api,
    apiBlob,
    attachFolderPath,
    attachItemsOf,
    attachSessionId,
    buildPreviewSelectionFollowup,
    captureComposerFace,
    chooseAndUpload,
    chooseFolderForChat,
    codexTurnArmed,
    codexTurnListeners,
    currentDraft,
    dispatchToConversation,
    displayFileName,
    downloadBlob,
    escapeHtml,
    fileIconClass,
    fileIconName,
    fillComposer,
    fillMdTables,
    flattenFiles,
    foldAndSubmit,
    h,
    htmlToMarkdown,
    importWorkspaceFileToKb,
    looksLikeKbPackName,
    mdToHtml,
    mentionInChat,
    openInExplorer,
    previewIsHeavy,
    rawFileUrl,
    readDraft,
    readReasoningEffort,
    readWorkspaceCwd,
    replaceChildren,
    runtime,
    setCodexTurnArmed,
    showToast,
    slicePreviewMarkdown,
    snapshotComposer,
    snapshotFileList,
    sourceLabel,
    stitchMarkdown,
    stripComposerMentions,
    tAp,
    uploadFileList,
    useApLang,
    useAttachItems,
    wrapComposerSubmit,
  } = dependencies

  const PREVIEW_CACHE_MAX = 8
  const previewCache = new Map()

  function previewCacheKey(cwd, path, kbSlug) {
    return String(cwd || '') + '\0' + String(path || '') + '\0' + String(kbSlug || '')
  }

  function previewCacheGet(key) {
    if (!previewCache.has(key)) return null
    const value = previewCache.get(key)
    previewCache.delete(key)
    previewCache.set(key, value)
    return value
  }

  function previewCacheSet(key, value) {
    if (previewCache.has(key)) previewCache.delete(key)
    previewCache.set(key, value)
    while (previewCache.size > PREVIEW_CACHE_MAX) {
      previewCache.delete(previewCache.keys().next().value)
    }
  }

    function FilePreviewOverlay(props) {
      const cwd = props.cwd
      const file = props.file
      const kbSlug = props.kbSlug || (file && file.kbSlug) || ''
      const kbHasSource = !!(props.kbHasSource || (file && file.kbHasSource))
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [status, setStatus] = React.useState('')
      const [kind, setKind] = React.useState('text')
      const [text, setText] = React.useState('')
      const [draft, setDraft] = React.useState('')
      const [mode, setMode] = React.useState('preview')
      const [sourceMode, setSourceMode] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [copied, setCopied] = React.useState(false)
      const [cite, setCite] = React.useState(null)
      const [tablesReady, setTablesReady] = React.useState(true)
      const [office, setOffice] = React.useState(null)
      const [officeSaved, setOfficeSaved] = React.useState(null)
      const [siteUrl, setSiteUrl] = React.useState('')
      const [cadUrl, setCadUrl] = React.useState('')
      const [aiSel, setAiSel] = React.useState(null)
      const [sheetTab, setSheetTab] = React.useState(0)
      const [univerDirty, setUniverDirty] = React.useState(false)
      const [recalcPrompt, setRecalcPrompt] = React.useState(null)
      const editRef = React.useRef(null)
      const wysiwygRef = React.useRef(null)
      const previewBoxRef = React.useRef(null)
      const univerRef = React.useRef(null)
      const cadRef = React.useRef(null)
      const fillCtl = React.useRef(null)
      const loadCtl = React.useRef(null)
      const fullMdRef = React.useRef('')
      const wysiwygTouched = React.useRef(false)
      const mdCtx = { cwd: cwd, filePath: file.path }

      const beginFill = (root, markdown, extra) => {
        if (fillCtl.current) fillCtl.current.cancel()
        if (!root) {
          setTablesReady(true)
          return
        }
        setTablesReady(false)
        const ctl = fillMdTables(root, markdown, { cwd: cwd, filePath: file.path }, extra)
        fillCtl.current = ctl
        ctl.done.then(() => {
          if (fillCtl.current !== ctl) return
          setTablesReady(true)
          setStatus((s) => (s === '正在展开表格…' || s === '正在渲染表格…') ? '' : s)
        }).catch(() => {
          if (fillCtl.current === ctl) setTablesReady(true)
        })
      }

      const openCitedFile = (path) => {
        if (!path) return
        api('/api/agent-pi/citations', cwd, { method: 'POST', body: JSON.stringify({ path: path, filePath: file.path }) })
          .then((body) => {
            if (!body.exists) return
            if (body.insideWorkspace) {
              window.dispatchEvent(new CustomEvent('agent-pi-open-file', { detail: { cwd: cwd, path: body.path } }))
            } else {
              openInExplorer(cwd, body.path, { reveal: true }).catch(() => {})
            }
          })
          .catch(() => {})
      }

      const openCitation = (token) => {
        setCite({ kind: 'locator', token: token, loading: true })
        api('/api/agent-pi/citations', cwd, { method: 'POST', body: JSON.stringify({ action: 'locator', token: token }) })
          .then((body) => setCite({ kind: 'locator', token: token, data: body }))
          .catch((e) => setCite({ kind: 'error', token: token, error: String(e.message || e) }))
      }

      const onPreviewClick = (event) => {
        const expand = event.target && event.target.closest ? event.target.closest('[data-md-expand]') : null
        if (expand) {
          event.preventDefault()
          const wrap = expand.closest('.ap-doc-table-wrap') || (expand.closest('.ap-doc-more') && expand.closest('.ap-doc-more').previousElementSibling)
          const idx = wrap && wrap.getAttribute ? Number(wrap.getAttribute('data-md-table')) : -1
          const root = previewBoxRef.current || wysiwygRef.current
          beginFill(root, visible, { tableIndex: Number.isFinite(idx) ? idx : -1, batch: 200 })
          setStatus('正在展开表格…')
          return
        }
        const target = event.target && event.target.closest ? event.target.closest('[data-cite]') : null
        if (!target) return
        event.preventDefault()
        openCitation(target.getAttribute('data-cite') || '')
      }

      const excerptForAi = () => {
        if (mode === 'edit' && !isOffice) {
          const el = editRef.current
          if (el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd) {
            return String(el.value || '').slice(el.selectionStart, el.selectionEnd).trim()
          }
          return String(draft || text || '').trim()
        }
        const sel = window.getSelection && window.getSelection()
        const live = sel ? String(sel.toString() || '').trim() : ''
        if (live.length >= 2) return live
        if (isOffice && office) {
          if (kind === 'spreadsheet' || kind === 'legacy-office') {
            const sheet = (office.sheets || [])[sheetTab] || (office.sheets || [])[0]
            const rows = ((sheet && sheet.rows) || []).slice(0, 40).map((row) => (row || []).slice(0, 12).join('\t'))
            return rows.join('\n').trim()
          }
          if (kind === 'word') return String((office.paragraphs || []).join('\n\n') || '').trim()
          return String(((office.slides || []).map((slide) => (slide.texts || []).join('\n')).join('\n\n')) || '').trim()
        }
        return String(visible || text || draft || '').trim()
      }

      const openAiSel = (raw) => {
        const picked = String(raw || excerptForAi() || '').trim()
        if (!picked) {
          setError('没有可改的文字。先选一段，或打开一份文本/表格。')
          return
        }
        setAiSel({ text: picked, instruction: '', sending: false })
      }

      const onPreviewMouseUp = (event) => {
        const field = event && event.target
        if (field && typeof field.selectionStart === 'number' && field.selectionStart !== field.selectionEnd) {
          const fromField = String(field.value || '').slice(field.selectionStart, field.selectionEnd).trim()
          if (fromField.length >= 2) {
            setAiSel({ text: fromField, instruction: '', sending: false })
            return
          }
        }
        const sel = window.getSelection && window.getSelection()
        const raw = sel ? String(sel.toString() || '').trim() : ''
        if (!raw || raw.length < 2) return
        const root = (event && event.currentTarget) || previewBoxRef.current
        if (root && sel.anchorNode && !root.contains(sel.anchorNode)) return
        setAiSel({ text: raw, instruction: '', sending: false })
      }

      React.useEffect(() => {
        let cancelled = false
        if (loadCtl.current) loadCtl.current.abort()
        const ac = new AbortController()
        loadCtl.current = ac
        setLoading(true)
        setError('')
        setStatus('')
        setMode('preview')
        setSourceMode(false)
        wysiwygTouched.current = false
        fullMdRef.current = ''
        setOffice(null)
        setOfficeSaved(null)
        setUniverDirty(false)
        setSiteUrl('')
        setCadUrl('')
        setAiSel(null)
        const cacheKey = previewCacheKey(cwd, file.path, kbSlug)
        const cached = previewCacheGet(cacheKey)
        const applyBody = (body) => {
          if (cancelled) return
          if (kbSlug) {
            setKind('markdown')
            const next = body.text || ''
            setText(next)
            setDraft(next)
            fullMdRef.current = next
            wysiwygTouched.current = false
            setMode('preview')
            setSourceMode(false)
            setLoading(false)
            return
          }
          const nextKind = body.kind || (body.binary ? 'binary' : 'text')
          setKind(nextKind)
          setSiteUrl(body.siteUrl || '')
          setCadUrl(body.viewerUrl || '')
          if (nextKind === 'spreadsheet' || nextKind === 'word' || nextKind === 'slides' || nextKind === 'legacy-office') {
            setOffice(body)
            setOfficeSaved(body)
            setSheetTab(0)
            setText('')
            setDraft('')
            if (body.engine === 'univer-office' && body.hint) setStatus(body.hint)
            setLoading(false)
            return
          }
          if (body.binary && !body.text && (nextKind === 'markdown' || nextKind === 'text')) {
            setKind('binary')
            setError('文件约 ' + Math.round((body.size || 0) / 1024) + ' KB，超出预览上限。')
            setText('')
            setDraft('')
          } else {
            const next = body.text || ''
            setText(next)
            setDraft(next)
            fullMdRef.current = next
            wysiwygTouched.current = false
            if (nextKind === 'markdown') {
              setMode('preview')
              setSourceMode(false)
            }
          }
          setLoading(false)
        }
        if (cached) {
          applyBody(cached)
          return () => { cancelled = true; ac.abort() }
        }
        const request = kbSlug
          ? api('/api/agent-pi/kb/content?slug=' + encodeURIComponent(kbSlug), cwd, { method: 'GET', signal: ac.signal, timeoutMs: 45000 })
          : api('/api/agent-pi/files/content?path=' + encodeURIComponent(file.path), cwd, { method: 'GET', signal: ac.signal, timeoutMs: 120000 })
        request
          .then((body) => {
            previewCacheSet(cacheKey, body)
            applyBody(body)
          })
          .catch((e) => {
            if (cancelled || (e && e.name === 'AbortError')) return
            setError(String(e.message || e))
            setLoading(false)
          })
        return () => {
          cancelled = true
          ac.abort()
          if (fillCtl.current) fillCtl.current.cancel()
        }
      }, [cwd, file.path, kbSlug])

      const isOffice = kind === 'spreadsheet' || kind === 'word' || kind === 'slides' || kind === 'legacy-office'
      const isCad = kind === 'cad'
      const isOfficeUniver = !!(isOffice && office && office.engine === 'univer-office' && office.viewerUrl)
      const isSlimUniver = !!(kind === 'spreadsheet' && office && office.engine === 'univer' && office.viewerUrl)
      const isUniver = !!(isOfficeUniver || isSlimUniver)
      React.useEffect(() => {
        if (!isCad) return undefined
        const onMessage = (event) => {
          if (event.origin !== window.location.origin || !cadRef.current || event.source !== cadRef.current.contentWindow) return
          const message = event.data || {}
          if (message.type === 'agent-pi-cad:ready') {
            setStatus('二维预览已就绪')
            setError('')
          } else if (message.type === 'agent-pi-cad:error') {
            setError(String(message.message || 'CAD 预览失败，请用系统 CAD 应用打开。'))
          } else if (message.type === 'agent-pi-cad:open-external') {
            openInExplorer(cwd, file.path, { file: file, reveal: false }).catch((err) => setError(String(err && err.message || err)))
          }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
      }, [isCad, cwd, file.path])
      const canEdit = kbSlug
        ? kind === 'markdown' || kind === 'text'
        : ((kind === 'markdown' || kind === 'text') && /\.(md|markdown|txt)$/i.test(file.path || file.name || ''))
          || (isOffice && office && office.editable)
      const canExport = kind === 'markdown' || kind === 'text'
      const heavy = kind === 'markdown' && previewIsHeavy(mode === 'edit' ? draft : (draft || text))
      const isWysiwyg = canEdit && kind === 'markdown' && mode === 'edit' && !sourceMode
      const visible = mode === 'edit' ? draft : (draft || text)
      const paintSlice = slicePreviewMarkdown(visible)
      const previewSource = paintSlice.text
      const officeDirty = !!(isOffice && office && officeSaved && JSON.stringify(office) !== JSON.stringify(officeSaved))
      const dirty = canEdit && (isUniver ? univerDirty : (isOffice ? officeDirty : draft !== text))
      const previewHtml = React.useMemo(() => {
        if (kind !== 'markdown') return ''
        try {
          return mdToHtml(previewSource, {
            cwd: cwd,
            filePath: file.path,
            tableRowCap: PREVIEW_TABLE_ROW_CAP,
          })
        } catch (err) {
          return '<p class="ap-err">预览生成失败，请用源码查看。</p>'
        }
      }, [kind, previewSource, cwd, file.path])

      const markdownFromWysiwyg = () => {
        if (!wysiwygRef.current) return fullMdRef.current || draft
        return stitchMarkdown(htmlToMarkdown(wysiwygRef.current), fullMdRef.current || text || draft)
      }

      const syncFromWysiwyg = () => {
        if (!wysiwygRef.current || !tablesReady) return draft
        const next = markdownFromWysiwyg()
        fullMdRef.current = next
        setDraft(next)
        return next
      }

      const currentMarkdown = () => {
        if (isWysiwyg && wysiwygRef.current && tablesReady && wysiwygTouched.current) return markdownFromWysiwyg()
        return mode === 'edit' ? (fullMdRef.current || draft) : (fullMdRef.current || draft || text)
      }

      React.useLayoutEffect(() => {
        if (kind !== 'markdown') return undefined
        if (isWysiwyg && wysiwygRef.current && !wysiwygTouched.current) {
          try {
            wysiwygRef.current.innerHTML = mdToHtml(slicePreviewMarkdown(fullMdRef.current || draft).text, Object.assign({}, mdCtx, { tableRowCap: PREVIEW_TABLE_ROW_CAP }))
          } catch (err) {
            wysiwygRef.current.innerHTML = '<p class="ap-err">预览生成失败，请用源码查看。</p>'
          }
          return () => { if (fillCtl.current) fillCtl.current.cancel() }
        }
        return () => { if (fillCtl.current) fillCtl.current.cancel() }
      }, [mode, sourceMode, file.path, kind, loading])

      const copyAll = () => {
        const value = currentMarkdown()
        if (!value) return
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        }).catch(() => {})
      }

      const persistMarkdown = (next, recalculate) => {
        setBusy('save')
        setError('')
        const saveReq = kbSlug
          ? api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ action: 'save-content', slug: kbSlug, text: next }) })
          : api('/api/agent-pi/files/save', cwd, { method: 'POST', body: JSON.stringify({ path: file.path, content: next, recalculate: !!recalculate }) })
        saveReq
          .then((body) => {
            setDraft(next)
            setText(next)
            previewCacheSet(previewCacheKey(cwd, file.path, kbSlug), Object.assign({}, body, { text: next, kind: kind }))
            const review = body && body.pricingReview
            setStatus(kbSlug
              ? '已保存并重建该条知识库'
              : (review && review.applied && review.deferred === 'no_pack')
                ? '已保存：已记入本标人工复核，组价包生成后自动套用'
                : (review && review.applied && review.workbook)
                  ? '已保存：已记入本标人工复核，并按新工效/单价重算数量，测算表已重生'
                  : (review && review.applied)
                    ? '已保存：已记入本标人工复核，并按新工效/单价重算相关数量'
                    : (body && body.kbSidecar)
                      ? '已保存并同步知识库检索'
                      : ((body && (body.packSidecar || body.reportSidecar)) ? '已保存并同步解析 JSON' : '已保存'))
            if (kbSlug && typeof props.onKbSaved === 'function') props.onKbSaved()
            else window.dispatchEvent(new Event('agent-pi-files-changed'))
          })
          .catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const saveContent = (content, memoryConfirmed) => {
        if (!canEdit || busy) return
        if (isOfficeUniver) return
        if (!kbSlug && !memoryConfirmed) {
          setBusy('memory-impact')
          setError('')
          api('/api/agent-pi/memory/impact', cwd, {
            method: 'POST',
            body: JSON.stringify({ path: file.path }),
          }).then((impact) => {
            if (impact && impact.affected) {
              const labels = (impact.stageLabels || impact.stageIds || []).join('、')
              const approval = impact.requiresReapproval ? '，并需要重新人工确认相关冻结门' : ''
              const accepted = window.confirm('这份文件属于「' + (impact.sourceStageLabel || impact.sourceStageId) + '」的已冻结基线。\n\n保存后将使以下阶段失效：' + labels + approval + '。\n\n仍要保存吗？')
              if (!accepted) {
                setBusy('')
                return
              }
            }
            setBusy('')
            saveContent(content, true)
          }).catch((e) => {
            setBusy('')
            setError('无法核对阶段基线影响，已取消保存：' + String(e.message || e))
          })
          return
        }
        if (isSlimUniver) {
          if (!univerDirty) return
          setBusy('save')
          setError('')
          const frame = univerRef.current
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage({ type: 'ap-univer', action: 'save' }, '*')
          } else {
            setBusy('')
            setError('表格还没打开')
          }
          return
        }
        if (isOffice) {
          if (!officeDirty) return
          setBusy('save')
          setError('')
          api('/api/agent-pi/files/save', cwd, {
            method: 'POST',
            body: JSON.stringify({
              path: file.path,
              office: {
                kind: office.kind,
                sheets: office.sheets,
                paragraphs: office.paragraphs,
                slides: office.slides,
              },
            }),
          }).then((body) => {
            setOfficeSaved(office)
            setStatus((body && body.hint) || '已保存')
            previewCache.delete(previewCacheKey(cwd, file.path, ''))
            window.dispatchEvent(new Event('agent-pi-files-changed'))
          }).catch((e) => setError(String(e.message || e))).finally(() => setBusy(''))
          return
        }
        const next = content == null ? currentMarkdown() : content
        if (next === text) return
        const pricingMd = !kbSlug && /(?:^|\/)boq-pricing\/.+\.md$/i.test(String(file.path || '').replace(/\\/g, '/'))
        if (pricingMd) {
          setBusy('save')
          setError('')
          api('/api/agent-pi/pricing/sensitive-diff', cwd, {
            method: 'POST',
            body: JSON.stringify({ path: file.path, content: next, previous: text }),
          }).then((body) => {
            if (!body || !body.hasSensitive) {
              persistMarkdown(next, false)
              return
            }
            setBusy('')
            setRecalcPrompt({ next: next, changes: body.changes || [] })
          }).catch((e) => {
            setBusy('')
            setError(String(e.message || e))
          })
          return
        }
        persistMarkdown(next, false)
      }

      const save = () => saveContent()

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            if (aiSel) { setAiSel(null); return }
            props.onClose()
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            saveContent()
          }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [props.onClose, canEdit, busy, cwd, file.path, draft, text, mode, sourceMode, aiSel, office, officeSaved, univerDirty])

      React.useEffect(() => {
        const onMsg = (event) => {
          const data = event && event.data
          if (!data || data.type !== 'ap-univer') return
          if (data.event === 'dirty') setUniverDirty(true)
          if (data.event === 'ready') {
            const names = Array.isArray(data.sheets) ? data.sheets.filter(Boolean) : []
            setStatus(names.length
              ? ('共 ' + names.length + ' 张表：' + names.join(' / ') + '。底部切表，保存写回原文件。图表请用对话完全体。')
              : '可改格子、底部切表，保存写回原文件')
          }
          if (data.event === 'saved') {
            setUniverDirty(false)
            setStatus(data.hint || '已保存回原文件')
            setBusy('')
            previewCache.delete(previewCacheKey(cwd, file.path, ''))
            window.dispatchEvent(new Event('agent-pi-files-changed'))
          }
          if (data.event === 'error') {
            setError(data.message || 'Univer 保存失败')
            setBusy('')
          }
        }
        window.addEventListener('message', onMsg)
        return () => window.removeEventListener('message', onMsg)
      }, [cwd, file.path])

      const applyEdit = (mutator) => {
        const el = editRef.current
        const start = el ? el.selectionStart : draft.length
        const end = el ? el.selectionEnd : draft.length
        const next = mutator(draft, start, end)
        setDraft(next.value)
        requestAnimationFrame(() => {
          if (!editRef.current) return
          editRef.current.focus()
          editRef.current.setSelectionRange(next.start, next.end)
        })
      }

      const wrapSel = (before, after) => applyEdit((value, start, end) => {
        const selected = value.slice(start, end) || '文本'
        return {
          value: value.slice(0, start) + before + selected + after + value.slice(end),
          start: start + before.length,
          end: start + before.length + selected.length,
        }
      })

      const prefixLines = (prefix) => applyEdit((value, start, end) => {
        const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
        const block = value.slice(from, end)
        const nextBlock = block.split('\n').map((line) => prefix + line.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*+]\s+/, '').replace(/^\s*\d+\.\s+/, '').replace(/^\s*>\s?/, '')).join('\n')
        return { value: value.slice(0, from) + nextBlock + value.slice(end), start: from, end: from + nextBlock.length }
      })

      const runWysiwyg = (command, value) => {
        if (!wysiwygRef.current) return
        wysiwygRef.current.focus()
        document.execCommand(command, false, value)
        wysiwygTouched.current = true
        syncFromWysiwyg()
      }

      const insertWysiwygHtml = (html) => {
        if (!wysiwygRef.current) return
        wysiwygRef.current.focus()
        document.execCommand('insertHTML', false, html)
        wysiwygTouched.current = true
        syncFromWysiwyg()
      }

      const format = (kindBtn) => {
        if (!isWysiwyg) {
          if (kindBtn === 'h1') return prefixLines('# ')
          if (kindBtn === 'h2') return prefixLines('## ')
          if (kindBtn === 'h3') return prefixLines('### ')
          if (kindBtn === 'b') return wrapSel('**', '**')
          if (kindBtn === 'i') return wrapSel('*', '*')
          if (kindBtn === 'ul') return prefixLines('- ')
          if (kindBtn === 'ol') return prefixLines('1. ')
          if (kindBtn === 'quote') return prefixLines('> ')
          if (kindBtn === 'code') return wrapSel('```\n', '\n```')
          if (kindBtn === 'table') {
            return applyEdit((value, start) => {
              const snippet = '\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n\n'
              return { value: value.slice(0, start) + snippet + value.slice(start), start: start + snippet.length, end: start + snippet.length }
            })
          }
          return
        }
        if (kindBtn === 'h1') return runWysiwyg('formatBlock', 'h1')
        if (kindBtn === 'h2') return runWysiwyg('formatBlock', 'h2')
        if (kindBtn === 'h3') return runWysiwyg('formatBlock', 'h3')
        if (kindBtn === 'b') return runWysiwyg('bold')
        if (kindBtn === 'i') return runWysiwyg('italic')
        if (kindBtn === 'ul') return runWysiwyg('insertUnorderedList')
        if (kindBtn === 'ol') return runWysiwyg('insertOrderedList')
        if (kindBtn === 'quote') return runWysiwyg('formatBlock', 'blockquote')
        if (kindBtn === 'code') {
          const selected = (window.getSelection() && window.getSelection().toString()) || 'code'
          return insertWysiwygHtml('<pre><code>' + escapeHtml(selected) + '</code></pre>')
        }
        if (kindBtn === 'table') {
          return insertWysiwygHtml('<table><thead><tr><th>列 1</th><th>列 2</th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table>')
        }
      }

      const toggleMode = () => {
        if (mode === 'edit') {
          const next = currentMarkdown()
          fullMdRef.current = next
          setDraft(next)
          setMode('preview')
          setSourceMode(false)
        } else {
          setMode('edit')
          setSourceMode(false)
        }
      }

      const toggleSource = () => {
        if (isWysiwyg) {
          const next = currentMarkdown()
          fullMdRef.current = next
          setDraft(next)
        } else {
          wysiwygTouched.current = false
        }
        setSourceMode(!sourceMode)
      }

      const asPdfBytes = (bytes) => {
        if (bytes instanceof Uint8Array) return bytes
        if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes)
        if (bytes && bytes.type === 'Buffer' && Array.isArray(bytes.data)) return new Uint8Array(bytes.data)
        if (bytes && typeof bytes.length === 'number') return new Uint8Array(bytes)
        throw new Error('PDF 导出返回了无法识别的数据')
      }

      const exportFile = (formatName) => {
        if (!canExport || busy) return
        const content = currentMarkdown()
        setBusy(formatName)
        setError('')
        setStatus(formatName === 'pdf' ? '正在排版 PDF…' : formatName === 'docx' ? '正在生成 Word…' : '正在导出 Markdown…')
        const desktopPdf = formatName === 'pdf' && window.agentPiDesktop && typeof window.agentPiDesktop.printToPdf === 'function'
        const requestExport = (format) => apiBlob('/api/agent-pi/files/export', cwd, {
          method: 'POST',
          body: JSON.stringify({ path: file.path, format: format, content: content }),
        })
        const run = async () => {
          if (desktopPdf) {
            try {
              const prepared = await requestExport('html')
              const html = await prepared.blob.text()
              const bytes = asPdfBytes(await window.agentPiDesktop.printToPdf(html))
              const filename = String(prepared.filename || file.name).replace(/\.html$/i, '.pdf')
              downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
              setStatus('已下载 ' + filename)
              return
            } catch {
              setStatus('桌面排版未完成，改用服务端导出…')
            }
          }
          const result = await requestExport(formatName)
          downloadBlob(result.blob, result.filename)
          setStatus('已下载 ' + result.filename)
        }
        run().catch((e) => {
          setStatus('')
          setError(String(e.message || e))
        }).finally(() => setBusy(''))
      }

      const remove = () => {
        if (busy) return
        if (!window.confirm('删除文件「' + file.name + '」？此操作无法撤销。')) return
        setBusy('delete')
        api('/api/agent-pi/memory/impact', cwd, { method: 'POST', body: JSON.stringify({ path: file.path }) })
          .then((impact) => {
            if (impact && impact.affected) {
              const labels = (impact.stageLabels || impact.stageIds || []).join('、')
              if (!window.confirm('删除这份冻结成果会使以下阶段失效：' + labels + '。\n\n仍要删除吗？')) return null
            }
            return api('/api/agent-pi/files/delete', cwd, { method: 'POST', body: JSON.stringify({ path: file.path }) })
          })
          .then((deleted) => {
            if (deleted === null) return
            window.dispatchEvent(new Event('agent-pi-files-changed'))
            if (typeof props.onDeleted === 'function') props.onDeleted()
            else props.onClose()
          })
          .catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const sendAiSel = () => {
        if (!aiSel || !aiSel.instruction || !aiSel.instruction.trim() || aiSel.sending) return
        setAiSel(Object.assign({}, aiSel, { sending: true }))
        let followup
        try {
          followup = buildPreviewSelectionFollowup({
            filePath: file.path,
            selectedText: aiSel.text,
            instruction: aiSel.instruction,
          })
        } catch (err) {
          setError(String(err.message || err))
          setAiSel(null)
          return
        }
        mentionInChat(props.sessionProps || props, file)
        dispatchToConversation(props.sessionProps || props, followup)
          .then(() => {
            setStatus('已把选区修改发回主对话')
            setAiSel(null)
          })
          .catch((e) => {
            setError(String(e.message || e))
            setAiSel(Object.assign({}, aiSel, { sending: false }))
          })
      }

      const openUniver = () => {
        const text = '请用 univer_import 打开这个文件，在对话里按项目记忆继续改，改完保存回原路径：\n' + file.path
        mentionInChat(props.sessionProps || props, file)
        dispatchToConversation(props.sessionProps || props, text)
          .then(() => setStatus('已请主对话用 Univer 打开此表'))
          .catch((e) => setError(String(e.message || e)))
      }

      const updateSheetCell = (sheetIndex, r, c, value) => {
        setOffice((prev) => {
          if (!prev || !prev.sheets) return prev
          const sheets = prev.sheets.map((sheet, i) => {
            if (i !== sheetIndex) return sheet
            const rows = sheet.rows.map((row) => row.slice())
            while (rows.length <= r) rows.push([])
            while (rows[r].length <= c) rows[r].push('')
            rows[r][c] = value
            return Object.assign({}, sheet, { rows: rows })
          })
          return Object.assign({}, prev, { sheets: sheets })
        })
      }

      const renderOffice = () => {
        if (!office) return h('div', { className: 'ap-doc-status' }, '正在读取 Office 文件…')
        if (kind === 'legacy-office') {
          return h('div', null,
            h('p', { className: 'ap-doc-hint' }, office.hint || '旧版 OLE 文件不能在预览里保存。'),
            DocBtn('用 Univer 打开', openUniver, [Icon('sparkles', 14), '用 Univer 打开']),
          )
        }
        if (kind === 'spreadsheet') {
          const sheets = office.sheets || []
          const sheet = sheets[sheetTab] || sheets[0] || { name: 'Sheet1', rows: [['']] }
          const rows = sheet.rows && sheet.rows.length ? sheet.rows : [['']]
          const cols = rows.reduce((max, row) => Math.max(max, row.length), 1)
          return h('div', { onMouseUp: onPreviewMouseUp },
            h('p', { className: 'ap-doc-hint' }, office.hint || (mode === 'edit' ? '改格子后 Ctrl+S 保存。' : '预览数值表。复杂公式请用 Univer。')),
            h('div', { className: 'ap-row', style: { marginBottom: 8 } },
              sheets.map((item, i) => h('button', {
                key: item.name + i,
                type: 'button',
                className: 'ap-doc-btn' + (i === sheetTab ? ' on' : ''),
                onClick: () => setSheetTab(i),
              }, item.name || ('Sheet ' + (i + 1)))),
            ),
            h('div', { className: 'ap-sheet' },
              h('table', null,
                h('tbody', null, rows.map((row, r) => h('tr', { key: r },
                  Array.from({ length: cols }, (_, c) => h('td', { key: c },
                    mode === 'edit'
                      ? h('input', {
                        value: row[c] || '',
                        onChange: (event) => updateSheetCell(sheetTab, r, c, event.target.value),
                      })
                      : (row[c] || ''),
                  )),
                ))),
              ),
            ),
          )
        }
        if (kind === 'word') {
          const paras = office.paragraphs || ['']
          return h('div', { onMouseUp: onPreviewMouseUp },
            h('p', { className: 'ap-doc-hint' }, office.hint || '改段落文字后保存。'),
            mode === 'edit'
              ? h('textarea', {
                className: 'ap-doc-edit',
                value: paras.join('\n\n'),
                onChange: (event) => setOffice(Object.assign({}, office, { paragraphs: event.target.value.split(/\n\n/) })),
              })
              : paras.map((line, i) => h('p', { key: i }, line || '\u00a0')),
          )
        }
        const slides = office.slides || []
        return h('div', { onMouseUp: onPreviewMouseUp },
          h('p', { className: 'ap-doc-hint' }, office.hint || '改每页已有文本框。'),
          slides.map((slide, i) => h('div', { key: i, className: 'ap-slide' },
            h('strong', null, slide.name || ('幻灯片 ' + (i + 1))),
            (slide.texts || []).map((line, j) => (
              mode === 'edit'
                ? h('input', {
                  key: j,
                  value: line,
                  onChange: (event) => {
                    const next = (office.slides || []).map((item, si) => {
                      if (si !== i) return item
                      const texts = (item.texts || []).slice()
                      texts[j] = event.target.value
                      return Object.assign({}, item, { texts: texts })
                    })
                    setOffice(Object.assign({}, office, { slides: next }))
                  },
                })
                : h('p', { key: j }, line)
            )),
          )),
        )
      }

      let body = null
      if (loading) {
        body = h('div', { className: 'ap-doc-status' }, '正在打开文件…')
      } else if (kind === 'image') {
        body = h('img', { className: 'ap-doc-img', src: rawFileUrl(cwd, file.path), alt: file.name })
      } else if (kind === 'pdf') {
        body = h('iframe', { className: 'ap-doc-frame', title: file.name, src: rawFileUrl(cwd, file.path) })
      } else if (kind === 'html') {
        body = h('iframe', {
          className: 'ap-doc-frame',
          title: file.name,
          src: siteUrl || rawFileUrl(cwd, file.path),
          sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups',
        })
      } else if (isCad) {
        body = cadUrl
          ? h('iframe', {
            ref: cadRef,
            className: 'ap-cad-frame',
            title: file.name,
            src: cadUrl,
            sandbox: 'allow-same-origin allow-scripts',
          })
          : h('div', { className: 'ap-doc-status' }, '二维 CAD 预览资源尚未就绪。')
      } else if (isUniver) {
        body = h('iframe', {
          ref: univerRef,
          className: 'ap-univer-frame',
          title: file.name,
          src: office.viewerUrl,
          allow: 'clipboard-read; clipboard-write; fullscreen',
        })
      } else if (isOffice) {
        body = renderOffice()
      } else if (kind === 'binary') {
        body = h('div', { className: 'ap-doc-status' }, '二进制文件无法在预览中排版。可用右上角下载原件，或右键加入对话后让智能体读取。')
      } else if (canEdit && mode === 'edit' && !isOffice) {
        body = h('div', null,
          h('p', { className: 'ap-doc-hint' }, dirty
            ? (kbSlug ? '未保存 · Ctrl+S 覆盖解析稿并重建知识库' : '未保存 · Ctrl+S 写回源文件')
            : (sourceMode ? '源码模式。切回所见即所得后继续排版。' : (tablesReady
              ? (kbSlug ? '改的是解析稿 Markdown，不是源 PDF/Word。Ctrl+S 保存后重建该条。' : (heavy
                ? '文档较大，所见即所得只渲染前 ' + PREVIEW_HEAD_CHARS + ' 字和大表前 ' + PREVIEW_TABLE_ROW_CAP + ' 行。保存时会把未显示部分拼回原文件。'
                : '直接在文档里改字，工具栏改标题/列表。Ctrl+S 保存。'))
              : '正在渲染表格，完成后即可直接改。'))),
          h('div', { className: 'ap-doc-toolbar' },
            DocBtn('一级标题', () => format('h1'), 'H1'),
            DocBtn('二级标题', () => format('h2'), 'H2'),
            DocBtn('三级标题', () => format('h3'), 'H3'),
            DocBtn('粗体', () => format('b'), 'B'),
            DocBtn('斜体', () => format('i'), 'I'),
            DocBtn('无序列表', () => format('ul'), '列表'),
            DocBtn('有序列表', () => format('ol'), '编号'),
            DocBtn('引用', () => format('quote'), '引用'),
            DocBtn('代码块', () => format('code'), '代码'),
            DocBtn('表格', () => format('table'), '表格'),
            kind === 'markdown' ? h('button', {
              type: 'button',
              className: 'ap-doc-btn' + (sourceMode ? ' on' : ''),
              title: sourceMode ? '所见即所得' : 'Markdown 源码',
              onClick: toggleSource,
            }, sourceMode ? '排版' : '源码') : null,
          ),
          kind === 'markdown' && !sourceMode
            ? h('div', {
              ref: wysiwygRef,
              className: 'ap-doc-wysiwyg',
              contentEditable: tablesReady,
              suppressContentEditableWarning: true,
              spellCheck: false,
              onInput: () => { wysiwygTouched.current = true; syncFromWysiwyg(); setStatus('') },
              onMouseUp: onPreviewMouseUp,
            })
            : h('textarea', {
              ref: editRef,
              className: 'ap-doc-edit',
              value: draft,
              spellCheck: false,
              onChange: (event) => {
                fullMdRef.current = event.target.value
                setDraft(event.target.value)
                setStatus('')
              },
              onMouseUp: onPreviewMouseUp,
            }),
        )
      } else if (kind === 'markdown') {
        body = h('div', null,
          heavy ? h('p', { className: 'ap-doc-hint' }, '文档较大，先显示前 ' + PREVIEW_HEAD_CHARS + ' 字。点表格下的「展开」只展开该表，不要一次填完全文。') : null,
          h('div', {
            ref: previewBoxRef,
            onClick: onPreviewClick,
            onMouseUp: onPreviewMouseUp,
            dangerouslySetInnerHTML: { __html: previewHtml },
          }),
        )
      } else {
        body = h('pre', {
          style: { whiteSpace: 'pre-wrap', margin: 0, font: 'var(--dsw-font-markdown-code-block-small)' },
          onMouseUp: onPreviewMouseUp,
        }, visible)
      }

      return h('div', { className: 'ap-doc', role: 'dialog', 'aria-modal': 'true', 'aria-label': file.name },
        h('div', { className: 'ap-doc-hd' },
          h('div', { className: 'ap-doc-path', title: kbSlug ? (file.name + ' · 解析稿') : file.path }, kbSlug ? ((file.name || kbSlug) + ' · 解析稿') : file.path),
          h('div', { className: 'ap-doc-actions' },
            kbSlug ? null : DocBtn('注入对话', () => {
              mentionInChat(props.sessionProps || props, file)
              if (typeof props.onClose === 'function') props.onClose()
            }, [Icon('paperclip', 14), '注入对话'], loading),
            isCad ? null : DocBtn('AI 改', () => openAiSel(), [Icon('sparkles', 14), 'AI 改'], loading || !!busy),
            canEdit && !isUniver ? DocBtn(mode === 'edit' ? '预览' : '编辑', toggleMode, [
              Icon(mode === 'edit' ? 'eye' : 'pencil', 14),
            ], loading) : null,
            canEdit && !isOfficeUniver ? DocBtn('保存', save, [Icon('save', 14)], loading || !dirty || !!busy) : null,
            isOffice && !isOfficeUniver ? DocBtn(isSlimUniver ? '对话完全体' : '用 Univer 打开', openUniver, [Icon('sparkles', 14), isSlimUniver ? '对话完全体' : 'Univer'], loading || !!busy) : null,
            canExport ? DocBtn(copied ? '已复制' : '复制全文', copyAll, [Icon('copy', 14)], loading || !visible) : null,
            kbSlug && kbHasSource ? DocBtn('打开源文件', () => {
              api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ action: 'open-source', slug: kbSlug }) })
                .catch((e) => setError(String(e.message || e)))
            }, [Icon('folder', 14), '打开源文件'], !!busy) : null,
            kbSlug ? null : DocBtn('删除', remove, [Icon('trash', 14)], !!busy),
            isCad ? DocBtn('系统打开', () => {
              openInExplorer(cwd, file.path, { file: file, reveal: false })
                .catch((err) => setError(String(err && err.message || err)))
            }, [Icon('folder', 14), '系统打开'], loading || !!busy) : null,
            kbSlug ? null : (canExport ? h('div', { className: 'ap-doc-exports' },
              DocBtn('导出 Markdown', () => exportFile('md'), [Icon('download', 14), ' MD'], !!busy),
              DocBtn('导出 PDF', () => exportFile('pdf'), [Icon('download', 14), ' PDF'], !!busy),
              DocBtn('导出 Word', () => exportFile('docx'), [Icon('download', 14), ' DOCX'], !!busy),
            ) : null),
            kind === 'binary' || kind === 'pdf' || kind === 'image' || isOffice || kind === 'html' || isCad ? DocBtn('下载原件', () => {
              apiBlob('/api/agent-pi/files/raw?path=' + encodeURIComponent(file.path), cwd, { method: 'GET' })
                .then((result) => downloadBlob(result.blob, result.filename || file.name))
                .catch((e) => setError(String(e.message || e)))
            }, [Icon('download', 14)], !!busy) : null,
            DocBtn('关闭', props.onClose, [Icon('x', 14)]),
          ),
        ),
        h('div', { className: 'ap-doc-scroll' + (isUniver ? ' univer' : (isCad ? ' cad' : '')) },
          isUniver || isCad
            ? h(React.Fragment, null,
              error ? h('div', { className: 'ap-err', style: { padding: '8px 12px', position: 'relative', zIndex: 2 } }, error) : null,
              ((!isOfficeUniver && !isCad) || (isCad && error)) && status ? h('div', { className: 'ap-doc-status', style: { padding: '8px 12px', position: 'relative', zIndex: 2 } }, status) : null,
              body,
            )
            : (kind === 'pdf' || kind === 'html'
              ? body
              : h('div', { className: 'ap-doc-sheet' + (mode === 'edit' && sourceMode ? ' wide' : '') },
                error ? h('div', { className: 'ap-err' }, error) : null,
                status ? h('div', { className: 'ap-doc-status' }, status) : null,
                body,
              )),
        ),
        cite ? h('div', { className: 'ap-cite-pop' },
          h('div', { className: 'ap-cite-pop-hd' },
            Icon(cite.data && cite.data.kind === 'kb' ? 'book' : 'file', 14),
            h('strong', { title: cite.token },
              cite.data && cite.data.label ? cite.data.label : cite.token),
            h('button', { type: 'button', className: 'ap-doc-btn', onClick: () => setCite(null) }, Icon('x', 12)),
          ),
          h('div', { className: 'ap-cite-pop-bd' },
            cite.loading ? '加载中…'
              : cite.kind === 'error' ? h('span', { className: 'ap-err' }, cite.error)
              : cite.data
                ? h(React.Fragment, null,
                  cite.data.exists === false
                    ? h('p', { className: 'ap-err' }, '找不到该出处')
                    : null,
                  cite.data.source ? h('p', null, '源文件：' + cite.data.source) : null,
                  cite.data.page ? h('p', null, '页：第 ' + cite.data.page + ' 页')
                    : (cite.data.lineStart ? h('p', null, '行：L' + cite.data.lineStart + (cite.data.lineEnd && cite.data.lineEnd !== cite.data.lineStart ? '–L' + cite.data.lineEnd : '')) : null),
                  cite.data.heading ? h('p', null, '题目 / 段落：' + cite.data.heading) : null,
                  cite.data.clause ? h('p', { className: 'crumb' }, '条款 ' + cite.data.clause) : null,
                  cite.data.path
                    ? h('p', null, h('button', { type: 'button', className: 'ap-doc-btn', onClick: () => openCitedFile(cite.data.path) }, '打开源文件'))
                    : null,
                )
                : null,
          ),
        ) : null,
        recalcPrompt ? h('div', {
          className: 'ap-overlay',
          'data-ap-recalc-confirm': '1',
          onClick: (event) => { if (event.target === event.currentTarget) setRecalcPrompt(null) },
        },
          h('div', { className: 'ap-modal wide' },
            h('h1', null, '确认人工复核并全局调整'),
            h('p', { className: 'hint' }, '这些是本标人工复核准确数。确定后写入项目复核库，并按新工效、单价重算相关资源数量与金额。取消则不保存。'),
            h('ul', { style: { paddingLeft: 18, margin: '8px 0 16px' } },
              (recalcPrompt.changes || []).map((row, index) => h('li', { key: row.key || index },
                (row.kind === 'productivity' ? '工效' : '单价')
                + ' · ' + row.label
                + (row.itemHint ? '（' + row.itemHint + '）' : '')
                + '：' + row.from + ' → ' + row.to
                + (row.unit ? ' ' + row.unit : ''),
              )),
            ),
            h('div', { className: 'ap-foot' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => setRecalcPrompt(null) }, '取消'),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                onClick: () => {
                  const next = recalcPrompt.next
                  setRecalcPrompt(null)
                  persistMarkdown(next, true)
                },
              }, '确认并全局调整'),
            ),
          ),
        ) : null,
        aiSel ? h('div', { className: 'ap-ai-sel', onMouseDown: (event) => { if (event.target === event.currentTarget) setAiSel(null) } },
          h('div', { className: 'ap-ai-sel-card', role: 'dialog', 'aria-label': 'AI 改选区' },
            h('div', { className: 'ap-ai-sel-hd' },
              Icon('sparkles', 16),
              'AI 改选区',
              h('button', { type: 'button', className: 'ap-doc-btn ap-ai-sel-x', onClick: () => setAiSel(null) }, Icon('x', 14)),
            ),
            h('p', { className: 'ap-sub' }, '指令会发回当前主对话，带上本项目记忆。不要另开窗口改。'),
            h('p', { className: 'ap-sub', style: { maxHeight: 72, overflow: 'auto' } }, '选中：' + aiSel.text.slice(0, 240) + (aiSel.text.length > 240 ? '…' : '')),
            h('textarea', {
              placeholder: '改什么、怎么改',
              value: aiSel.instruction,
              onChange: (event) => setAiSel(Object.assign({}, aiSel, { instruction: event.target.value })),
            }),
            h('div', { className: 'ap-row', style: { justifyContent: 'flex-end', marginTop: 12 } },
              DocBtn('取消', () => setAiSel(null)),
              DocBtn('发给主对话', sendAiSel, [Icon('sparkles', 14), '发给主对话'], !String(aiSel.instruction || '').trim() || aiSel.sending),
            ),
          ),
        ) : null,
      )
    }

    function FolderPreviewOverlay(props) {
      const cwd = props.cwd
      const [current, setCurrent] = React.useState(props.folder)
      const [items, setItems] = React.useState([])
      const [error, setError] = React.useState('')
      const [loading, setLoading] = React.useState(true)
      const [menu, setMenu] = React.useState(null)

      React.useEffect(() => { setCurrent(props.folder) }, [props.folder && props.folder.path])

      React.useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')
        api('/api/agent-pi/files?parentPath=' + encodeURIComponent(current.path), cwd, { method: 'GET' })
          .then((body) => {
            if (cancelled) return
            setItems(body.files || [])
            setLoading(false)
          })
          .catch((e) => {
            if (cancelled) return
            setError(String(e.message || e))
            setLoading(false)
          })
        return () => { cancelled = true }
      }, [cwd, current.path])

      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') props.onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [props.onClose])

      return h('div', { className: 'ap-doc', role: 'dialog', 'aria-modal': 'true', 'aria-label': current.name },
        h('div', { className: 'ap-doc-hd' },
          h('div', { className: 'ap-doc-path', title: current.path }, current.path),
          h('div', { className: 'ap-doc-actions' },
            DocBtn('关闭', props.onClose, [Icon('x', 14)]),
          ),
        ),
        h('div', { className: 'ap-doc-scroll' },
          h('div', { className: 'ap-doc-sheet' },
            h('h1', null, current.name),
            error ? h('div', { className: 'ap-err' }, error) : null,
            loading ? h('div', { className: 'ap-doc-status' }, '正在列出文件夹…') : null,
            !loading && items.length === 0 ? h('p', null, '这个文件夹是空的。') : null,
            items.map((item) => h('div', { key: item.path, className: 'ap-tree-row' },
              h('button', {
                type: 'button',
                className: 'ap-folder-row',
                onClick: () => {
                  if (item.type === 'directory') setCurrent(item)
                  else mentionInChat(props.sessionProps || props, item)
                },
                onContextMenu: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenu({ x: e.clientX, y: e.clientY, file: item })
                },
              },
                Icon(fileIconName(item), 16, fileIconClass(item)),
                h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, item.name),
                h('span', { className: 'ap-sub' }, item.type === 'directory' ? '文件夹' : ''),
              ),
              item.type === 'directory' ? null : h('button', {
                type: 'button',
                className: 'ap-tree-inject',
                title: '注入对话',
                onClick: (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  mentionInChat(props.sessionProps || props, item)
                },
              }, Icon('paperclip', 13)),
            )),
          ),
        ),
        h(FileContextMenu, { menu: menu, onClose: () => setMenu(null) },
          menu ? [
            h('button', { key: 'inject', type: 'button', onClick: () => { mentionInChat(props.sessionProps || props, menu.file); setMenu(null) } }, Icon('paperclip', 14), '注入对话'),
            menu.file.type !== 'directory' || looksLikeKbPackName(menu.file)
              ? h('button', { key: 'kb', type: 'button', onClick: () => {
                importWorkspaceFileToKb(cwd, menu.file, props.sessionProps || props)
                setMenu(null)
              } }, Icon('filePlus', 14), looksLikeKbPackName(menu.file) ? '一键导入知识包' : '一键导入知识库')
              : null,
            h('button', { key: 'open', type: 'button', onClick: () => {
              setMenu(null)
              if (menu.file.type === 'directory') setCurrent(menu.file)
              else if (typeof props.onOpenFile === 'function') props.onOpenFile(menu.file, current)
            } }, Icon(menu.file.type === 'directory' ? 'folder' : 'fileText', 14), '打开'),
          ] : null,
        ),
      )
    }

    function FilesPanel(props) {
      useApLang()
      const cwd = readWorkspaceCwd(props)
      const [files, setFiles] = React.useState([])
      const [error, setError] = React.useState('')
      const [expanded, setExpanded] = React.useState({})
      const [menu, setMenu] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const fileInput = React.useRef(null)
      const folderInput = React.useRef(null)

      const load = React.useCallback(() => {
        if (!cwd) return
        api('/api/agent-pi/files', cwd, { method: 'GET' })
          .then((body) => {
            const nextFiles = body.files || []
            runtime.files = flattenFiles(nextFiles, [])
            setFiles(nextFiles)
            setError('')
            setExpanded((prev) => {
              const seeded = {}
              const walk = (nodes) => {
                for (const node of nodes || []) {
                  if (node.type === 'directory' && node.source === 'official-output') {
                    seeded[node.path] = true
                    walk(node.children)
                  }
                }
              }
              walk(nextFiles)
              return Object.assign({}, seeded, prev)
            })
          })
          .catch((e) => setError(String(e.message || e)))
      }, [cwd])

      React.useEffect(() => { setExpanded({}); load() }, [load])
      React.useEffect(() => {
        const onChanged = () => load()
        window.addEventListener('agent-pi-files-changed', onChanged)
        window.addEventListener('agent-pi-created', onChanged)
        return () => {
          window.removeEventListener('agent-pi-files-changed', onChanged)
          window.removeEventListener('agent-pi-created', onChanged)
        }
      }, [load])

      const toggle = (file) => {
        if (file.type !== 'directory') return
        const open = !expanded[file.path]
        setExpanded((prev) => Object.assign({}, prev, { [file.path]: open }))
        if (open && file.hasMoreChildren && !file.childrenLoaded) {
          api('/api/agent-pi/files?parentPath=' + encodeURIComponent(file.path), cwd, { method: 'GET' })
            .then((body) => {
              const kids = body.files || []
              setFiles((prev) => replaceChildren(prev, file.path, kids))
              if (file.source === 'official-output') {
                setExpanded((prev) => {
                  const next = Object.assign({}, prev, { [file.path]: true })
                  for (const child of kids) {
                    if (child.type === 'directory' && (child.source === 'official-output' || file.source === 'official-output')) next[child.path] = true
                  }
                  return next
                })
              }
            })
            .catch((e) => setError(String(e.message || e)))
        }
      }

      const openPreview = (file) => {
        setMenu(null)
        if (typeof props.onOpenFile === 'function') props.onOpenFile(file)
      }

      const openFolder = (file) => {
        setMenu(null)
        if (typeof props.onOpenFolder === 'function') props.onOpenFolder(file)
      }

      const renderNode = (file) => {
        const open = !!expanded[file.path]
        const pill = sourceLabel(file.source)
        return h('div', { key: file.path },
          h('div', { className: 'ap-tree-row' },
            h('button', {
              type: 'button',
              className: 'ap-tree-btn',
              title: file.relativePath || file.path,
              onClick: () => file.type === 'directory' ? openFolder(file) : openPreview(file),
              onDoubleClick: () => { if (file.type !== 'directory') openPreview(file) },
              onContextMenu: (e) => {
                e.preventDefault()
                e.stopPropagation()
                setMenu({ x: e.clientX, y: e.clientY, file: file })
              },
            },
              file.type === 'directory'
                ? h('span', {
                  style: { transform: open ? 'rotate(90deg)' : 'none', display: 'inline-flex' },
                  onClick: (event) => { event.stopPropagation(); toggle(file) },
                }, Icon('chevron', 12))
                : h('span', { style: { width: 12 } }),
              Icon(fileIconName(file), 16, fileIconClass(file)),
              h('span', { className: 'ap-tree-name' }, displayFileName(file)),
              pill ? h('span', { className: 'ap-chip' + (file.source === 'official-output' ? ' live' : '') }, pill) : null,
            ),
            file.type === 'directory' ? null : h('button', {
              type: 'button',
              className: 'ap-tree-inject',
              title: '注入对话',
              onClick: (e) => {
                e.preventDefault()
                e.stopPropagation()
                mentionInChat(props, file)
              },
            }, Icon('paperclip', 13)),
          ),
          file.type === 'directory' && open
            ? h('div', { className: 'ap-tree-kids' }, (file.children || []).map(renderNode))
            : null,
        )
      }

      const closePanel = () => {
        if (typeof props.onToggle === 'function') props.onToggle()
        else if (typeof props.onClose === 'function') props.onClose()
        else if (typeof props.closeDetails === 'function') props.closeDetails()
      }
      const collapsed = !!props.collapsed

      const officialRoots = files.filter((file) => file.source === 'official-output')
      const workspaceRoots = files.filter((file) => file.source !== 'official-output')

      return h('div', { className: 'ap-files' },
        h('div', { className: 'ap-files-hd' },
          h('strong', null, tAp('files.title')),
          h('div', { className: 'ap-row' },
            h('button', { type: 'button', className: 'ap-toolbtn', title: tAp('files.uploadFiles'), onClick: () => chooseAndUpload(cwd, snapshotComposer(), 'files', { fileInput, folderInput }).catch((err) => setError(String(err.message || err))) }, Icon('paperclip', 14)),
            h('button', { type: 'button', className: 'ap-toolbtn', title: tAp('files.addFolder'), onClick: () => chooseFolderForChat(cwd, snapshotComposer()).catch((err) => setError(String(err.message || err))) }, Icon('filePlus', 14)),
            h('button', { type: 'button', className: 'ap-toolbtn', title: tAp('files.openExplorer'), onClick: () => openInExplorer(cwd).catch((err) => setError(String(err && err.message || err))) }, Icon('folder', 14)),
            h('button', { type: 'button', className: 'ap-toolbtn', title: tAp('files.refresh'), onClick: load }, Icon('refresh', 14, busy ? 'ap-spin' : '')),
            h('button', {
              type: 'button',
              className: 'ap-toolbtn ap-files-toggle',
              title: collapsed ? tAp('files.expand') : tAp('files.collapse'),
              'aria-label': collapsed ? tAp('files.expand') : tAp('files.collapse'),
              'aria-expanded': collapsed ? 'false' : 'true',
              onClick: closePanel,
            }, Icon('panelRight', 16)),
          ),
        ),
        h('input', { ref: fileInput, type: 'file', multiple: true, style: { position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }, onChange: (e) => {
          const list = snapshotFileList(e.target.files)
          e.target.value = ''
          if (!list.length) return
          setBusy(true)
          uploadFileList(cwd, list, snapshotComposer()).catch((err) => setError(String(err.message || err))).finally(() => setBusy(false))
        } }),
        h('input', { ref: folderInput, type: 'file', multiple: true, webkitdirectory: 'true', directory: 'true', style: { position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }, onChange: (e) => {
          const list = snapshotFileList(e.target.files)
          e.target.value = ''
          if (!list.length) return
          const rel = String(list[0].webkitRelativePath || list[0].name)
          attachFolderPath(snapshotComposer(), rel.split(/[\\/]/)[0] || 'folder')
        } }),
        error ? h('div', { className: 'ap-err', style: { padding: '0 12px' } }, error) : null,
        h('div', { className: 'ap-files-tree' },
          !cwd ? h('div', { className: 'ap-sub', style: { padding: '8px 6px' } }, tAp('files.pickWorkspace')) : [
            h('div', { key: 'sec-out', className: 'ap-files-sec' }, tAp('files.official')),
            officialRoots.length === 0
              ? h('div', { key: 'out-empty', className: 'ap-files-empty' }, tAp('files.officialEmpty'))
              : officialRoots.map(renderNode),
            officialRoots.length === 1 && !(officialRoots[0].children || []).length
              ? h('div', { key: 'out-hint', className: 'ap-files-empty' }, tAp('files.officialHint'))
              : null,
            h('div', { key: 'sec-work', className: 'ap-files-sec' }, tAp('files.workspace')),
            workspaceRoots.length === 0
              ? h('div', { key: 'work-empty', className: 'ap-sub', style: { padding: '8px 6px' } }, '工作区还没有可见文件。用上方回形针上传资料。')
              : workspaceRoots.map(renderNode),
          ],
        ),
        h(FileContextMenu, { menu: menu, onClose: () => setMenu(null) },
          menu ? [
            h('button', { key: 'inject', type: 'button', onClick: () => { mentionInChat(props, menu.file); setMenu(null) } }, Icon('paperclip', 14), '注入对话'),
            menu.file.type !== 'directory' || looksLikeKbPackName(menu.file)
              ? h('button', { key: 'kb', type: 'button', onClick: () => {
                importWorkspaceFileToKb(cwd, menu.file, props)
                setMenu(null)
              } }, Icon('filePlus', 14), looksLikeKbPackName(menu.file) ? '一键导入知识包' : '一键导入知识库')
              : null,
            h('button', { key: 'open', type: 'button', onClick: () => menu.file.type === 'directory' ? openFolder(menu.file) : openPreview(menu.file) }, Icon(menu.file.type === 'directory' ? 'folder' : 'fileText', 14), '打开'),
            menu.file.type !== 'directory' && menu.file.source !== 'official-output'
              ? h('button', { key: 'promote', type: 'button', onClick: () => {
                api('/api/agent-pi/files/promote', cwd, { method: 'POST', body: JSON.stringify({ path: menu.file.path }) })
                  .then(() => { window.dispatchEvent(new Event('agent-pi-files-changed')); setMenu(null) })
                  .catch((e) => setError(String(e.message || e)))
              } }, Icon('export', 14), '导出到正式产出') : null,
            h('button', { key: 'reveal', type: 'button', onClick: () => {
              openInExplorer(cwd, menu.file.path, {
                file: menu.file,
                reveal: menu.file.type !== 'directory',
              }).catch((err) => setError(String(err && err.message || err)))
              setMenu(null)
            } }, Icon('folder', 14), '在资源管理器中显示'),
          ] : null,
        ),
      )
    }

  return { FilePreviewOverlay, FolderPreviewOverlay, FilesPanel }
}
