(function () {
  const boot = document.getElementById('app')
  const params = new URLSearchParams(location.search)
  const cwd = params.get('cwd') || ''
  const path = params.get('path') || ''

  function fail(message) {
    if (!boot) return
    boot.innerHTML = '<div class="ap-univer-boot error"></div>'
    boot.firstChild.textContent = message
    window.parent.postMessage({ type: 'ap-univer', event: 'error', message: message }, '*')
  }

  function api(url, init) {
    const next = url + (url.includes('?') ? '&' : '?') + 'cwd=' + encodeURIComponent(cwd)
    return fetch(next, init).then((res) => {
      if (!res.ok) return res.text().then((text) => { throw new Error(text || res.statusText) })
      return res.json()
    })
  }

  function notify(event, extra) {
    window.parent.postMessage(Object.assign({ type: 'ap-univer', event: event }, extra || {}), '*')
  }

  if (!cwd || !path) {
    fail('缺少文件路径')
    return
  }
  if (!window.UniverPresets || !window.UniverCore || !window.UniverPresetSheetsCore) {
    fail('Univer 资源未装入。请确认 univer-assets 已随产品包分发。')
    return
  }

  let univerAPI = null
  let dirty = false
  let acceptEdits = false

  function markDirty() {
    if (!acceptEdits || dirty) return
    dirty = true
    notify('dirty', { dirty: true })
  }

  function snapshot() {
    const book = univerAPI && univerAPI.getActiveWorkbook && univerAPI.getActiveWorkbook()
    if (!book) throw new Error('表格还没打开')
    if (typeof book.save === 'function') return book.save()
    if (typeof book.getSnapshot === 'function') return book.getSnapshot()
    throw new Error('当前 Univer 版本没有快照接口')
  }

  function save() {
    return Promise.resolve()
      .then(snapshot)
      .then((workbook) => api('/api/agent-pi/files/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: path, univer: workbook }),
      }))
      .then((body) => {
        dirty = false
        notify('saved', { hint: (body && body.hint) || '已保存回原文件' })
        return body
      })
  }

  window.addEventListener('message', (event) => {
    const data = event && event.data
    if (!data || data.type !== 'ap-univer') return
    if (data.action === 'save') {
      save().catch((err) => notify('error', { message: String(err.message || err) }))
    }
  })

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
      event.preventDefault()
      save().catch((err) => fail(String(err.message || err)))
    }
  })

  api('/api/agent-pi/files/univer?path=' + encodeURIComponent(path))
    .then((body) => {
      const { createUniver } = window.UniverPresets
      const { LocaleType, mergeLocales } = window.UniverCore
      const { UniverSheetsCorePreset } = window.UniverPresetSheetsCore
      const zh = window.UniverPresetSheetsCoreZhCN
      const en = window.UniverPresetSheetsCoreEnUS
      const locale = (zh && (LocaleType.ZH_CN || LocaleType.ZH_Hans)) || LocaleType.EN_US
      const localePack = zh || en || {}
      document.documentElement.style.cssText = 'height:100%;overflow:hidden'
      document.body.style.cssText = 'height:100%;margin:0;overflow:hidden'
      if (boot) boot.style.cssText = 'height:100%;width:100%;min-height:0;overflow:hidden'
      const created = createUniver({
        locale: locale,
        locales: { [locale]: mergeLocales(localePack) },
        presets: [UniverSheetsCorePreset({
          container: 'app',
          header: true,
          toolbar: true,
          formulaBar: true,
          contextMenu: true,
          ribbonType: 'classic',
          footer: {
            sheetBar: true,
            statisticBar: true,
            menus: true,
            zoomSlider: true,
          },
        })],
      })
      univerAPI = created.univerAPI
      const snapshot = Object.assign({}, body.workbook || {}, { name: path, locale: locale })
      if (!snapshot.sheetOrder && snapshot.sheets) snapshot.sheetOrder = Object.keys(snapshot.sheets)
      univerAPI.createWorkbook(snapshot)
      window.setTimeout(() => {
        acceptEdits = true
        if (univerAPI.addEvent && univerAPI.Event) {
          const Event = univerAPI.Event
          ;['SheetValueChanged', 'CommandExecuted'].forEach((name) => {
            if (Event[name]) {
              try { univerAPI.addEvent(Event[name], markDirty) } catch (_err) { /* older facade */ }
            }
          })
        }
        boot.addEventListener('input', markDirty, true)
        const book = univerAPI.getActiveWorkbook && univerAPI.getActiveWorkbook()
        let sheets = []
        try {
          const live = book && book.getSheets && book.getSheets()
          if (live && live.length) {
            sheets = live.map((sheet) => {
              if (sheet && typeof sheet.getSheetName === 'function') return sheet.getSheetName()
              if (sheet && typeof sheet.getName === 'function') return sheet.getName()
              return (sheet && sheet.name) || ''
            }).filter(Boolean)
          }
        } catch (_err) { /* facade variance */ }
        if (!sheets.length && snapshot.sheetOrder) {
          sheets = snapshot.sheetOrder.map((id) => (snapshot.sheets && snapshot.sheets[id] && snapshot.sheets[id].name) || id)
        }
        notify('ready', { sheets: sheets })
      }, 400)
    })
    .catch((err) => fail(String(err.message || err)))
})()
