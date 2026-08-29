export function createKnowledgeBasePanel(dependencies) {
  const {
    Icon,
    KB_PRESET_CATEGORIES,
    React,
    apJoin,
    api,
    apiBlob,
    desktopApi,
    diskPathOf,
    downloadBlob,
    ensureKbFileInput,
    fileIconClass,
    fileIconName,
    fileName,
    formatKbBytes,
    groupKbEntries,
    h,
    kbCategoryHint,
    kbCategoryLabel,
    kbChatImportCopy,
    kbFidelityLabel,
    kbIngestKind,
    kbIngestLabel,
    kbLandingCardVisible,
    kbPickPatch,
    kbPickState,
    kbPickUpsert,
    kbProgressText,
    kbTitle,
    mergeKbEntries,
    normalizePickedPaths,
    parkKbFileInput,
    resolveSessionId,
    runtime,
    sortKbCategories,
    tAp,
    uploadKbBytes,
    useApLang,
  } = dependencies

    function kbTaskStorageKey(sessionId) {
      return 'ap-kb-task:' + (sessionId || 'active')
    }
    function readKbTaskSlugs(sessionId) {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(kbTaskStorageKey(sessionId)) || '[]')
        return Array.isArray(parsed) ? parsed.map(String) : []
      } catch { return [] }
    }
    function writeKbTaskSlugs(sessionId, slugs) {
      try { sessionStorage.setItem(kbTaskStorageKey(sessionId), JSON.stringify(slugs || [])) } catch { /* ignore */ }
    }
    function kbTaskStore() {
      return window.__apKbTask || (window.__apKbTask = { bySession: {} })
    }
    function publishKbTask(sessionId, slugs, entries) {
      const sid = sessionId || 'active'
      const picked = (entries || []).filter((entry) => entry && slugs.indexOf(entry.slug) >= 0)
      kbTaskStore().bySession[sid] = { slugs: (slugs || []).slice(), entries: picked }
      writeKbTaskSlugs(sid, slugs)
    }
    function kbTaskOf(sessionId) {
      const sid = sessionId || 'active'
      const published = kbTaskStore().bySession[sid]
      if (published && Array.isArray(published.slugs)) return published
      return { slugs: readKbTaskSlugs(sid), entries: [] }
    }
    function formatKbTaskBlock(sessionId) {
      const task = kbTaskOf(sessionId)
      if (!task.slugs || !task.slugs.length) return ''
      const rows = task.entries && task.entries.length
        ? task.entries.map((entry) => '- [' + (entry.category || '') + '] ' + kbTitle(entry) + ' — ' + entry.slug)
        : task.slugs.map((slug) => '- ' + slug)
      return [
        '<!--agent-pi-kb-task-->',
        '本次任务选用知识库（入库后即时生效，仅下列条目在范围内）：',
        rows.join('\n'),
        '检索用 kb_search({ slugs }) / kb_find_clause / kb_find_table，再 kb_read_chunk。引用 [kb:slug:chunkId]。未列出的条目不要当成本次依据。',
        '<!--/agent-pi-kb-task-->',
      ].join('\n')
    }

    function KnowledgeBasePanel(props) {
      useApLang()
      const cwd = props.cwd || ''
      const sessionId = props.sessionId || resolveSessionId(props) || runtime.sessionId || 'active'
      const inputStyle = { flex: '1 1 160px', minWidth: 0, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit', font: 'inherit' }
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [addPath, setAddPath] = React.useState('')
      const [addCategory, setAddCategory] = React.useState('规范')
      const [customCategory, setCustomCategory] = React.useState('')
      const [addName, setAddName] = React.useState('')
      const [pickedLabel, setPickedLabel] = React.useState('')
      const [selectedSlugs, setSelectedSlugs] = React.useState(() => readKbTaskSlugs(sessionId))
      const selectedRef = React.useRef(selectedSlugs)
      selectedRef.current = selectedSlugs
      const [query, setQuery] = React.useState('')
      const [hits, setHits] = React.useState(null)
      const [tokenDraft, setTokenDraft] = React.useState('')
      const [dragOver, setDragOver] = React.useState(false)
      const pickWrapRef = React.useRef(null)
      const [, setPickTick] = React.useState(0)
      const parsingRef = React.useRef([])
      const [success, setSuccess] = React.useState('')
      const [folderDialog, setFolderDialog] = React.useState(null)
      const [confirmDialog, setConfirmDialog] = React.useState(null)
      const folderInputRef = React.useRef(null)
      const KB_FILE_RE = /\.(md|markdown|txt|json|pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp|apkb)$/i
      const KB_TEXT_RE = /\.(md|markdown|txt|json)$/i
      const PRESET_CATEGORIES = KB_PRESET_CATEGORIES
      const resolveCategory = () => addCategory === '__custom__'
        ? (customCategory.trim() || '未分类')
        : (addCategory.trim() || '规范')

      const persistSelection = React.useCallback((slugs, entries) => {
        selectedRef.current = slugs
        publishKbTask(sessionId, slugs, entries || [])
        return api('/api/agent-pi/kb', cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'select', slugs: slugs, sessionId: sessionId }),
        }).then((body) => {
          if (body && Array.isArray(body.selectedSlugs)) {
            const next = body.selectedSlugs.map(String)
            selectedRef.current = next
            publishKbTask(sessionId, next, entries || [])
            return next
          }
          return slugs
        }).catch(() => slugs)
      }, [cwd, sessionId])
      const load = React.useCallback((preferredSlugs) => {
        return api('/api/agent-pi/kb?sessionId=' + encodeURIComponent(sessionId), cwd, { method: 'GET' })
          .then((body) => {
            const merged = mergeKbEntries((body && body.entries) || [], kbPickState.entries)
            kbPickState.entries = merged.filter((entry) => String(entry && entry.slug || '').indexOf('local:') === 0)
            if (!kbLandingCardVisible(kbPickState.pickedLabel, merged)) {
              kbPickPatch({ pickedLabel: '', notice: kbPickState.notice })
              setPickedLabel('')
            }
            setData(Object.assign({}, body || {}, { entries: merged, entryCount: merged.length }))
            setError(kbPickState.error || '')
            const fromServer = Object.prototype.hasOwnProperty.call(body, 'selectedSlugs') && Array.isArray(body.selectedSlugs)
              ? body.selectedSlugs.map(String)
              : null
            const local = readKbTaskSlugs(sessionId)
            const next = preferredSlugs
              || (fromServer && fromServer.length ? fromServer : null)
              || (local.length ? local : (fromServer || []))
            selectedRef.current = next
            setSelectedSlugs(next)
            publishKbTask(sessionId, next, (body && body.entries) || [])
            if (body && !Object.prototype.hasOwnProperty.call(body, 'mineru')) {
              setNotice(tAp('kb.oldHostMineru'))
            }
            return body
          })
          .catch((e) => setError(String(e.message || e)))
      }, [cwd, sessionId])
      React.useEffect(() => { load() }, [load])
      React.useEffect(() => {
        const sync = () => setPickTick((n) => n + 1)
        kbPickState.listeners.add(sync)
        if (kbPickState.pickedLabel) setPickedLabel(kbPickState.pickedLabel)
        if (kbPickState.error) setError(kbPickState.error)
        if (kbPickState.notice) setNotice(kbPickState.notice)
        return () => { kbPickState.listeners.delete(sync) }
      }, [])
      React.useEffect(() => {
        if (!folderDialog) return undefined
        const node = folderInputRef.current
        if (node && typeof node.focus === 'function') node.focus()
        return undefined
      }, [folderDialog])
      React.useEffect(() => {
        const input = ensureKbFileInput()
        const slot = pickWrapRef.current
        if (input && slot && input.parentNode !== slot) slot.appendChild(input)
        return () => { parkKbFileInput() }
      })
      React.useEffect(() => {
        const onChanged = () => { load(selectedRef.current) }
        window.addEventListener('agent-pi-kb-changed', onChanged)
        return () => window.removeEventListener('agent-pi-kb-changed', onChanged)
      }, [load])
      React.useEffect(() => {
        const entries = (data && data.entries) || []
        const parsing = entries.filter((entry) => entry.parseStatus === 'parsing').map((entry) => entry.slug)
        const newlyReady = parsingRef.current.filter((slug) => {
          const entry = entries.find((item) => item.slug === slug)
          return entry && entry.parseStatus === 'ready'
        })
        if (newlyReady.length) {
          const names = newlyReady.map((slug) => {
            const entry = entries.find((item) => item.slug === slug)
            return kbTitle(entry)
          }).join('、')
          setSuccess(tAp('kb.ingestedOk', { names: names }))
          setNotice('')
          const next = selectedRef.current.concat(newlyReady).filter((item, index, all) => all.indexOf(item) === index)
          selectedRef.current = next
          setSelectedSlugs(next)
          persistSelection(next, entries)
        }
        parsingRef.current = parsing
        if (!parsing.length) return undefined
        const timer = setInterval(() => { load(selectedRef.current) }, 1500)
        return () => clearInterval(timer)
      }, [data, load, persistSelection])

      const post = (body, busyKey) => {
        setBusy(busyKey)
        setError('')
        setNotice('')
        return api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify(body) })
          .catch((e) => { setError(String(e.message || e)); return null })
          .finally(() => setBusy(''))
      }

      const mergeKbEntry = (entry) => {
        if (!entry || !entry.slug) return
        kbPickUpsert(entry)
        setData((current) => {
          const localName = 'local:' + (entry.name || entry.originalName || '')
          const entries = ((current && current.entries) || []).filter((item) => item.slug !== entry.slug && item.slug !== localName)
          const next = [entry].concat(entries)
          return Object.assign({}, current || {}, { entries: next, entryCount: next.length })
        })
      }
      const applyTransferResult = (result) => {
        if (!result) return result
        const entryNames = (result.entries || []).map((entry) => entry.name || entry.slug)
        const skillNames = (result.skills || []).map((skill) => skill.slug)
        const parts = []
        if (entryNames.length) parts.push(tAp('kb.transferEntries', { n: entryNames.length }))
        if (skillNames.length) parts.push(tAp('kb.transferSkills', { n: skillNames.length }))
        setNotice(tAp('kb.transferImported', {
          parts: parts.length ? apJoin(parts) : tAp('kb.transferEmpty'),
          detail: entryNames[0] ? '（' + apJoin(entryNames.slice(0, 3)) + '）' : '',
        }))
        setSuccess(tAp('kb.transferSaved'))
        setAddPath('')
        return load(selectedRef.current)
      }
      const isTransferResult = (result) => result && !result.entry && (Array.isArray(result.entries) || Array.isArray(result.skills))
      const applyStageResult = (result) => {
        if (!result) return
        if (isTransferResult(result)) return applyTransferResult(result)
        const slug = result.entry && result.entry.slug
        const known = ((data && data.entries) || []).concat(result.entry || [])
        const staged = result.staged || (result.entry && result.entry.parseStatus === 'staged')
        if (staged) {
          mergeKbEntry(result.entry)
          setNotice(tAp('kb.stagedNotice', { name: (result.entry && kbTitle(result.entry)) || slug }))
          setSuccess('')
          setAddPath('')
          setAddName('')
          return result
        }
        const next = slug
          ? selectedRef.current.concat(slug).filter((item, index, all) => all.indexOf(item) === index)
          : selectedRef.current
        selectedRef.current = next
        setSelectedSlugs(next)
        publishKbTask(sessionId, next, known)
        setNotice(tAp(result.skipped ? 'kb.skipUnchanged' : (result.replaced ? 'kb.replacedTask' : 'kb.ingestedTask'), {
          name: (result.entry && kbTitle(result.entry)) || slug,
        }))
        setAddPath('')
        setAddName('')
        return persistSelection(next, known).then((slugs) => load(slugs || next))
      }
      const doStage = (pathOverride) => {
        const path = String(pathOverride || addPath || '').trim()
        if (!path) { setError(tAp('kb.needFile')); return Promise.resolve() }
        setPickedLabel(fileName(path))
        setSuccess('')
        return post({
          action: 'stage',
          path,
          sessionId,
          category: resolveCategory(),
          name: addName.trim() || undefined,
        }, 'add').then(applyStageResult)
      }
      const addManyPaths = (paths) => {
        const list = normalizePickedPaths(paths)
        if (!list.length) return Promise.resolve()
        const label = apJoin(list.map(fileName))
        setPickedLabel(label)
        kbPickPatch({ pickedLabel: label, error: '', notice: tAp('kb.thisPick', { name: label }) })
        list.forEach((path) => {
          if (/\.apkb$/i.test(path)) return
          mergeKbEntry({
            slug: 'local:' + fileName(path),
            name: fileName(path),
            category: resolveCategory(),
            parseStatus: 'staged',
            parseProgress: tAp('kb.landingProgress'),
            sizeBytes: 0,
          })
        })
        return list.reduce((chain, path) => chain.then(() => doStage(path)), Promise.resolve())
          .then(() => load(selectedRef.current))
      }
      const addBrowserFiles = (fileList) => {
        const files = Array.from(fileList || [])
        if (!files.length) return
        const unsupported = files.filter((file) => !KB_FILE_RE.test(file.name || ''))
        const supported = files.filter((file) => KB_FILE_RE.test(file.name || ''))
        if (!supported.length) {
          setError(tAp('kb.badTypes'))
          return
        }
        if (unsupported.length) {
          setNotice(tAp('kb.skippedTypes', { names: apJoin(unsupported.map((file) => file.name)) }))
        }
        const label = apJoin(supported.map((file) => file.name))
        setPickedLabel(label)
        kbPickPatch({ pickedLabel: label, error: '', notice: tAp('kb.thisPick', { name: label }) })
        supported.forEach((file) => {
          if (/\.apkb$/i.test(file.name || '')) return
          mergeKbEntry({
            slug: 'local:' + (file.name || 'file'),
            name: file.name || 'file',
            category: resolveCategory(),
            parseStatus: 'staged',
            parseProgress: tAp('kb.landingProgress'),
            sizeBytes: file.size || 0,
          })
        })
        supported.reduce((chain, file) => chain.then(async () => {
          const disk = diskPathOf(file)
          if (disk) return doStage(disk)
          if (KB_TEXT_RE.test(file.name || '')) {
            let text = ''
            try { text = await file.text() } catch { text = '' }
            if (text && text.trim()) {
              const viaText = await post({
                action: 'stage',
                fileName: file.name,
                text,
                sessionId,
                category: resolveCategory(),
                name: addName.trim() || undefined,
              }, 'add')
              if (viaText) return applyStageResult(viaText)
            }
          }
          const viaBytes = await uploadKbBytes(cwd, file, {
            sessionId,
            category: resolveCategory(),
            name: addName.trim() || undefined,
            stage: true,
          })
          return applyStageResult(viaBytes)
        }), Promise.resolve())
          .then(() => load(selectedRef.current))
          .catch((err) => {
            const message = String(err && err.message || err)
            setError(message)
            kbPickPatch({ error: message })
          })
      }
      React.useEffect(() => {
        kbPickState.addManyPaths = addManyPaths
        kbPickState.addBrowserFiles = addBrowserFiles
        if (kbPickState.pendingPaths && kbPickState.pendingPaths.length) {
          const leftover = kbPickState.pendingPaths.slice()
          kbPickState.pendingPaths = []
          addManyPaths(leftover)
        }
        if (kbPickState.pendingFiles && kbPickState.pendingFiles.length) {
          const leftover = kbPickState.pendingFiles.slice()
          kbPickState.pendingFiles = []
          addBrowserFiles(leftover)
        }
        return () => {
          if (kbPickState.addManyPaths === addManyPaths) kbPickState.addManyPaths = null
          if (kbPickState.addBrowserFiles === addBrowserFiles) kbPickState.addBrowserFiles = null
        }
      })
      const normalizeMineruToken = (raw) => String(raw || '')
        .trim()
        .replace(/^authorization:\s*/i, '')
        .replace(/^bearer\s+/i, '')
        .replace(/^["']+|["']+$/g, '')
        .trim()
      const applyMineruStatus = (status) => {
        if (!status || status.configured !== true) return false
        setData((current) => Object.assign({}, current || {}, { mineru: { configured: true, hint: kbProgressText(status.hint || tAp('kb.mineruSavedHint')) } }))
        setNotice(kbProgressText(status.hint || tAp('kb.mineruSavedHint')))
        return true
      }
      const saveMineru = () => {
        const token = normalizeMineruToken(tokenDraft)
        if (!token) { setError(tAp('kb.needToken')); return }
        setBusy('mineru')
        setError('')
        setNotice('')
        api('/api/agent-pi/kb/mineru', cwd, { method: 'POST', body: JSON.stringify({ token: token }) })
          .catch(() => api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ action: 'mineru-save', token: token }) }))
          .then((result) => {
            if (applyMineruStatus(result)) {
              setTokenDraft('')
              return
            }
            setError(tAp('kb.saveNoDisk'))
          })
          .catch((e) => {
            const msg = String(e && e.message || e)
            setError(/cwd is required|Bad Request|Not Found/i.test(msg)
              ? tAp('kb.oldHostSave')
              : msg)
          })
          .finally(() => setBusy(''))
      }
      const probeMineru = () => {
        const token = normalizeMineruToken(tokenDraft)
        if (!token && !(data && data.mineru && data.mineru.configured)) {
          setError(tAp('kb.needTokenOrSave'))
          return
        }
        setBusy('mineru-probe')
        setError('')
        setNotice('')
        api('/api/agent-pi/kb/mineru', cwd, { method: 'POST', body: JSON.stringify({ action: 'probe', token: token || undefined }) })
          .catch(() => api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ action: 'mineru-probe', token: token || undefined }) }))
          .then((result) => {
            if (!result || typeof result.ok !== 'boolean') {
              setError(tAp('kb.probeMissing'))
              return
            }
            if (result.ok) {
              setData((current) => Object.assign({}, current || {}, {
                mineru: Object.assign({}, (current && current.mineru) || {}, {
                  configured: result.configured,
                  hint: result.hint || ((current && current.mineru && current.mineru.hint) || ''),
                  probed: true,
                  probeOk: true,
                }),
              }))
              setNotice(result.message || tAp('kb.tokenOk'))
              return
            }
            setData((current) => Object.assign({}, current || {}, {
              mineru: Object.assign({}, (current && current.mineru) || {}, { probed: true, probeOk: false }),
            }))
            setError(result.message || tAp('kb.tokenBad'))
          })
          .catch((e) => {
            const msg = String(e && e.message || e)
            setError(/cwd is required|Bad Request|Not Found/i.test(msg)
              ? tAp('kb.probeMissing')
              : msg)
          })
          .finally(() => setBusy(''))
      }
      const clearMineru = () => {
        setBusy('mineru')
        setError('')
        setNotice('')
        api('/api/agent-pi/kb/mineru', cwd, { method: 'POST', body: JSON.stringify({ action: 'clear' }) })
          .catch(() => api('/api/agent-pi/kb', cwd, { method: 'POST', body: JSON.stringify({ action: 'mineru-clear' }) }))
          .then((result) => {
            if (result && result.configured === false) {
              setData((current) => Object.assign({}, current || {}, { mineru: { configured: false, hint: '' } }))
              setTokenDraft('')
              setNotice(tAp('kb.cleared'))
              return
            }
            setError(tAp('kb.clearFailed'))
          })
          .catch((e) => setError(String(e && e.message || e)))
          .finally(() => setBusy(''))
      }
      const openKbPreview = (entry) => {
        if (!entry || entry.parseStatus === 'parsing' || entry.parseStatus === 'staged') return
        if (entry.parseStatus === 'failed') {
          setError(entry.parseError || tAp('kb.parseRetry'))
          return
        }
        window.dispatchEvent(new CustomEvent('agent-pi-open-file', {
          detail: {
            cwd: cwd,
            path: 'kb://' + entry.slug + '.md',
            name: kbTitle(entry),
            kbSlug: entry.slug,
            kbHasSource: Boolean(entry.originalPath),
          },
        }))
      }
      const doRemove = (entry) => {
        if (String(entry.slug || '').indexOf('local:') === 0) {
          setData((current) => {
            const entries = ((current && current.entries) || []).filter((item) => item.slug !== entry.slug)
            return Object.assign({}, current || {}, { entries: entries, entryCount: entries.length })
          })
          return
        }
        setConfirmDialog({
          title: tAp('kb.delete'),
          body: tAp('kb.deleteEntryConfirm', { name: kbTitle(entry), seeded: entry.seeded ? tAp('kb.deleteSeeded') : '' }),
          onConfirm: () => {
            setConfirmDialog(null)
            post({ action: 'remove', slug: entry.slug }, 'rm:' + entry.slug).then((result) => {
              if (result) {
                const next = selectedSlugs.filter((item) => item !== entry.slug)
                setSelectedSlugs(next)
                persistSelection(next, (data && data.entries) || [])
                setNotice(tAp('kb.deleted', { slug: entry.slug }))
                load()
              }
            })
          },
        })
      }
      const doReindex = (slug) => {
        post({ action: 'reindex', slug: slug || undefined }, 'ri:' + (slug || 'all')).then((result) => {
          if (!result) return
          const missing = (result.missing || []).length ? tAp('kb.missingSrc', { list: result.missing.join(', ') }) : ''
          setNotice(tAp('kb.reindexed', { n: (result.reindexed || []).length, missing: missing }))
          load()
        })
      }
      const doCreateFolder = (category, moveSlug) => {
        setFolderDialog({
          category: category,
          name: '',
          moveSlug: moveSlug || '',
          prompt: moveSlug ? tAp('kb.newFolderPrompt') : tAp('kb.folderPrompt'),
        })
      }
      const submitFolder = () => {
        if (!folderDialog) return
        const name = String(folderDialog.name || '').trim()
        if (!name) return
        const category = folderDialog.category
        const moveSlug = folderDialog.moveSlug
        setFolderDialog(null)
        post({ action: 'folder-create', category, name }, 'folder').then((result) => {
          if (!result) return
          const id = result.folder && result.folder.id
          const createdName = (result.folder && result.folder.name) || name
          const next = moveSlug && id
            ? post({ action: 'folder-move', slug: moveSlug, folderId: id }, 'folder')
            : Promise.resolve(result)
          return next.then((moved) => {
            if (moved) {
              setNotice(tAp('kb.folderCreated', { name: createdName }))
              load()
            }
          })
        })
      }
      const doRemoveFolder = (folder) => {
        setConfirmDialog({
          title: tAp('kb.deleteFolder'),
          body: tAp('kb.deleteFolderConfirm', { name: folder.name, category: kbCategoryLabel(folder.category) }),
          onConfirm: () => {
            setConfirmDialog(null)
            post({ action: 'folder-remove', folderId: folder.id }, 'folder').then((result) => {
              if (!result) return
              setNotice(tAp('kb.folderDeleted', { name: folder.name }))
              load()
            })
          },
        })
      }
      const doMoveFolder = (entry, folderId) => {
        if (!entry || String(entry.slug || '').indexOf('local:') === 0) return
        post({ action: 'folder-move', slug: entry.slug, folderId: folderId || '' }, 'folder').then((result) => {
          if (result) load()
        })
      }
      const doExport = (query) => {
        const qs = new URLSearchParams()
        if (query && query.slugs && query.slugs.length) qs.set('slugs', query.slugs.join(','))
        if (query && query.folderId) qs.set('folderId', query.folderId)
        if (query && query.skillSlugs && query.skillSlugs.length) qs.set('skillSlugs', query.skillSlugs.join(','))
        setBusy('export')
        setError('')
        setNotice('')
        return apiBlob('/api/agent-pi/kb/transfer?' + qs.toString(), cwd, { method: 'GET' })
          .then((result) => {
            downloadBlob(result.blob, result.filename || 'knowledge.apkb')
            setNotice(tAp('kb.exported', { name: result.filename || '' }))
          })
          .catch((e) => setError(String(e && e.message || e)))
          .finally(() => setBusy(''))
      }
      const doImportTransfer = () => {
        const desktop = desktopApi()
        if (desktop && typeof desktop.pickFiles === 'function') {
          Promise.resolve(desktop.pickFiles()).then((raw) => {
            const list = normalizePickedPaths(raw)
            const pack = list.find((path) => /\.apkb$/i.test(path)) || list[0]
            if (!pack) return
            return doStage(pack)
          }).catch((e) => setError(String(e && e.message || e)))
          return
        }
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.apkb,application/octet-stream'
        input.onchange = () => {
          const file = input.files && input.files[0]
          if (!file) return
          setBusy('add')
          setError('')
          uploadKbBytes(cwd, file, { sessionId: sessionId })
            .then(applyStageResult)
            .catch((e) => setError(String(e && e.message || e)))
            .finally(() => setBusy(''))
        }
        input.click()
      }
      const onHomeChange = (entry, value) => {
        if (value === '__new__') {
          doCreateFolder(entry.category, entry.slug)
          return
        }
        doMoveFolder(entry, value)
      }
      const toggleTaskSlug = (slug, selected) => {
        const next = selected
          ? selectedSlugs.concat(slug).filter((item, index, all) => all.indexOf(item) === index)
          : selectedSlugs.filter((item) => item !== slug)
        setSelectedSlugs(next)
        persistSelection(next, (data && data.entries) || [])
      }
      const doParse = (slugs, options) => {
        const list = Array.isArray(slugs) ? slugs.filter(Boolean) : []
        setSuccess('')
        return post({
          action: 'parse',
          slugs: list.length ? list : undefined,
          slug: list.length === 1 ? list[0] : undefined,
          sessionId,
          force: options && options.force === true,
          preferMineru: options && options.force === true,
        }, 'parse').then((result) => {
          if (!result) return
          const started = result.started || []
          if (started.length) {
            setNotice(tAp('kb.parseStarted', { n: started.length }))
          } else {
            setNotice(tAp('kb.parseNone'))
          }
          return load(selectedRef.current)
        })
      }
      const doSearch = () => {
        const value = query.trim()
        if (!value) { setHits(null); return }
        post({ action: 'search', query: value, limit: 8 }, 'search').then((result) => {
          if (result) setHits(result.hits || [])
        })
      }

      const entries = mergeKbEntries((data && data.entries) || [], kbPickState.entries)
      const shownLabel = kbPickState.pickedLabel || pickedLabel
      const pending = entries.filter((entry) => entry.parseStatus === 'staged' || entry.parseStatus === 'parsing' || entry.parseStatus === 'failed')
      const parseable = pending.filter((entry) => String(entry.slug).indexOf('local:') !== 0 && (entry.parseStatus === 'staged' || entry.parseStatus === 'failed'))
      const folders = (data && Array.isArray(data.folders)) ? data.folders : []
      const groups = {}
      entries.forEach((entry) => { (groups[entry.category] = groups[entry.category] || []).push(entry) })
      folders.forEach((folder) => {
        if (folder && folder.category && !groups[folder.category]) groups[folder.category] = []
      })
      const categoryOptions = PRESET_CATEGORIES.concat(Object.keys(groups).filter((name) => name && PRESET_CATEGORIES.indexOf(name) < 0).sort())
      const selectStyle = Object.assign({}, inputStyle, { flex: '0 1 160px', appearance: 'auto' })
      const chatImport = kbChatImportCopy()

      return h(React.Fragment, null,
        h('div', { className: 'ap-ov', style: { display: 'block', overflow: 'auto' } },
        h('div', { className: 'ap-ov-main', style: { maxWidth: 1080, margin: '0 auto' } },
          h('header', { className: 'ap-ov-hd' },
            h('div', { style: { minWidth: 0 } },
              h('h1', null, tAp('kb.title')),
              h('div', { className: 'ap-path' }, Icon('folder', 14), h('span', { title: data && data.root || '' }, (data && data.root) || '…')),
            ),
            h('div', { className: 'ap-actions' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => load() }, Icon('refresh', 14), tAp('kb.refresh')),
              h('button', { type: 'button', className: 'ap-btn', disabled: !!busy, title: tAp('kb.reindexTitle'), onClick: () => doReindex() }, Icon('refresh', 14), busy === 'ri:all' ? tAp('kb.reindexing') : tAp('kb.reindexAll')),
            ),
          ),
          (error || kbPickState.error) ? h('div', { className: 'ap-err' }, error || kbPickState.error) : null,
          success ? h('div', { className: 'ap-kb-ok' }, success) : null,
          notice ? h('div', { className: 'ap-sub', style: { padding: '6px 0' } }, notice) : null,
          h('section', {
            className: 'ap-sec' + (dragOver ? ' ap-kb-drop' : ''),
            onDragEnter: (e) => { e.preventDefault(); setDragOver(true) },
            onDragOver: (e) => { e.preventDefault(); setDragOver(true) },
            onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) },
            onDrop: (e) => {
              e.preventDefault()
              setDragOver(false)
              addBrowserFiles(e.dataTransfer && e.dataTransfer.files)
            },
          },
            h('div', { className: 'ap-row', style: { gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              h('h2', { style: { margin: 0 } }, tAp('kb.import')),
              (data && data.mineru && data.mineru.probeOk)
                ? h('span', { className: 'ap-chip ok' }, tAp('kb.tokenOk'))
                : (data && data.mineru && data.mineru.probed)
                  ? h('span', { className: 'ap-chip warn' }, tAp('kb.tokenBad'))
                  : null,
              (data && data.mineru && data.mineru.configured)
                ? h('span', { className: 'ap-chip ok' }, kbProgressText(data.mineru.hint) || tAp('kb.mineruSaved'))
                : h('span', { className: 'ap-chip warn' }, data && data.mineru ? tAp('kb.mineruMissing') : tAp('kb.mineruNeedRestart')),
            ),
            h('div', { className: 'ap-kb-paths' },
              h('div', { className: 'ap-kb-path' },
                h('strong', null, tAp('kb.path1Title')),
                h('p', null, tAp('kb.path1Body')),
              ),
              h('div', { className: 'ap-kb-path' },
                h('strong', null, chatImport.title),
                h('p', null, chatImport.warn),
                h('p', { className: 'ap-kb-say' }, chatImport.say),
                h('p', null, chatImport.after),
              ),
              h('div', { className: 'ap-kb-path' },
                h('strong', null, tAp('kb.tplTitle')),
                h('p', null, tAp('kb.tplBody')),
              ),
              h('div', { className: 'ap-kb-path' },
                h('strong', null, tAp('kb.packTitle')),
                h('p', null, tAp('kb.packBody')),
              ),
            ),
            h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' } },
              h('div', {
                ref: pickWrapRef,
                className: 'ap-btn primary ap-kb-pick',
                style: busy === 'add' ? { pointerEvents: 'none', opacity: 0.65 } : null,
                title: tAp('kb.pickTitle'),
              }, Icon('filePlus', 14), busy === 'add' ? tAp('kb.picking') : tAp('kb.pickFiles')),
              h('button', {
                type: 'button',
                className: 'ap-btn',
                disabled: !!busy,
                title: tAp('kb.importPackTitle'),
                onClick: doImportTransfer,
              }, Icon('download', 14), busy === 'add' ? tAp('kb.importing') : tAp('kb.importPack')),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                disabled: !!busy || !parseable.length,
                title: tAp('kb.parseTitle'),
                onClick: () => doParse(parseable.map((entry) => entry.slug)),
              }, Icon('play', 14), busy === 'parse' ? tAp('kb.parsing') : tAp('kb.parseIn')),
              h('select', {
                style: selectStyle,
                value: addCategory,
                title: tAp('kb.category'),
                'aria-label': tAp('kb.category'),
                onChange: (e) => setAddCategory(e.target.value),
              },
                categoryOptions.map((name) => h('option', { key: name, value: name }, kbCategoryLabel(name))),
                h('option', { value: '__custom__' }, tAp('kb.customCategory')),
              ),
              addCategory === '__custom__'
                ? h('input', {
                  style: inputStyle,
                  placeholder: tAp('kb.customCategoryPh'),
                  value: customCategory,
                  onChange: (e) => setCustomCategory(e.target.value),
                })
                : null,
              h('input', {
                style: inputStyle,
                placeholder: tAp('kb.customNamePh'),
                value: addName,
                onChange: (e) => setAddName(e.target.value),
              }),
            ),
            shownLabel
              ? h('p', { className: 'ap-sub', style: { marginTop: 8 } }, tAp('kb.thisPick', { name: shownLabel }))
              : h('p', { className: 'ap-sub', style: { marginTop: 8 } }, tAp('kb.multiHint')),
            pending.length
              ? h('div', { className: 'ap-kb-files' }, pending.map((entry) => {
                const parsing = entry.parseStatus === 'parsing'
                const failed = entry.parseStatus === 'failed'
                const percent = parsing
                  ? Math.max(6, Math.min(99, Number(entry.parsePercent) || 12))
                  : (failed ? 100 : 0)
                return h('div', { key: entry.slug, className: 'ap-kb-file' },
                  h('div', { className: 'ap-kb-file-ico' + (failed ? ' warn' : '') }, Icon(fileIconName({ name: kbTitle(entry), type: 'file' }), 18, fileIconClass({ name: kbTitle(entry), type: 'file' }))),
                  h('div', { className: 'ap-kb-file-main' },
                    h('strong', { title: kbTitle(entry) }, kbTitle(entry)),
                    h('div', { className: 'ap-sub' },
                      formatKbBytes(entry.sizeBytes),
                      ' · ',
                      parsing ? (kbProgressText(entry.parseProgress) || tAp('kb.parsing'))
                        : failed ? (entry.parseError || tAp('kb.parseFailed'))
                          : (kbProgressText(entry.parseProgress) || tAp('kb.stagedWait')),
                    ),
                    parsing || failed
                      ? h('div', { className: 'ap-bar' + (failed ? ' fail' : ''), title: String(percent) + '%' },
                        h('i', { style: { width: percent + '%' } }))
                      : null,
                    parsing ? h('div', { className: 'ap-sub' }, tAp('kb.progress', { n: percent })) : null,
                  ),
                  h('span', { className: 'ap-row', style: { gap: 6, flexShrink: 0 } },
                    parsing ? h('span', { className: 'ap-chip live' }, tAp('kb.parsingChip'))
                      : failed ? h('span', { className: 'ap-chip warn' }, tAp('kb.failedChip'))
                        : h('span', { className: 'ap-chip' }, tAp('kb.pendingChip')),
                    failed
                      ? h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => doParse([entry.slug]) }, tAp('kb.retry'))
                      : null,
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy || parsing, onClick: () => doRemove(entry) }, tAp('kb.remove')),
                  ),
                )
              }))
              : kbLandingCardVisible(shownLabel, entries)
                ? h('div', { className: 'ap-kb-files' },
                  h('div', { className: 'ap-kb-file' },
                    h('div', { className: 'ap-kb-file-ico' }, Icon('filePlus', 18)),
                    h('div', { className: 'ap-kb-file-main' },
                      h('strong', null, shownLabel),
                      h('div', { className: 'ap-sub' }, tAp('kb.landing')),
                    ),
                  ),
                )
                : null,
            h('details', { style: { marginTop: 10 }, open: !(data && data.mineru && data.mineru.configured) },
              h('summary', { className: 'ap-sub', style: { cursor: 'pointer' } }, tAp('kb.mineruSummary')),
              h('p', { className: 'ap-sub', style: { marginTop: 8 } },
                (data && data.mineru && data.mineru.configured)
                  ? tAp('kb.mineruCurrent', { hint: kbProgressText(data.mineru.hint) || tAp('kb.mineruSavedHint') })
                  : (data && Object.prototype.hasOwnProperty.call(data, 'mineru')
                    ? tAp('kb.mineruUnconfigured')
                    : tAp('kb.mineruOldHost'))),
              h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap', marginTop: 8 } },
                h('input', {
                  type: 'password',
                  autoComplete: 'off',
                  style: Object.assign({}, inputStyle, { flex: '2 1 240px' }),
                  placeholder: tAp('kb.mineruTokenPh'),
                  value: tokenDraft,
                  onChange: (e) => setTokenDraft(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); saveMineru() } },
                }),
                h('button', { type: 'button', className: 'ap-btn primary', disabled: !!busy || !tokenDraft.trim(), onClick: saveMineru }, busy === 'mineru' ? tAp('kb.saving') : tAp('kb.saveToken')),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !!busy || (!tokenDraft.trim() && !(data && data.mineru && data.mineru.configured)),
                  title: tAp('kb.probeTitle'),
                  onClick: probeMineru,
                }, busy === 'mineru-probe' ? tAp('kb.probing') : tAp('kb.probe')),
                (data && data.mineru && data.mineru.configured)
                  ? h('button', { type: 'button', className: 'ap-btn ghost', disabled: !!busy, onClick: clearMineru }, tAp('kb.clear'))
                  : null,
              ),
              h('p', { className: 'ap-sub', style: { marginTop: 8 } }, tAp('kb.mineruOcr')),
            ),
            h('details', { style: { marginTop: 8 }, open: true },
              h('summary', { className: 'ap-sub', style: { cursor: 'pointer' } }, tAp('kb.pastePath')),
              h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap', marginTop: 8 } },
                h('input', { style: Object.assign({}, inputStyle, { flex: '2 1 320px' }), placeholder: tAp('kb.pastePathPh'), value: addPath, onChange: (e) => setAddPath(e.target.value) }),
                h('button', { type: 'button', className: 'ap-btn', disabled: busy === 'add' || !addPath.trim(), onClick: () => doStage() }, busy === 'add' ? tAp('kb.staging') : tAp('kb.stage')),
              ),
            ),
          ),
          h('details', { className: 'ap-sec', style: { display: 'block' } },
            h('summary', { style: { cursor: 'pointer' } }, h('h2', { style: { display: 'inline' } }, tAp('kb.searchPreview'))),
            h('div', { className: 'ap-row', style: { gap: 8, marginTop: 8 } },
              h('input', {
                style: Object.assign({}, inputStyle, { flex: '1 1 auto' }),
                placeholder: tAp('kb.searchPh'),
                value: query,
                onChange: (e) => setQuery(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') doSearch() },
              }),
              h('button', { type: 'button', className: 'ap-btn', disabled: busy === 'search', onClick: doSearch }, Icon('search', 14), tAp('kb.search')),
            ),
            hits === null
              ? null
              : hits.length === 0
                ? h('p', { className: 'ap-sub', style: { marginTop: 8 } }, tAp('kb.noHits'))
                : hits.map((hit) => h('div', { key: hit.slug + hit.chunkId, className: 'ap-task', style: { alignItems: 'flex-start', flexDirection: 'column', gap: 4 } },
                  h('div', { className: 'ap-row', style: { gap: 8 } },
                    h('strong', null, hit.title),
                    h('span', { className: 'ap-chip' }, hit.slug + ':' + hit.chunkId),
                    h('span', { className: 'ap-chip' }, tAp('kb.score', { n: hit.score })),
                  ),
                  h('span', { className: 'ap-sub' }, hit.snippet),
                )),
          ),
          h('section', { className: 'ap-sec' },
            h('h2', null, tAp('kb.entries', { n: (data && data.entryCount) || 0 })),
            h('p', { className: 'ap-sub' }, tAp('kb.entriesLead', { say: chatImport.say, n: selectedSlugs.length })),
            entries.length === 0 && folders.length === 0
              ? h('p', { className: 'ap-sub', style: { padding: '14px 0' } }, tAp('kb.empty'))
              : sortKbCategories(Object.keys(groups)).map((category) => {
                const tree = groupKbEntries(groups[category], folders, category)
                const renderEntry = (entry) => h('div', { key: entry.slug, className: 'ap-task', style: { gap: 10 } },
                  h('div', {
                    className: 'ap-row',
                    style: { gap: 8, minWidth: 0, flex: 1, alignItems: 'center' },
                    title: kbTitle(entry),
                  },
                    h('input', {
                      type: 'checkbox',
                      checked: selectedSlugs.indexOf(entry.slug) >= 0,
                      title: tAp('kb.taskSelect'),
                      onChange: (e) => toggleTaskSlug(entry.slug, e.target.checked),
                    }),
                    Icon(fileIconName({ name: kbTitle(entry), type: 'file' }), 14, fileIconClass({ name: kbTitle(entry), type: 'file' })),
                    h('button', {
                      type: 'button',
                      className: 'ap-btn link',
                      style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', padding: 0 },
                      disabled: entry.parseStatus === 'parsing' || entry.parseStatus === 'staged',
                      title: entry.parseStatus === 'ready' ? tAp('kb.openPreview') : (entry.parseError || kbProgressText(entry.parseProgress) || ''),
                      onClick: (e) => { e.preventDefault(); e.stopPropagation(); openKbPreview(entry) },
                    }, kbTitle(entry)),
                  ),
                  h('span', { className: 'ap-row', style: { gap: 6, flexShrink: 0, flexWrap: 'wrap' } },
                    entry.parseStatus === 'parsing' ? h('span', { className: 'ap-chip live' }, kbProgressText(entry.parseProgress) || tAp('kb.parsing'))
                      : entry.parseStatus === 'failed' ? h('span', { className: 'ap-chip warn', title: entry.parseError || '' }, tAp('kb.parseFailed'))
                      : entry.parseStatus === 'staged' ? h('span', { className: 'ap-chip' }, tAp('kb.pendingChip'))
                      : h('span', { className: 'ap-chip ok' }, tAp('kb.ready')),
                    entry.parseStatus === 'ready' && kbFidelityLabel(entry)
                      ? h('span', { className: 'ap-chip', title: tAp('kb.fidelityTitle') }, kbFidelityLabel(entry))
                      : null,
                    entry.parseStatus === 'ready'
                      ? h('span', { className: 'ap-chip', title: kbIngestLabel(entry) }, kbIngestLabel(entry))
                      : null,
                    selectedSlugs.indexOf(entry.slug) >= 0 ? h('span', { className: 'ap-chip' }, tAp('kb.inTask')) : null,
                    entry.seeded ? h('span', { className: 'ap-chip' }, tAp('kb.seeded')) : null,
                    String(entry.slug || '').indexOf('local:') === 0
                      ? null
                      : h('span', { className: 'ap-row', style: { gap: 4 } },
                        h('span', { className: 'ap-sub' }, tAp('kb.home')),
                        h('select', {
                          className: 'ap-kb-home',
                          title: tAp('kb.homeTitle'),
                          value: entry.folderId || '',
                          disabled: !!busy,
                          onChange: (e) => onHomeChange(entry, e.target.value),
                        },
                        h('option', { value: '' }, tAp('kb.unfiled')),
                          folders.filter((folder) => folder.category === entry.category).map((folder) => h('option', { key: folder.id, value: folder.id }, folder.name)),
                          h('option', { value: '__new__' }, tAp('kb.newFolder')),
                        ),
                      ),
                    entry.parseStatus === 'ready' && kbIngestKind(entry) === 'local'
                      ? h('button', {
                        type: 'button',
                        className: 'ap-btn link',
                        disabled: !!busy,
                        title: tAp('kb.reparseTitle'),
                        onClick: () => doParse([entry.slug], { force: true }),
                      }, tAp('kb.reparseMineru'))
                      : null,
                    entry.parseStatus === 'ready'
                      ? h('button', {
                        type: 'button',
                        className: 'ap-btn link',
                        disabled: !!busy,
                        title: tAp('kb.exportTitle'),
                        onClick: () => doExport({ slugs: [entry.slug] }),
                      }, tAp('kb.export'))
                      : null,
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy || entry.parseStatus === 'parsing', onClick: () => doRemove(entry) }, tAp('kb.delete')),
                  ),
                )
                return h('div', { key: category, style: { marginTop: 10 } },
                  h('div', { className: 'ap-row', style: { gap: 8, flexWrap: 'wrap' } },
                    h('strong', null, kbCategoryLabel(category)),
                    h('span', { className: 'ap-sub' }, tAp('kb.count', { n: groups[category].length })),
                    kbCategoryHint(category) ? h('span', { className: 'ap-sub' }, kbCategoryHint(category)) : null,
                    h('button', {
                      type: 'button',
                      className: 'ap-btn link',
                      disabled: !!busy,
                      title: tAp('kb.addFolderTitle'),
                      onClick: () => doCreateFolder(category),
                    }, tAp('kb.addFolder')),
                  ),
                  tree.folders.map(({ folder, entries: nested }) => h('div', { key: folder.id, className: 'ap-kb-folder' },
                    h('div', { className: 'ap-kb-folder-hd' },
                      Icon('folder', 14),
                      h('strong', null, folder.name),
                      h('span', { className: 'ap-sub' }, tAp('kb.count', { n: nested.length })),
                      nested.some((entry) => entry.parseStatus === 'ready')
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn link',
                          disabled: !!busy,
                          title: tAp('kb.exportFolderTitle'),
                          onClick: () => doExport({ folderId: folder.id }),
                        }, tAp('kb.exportFolder'))
                        : null,
                      h('button', {
                        type: 'button',
                        className: 'ap-btn link',
                        disabled: !!busy,
                        title: tAp('kb.deleteFolderTitle'),
                        onClick: () => doRemoveFolder(folder),
                      }, tAp('kb.deleteFolder')),
                    ),
                    nested.length ? nested.map(renderEntry) : h('p', { className: 'ap-sub', style: { margin: '4px 0 8px' } }, tAp('kb.emptyFolder')),
                  )),
                  tree.loose.length && tree.folders.length
                    ? h('div', { className: 'ap-sub', style: { margin: '8px 0 2px' } }, tAp('kb.unfiled'))
                    : null,
                  tree.loose.map(renderEntry),
                )
              }),
          ),
          h('section', { className: 'ap-sec' },
            h('h2', null, tAp('kb.skills', { n: (data && data.skills && data.skills.length) || 0 })),
            h('p', { className: 'ap-sub' }, tAp('kb.skillsLead')),
            !(data && data.skills && data.skills.length)
              ? h('p', { className: 'ap-sub', style: { padding: '8px 0' } }, tAp('kb.skillsEmpty'))
              : h('div', { className: 'ap-kb-skills', 'data-ap-kb-skills': '1' }, data.skills.map((skill) => h('div', { key: skill.slug, className: 'ap-kb-skill' },
                h('div', { className: 'ap-kb-skill-ico' }, Icon('fileText', 16)),
                h('div', { className: 'ap-kb-skill-main' },
                  h('div', { className: 'ap-kb-skill-hd' },
                    h('strong', { title: skill.name || skill.slug }, skill.name || skill.slug),
                    h('button', {
                      type: 'button',
                      className: 'ap-btn link',
                      disabled: !!busy,
                      title: tAp('kb.exportSkillTitle'),
                      onClick: () => doExport({ skillSlugs: [skill.slug] }),
                    }, tAp('kb.export')),
                  ),
                  skill.description
                    ? h('p', { className: 'ap-kb-skill-desc', title: skill.description }, skill.description)
                    : null,
                  h('span', { className: 'ap-chip' }, skill.slug),
                ),
              ))),
          ),
        ),
        ),
        folderDialog ? h('div', {
          className: 'ap-overlay',
          'data-ap-kb-folder-dialog': '1',
          onClick: (e) => { if (e.target === e.currentTarget) setFolderDialog(null) },
        },
          h('div', { className: 'ap-modal' },
            h('h1', null, tAp('kb.addFolder')),
            h('p', { className: 'hint' }, folderDialog.prompt || tAp('kb.folderPrompt')),
            h('input', {
              ref: folderInputRef,
              value: folderDialog.name,
              placeholder: 'COTO 2020',
              onChange: (e) => setFolderDialog(Object.assign({}, folderDialog, { name: e.target.value })),
              onKeyDown: (e) => { if (e.key === 'Enter') submitFolder() },
            }),
            h('div', { className: 'ap-foot' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => setFolderDialog(null) }, tAp('kb.folderCancel')),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                disabled: !String(folderDialog.name || '').trim(),
                onClick: submitFolder,
              }, tAp('kb.folderOk')),
            ),
          ),
        ) : null,
        confirmDialog ? h('div', {
          className: 'ap-overlay',
          'data-ap-kb-confirm-dialog': '1',
          onClick: (e) => { if (e.target === e.currentTarget) setConfirmDialog(null) },
        },
          h('div', { className: 'ap-modal' },
            h('h1', null, confirmDialog.title),
            h('p', { className: 'hint' }, confirmDialog.body),
            h('div', { className: 'ap-foot' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => setConfirmDialog(null) }, tAp('kb.folderCancel')),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                onClick: () => { if (confirmDialog.onConfirm) confirmDialog.onConfirm() },
              }, tAp('kb.confirmOk')),
            ),
          ),
        ) : null,
      )
    }
  return { KnowledgeBasePanel, formatKbTaskBlock, kbTaskOf }
}
