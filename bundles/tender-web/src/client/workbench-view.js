export function createWorkbenchView(dependencies) {
  const h = dependencies.h
  const Icon = dependencies.Icon
  const tAp = dependencies.tAp
  const moduleIconNode = dependencies.moduleIconNode
  const moduleLabel = dependencies.moduleLabel
  const FilePickPanel = dependencies.FilePickPanel

  return function WorkbenchView(props) {
    const specialModule = props.module === 'kb' || props.module === 'modules' || props.module === 'archive'
    let body = props.specialContent
    if (!specialModule) {
      body = props.projects.length === 0 && !props.error
        ? h('div', { className: 'ap-landing' },
          h('div', { className: 'ap-landing-inner' },
            moduleIconNode(props.current, 32),
            h('h1', null, props.current ? moduleLabel(props.current) : tAp('workbench.title')),
            h('p', null, tAp('wb.landing')),
            h('div', { className: 'ap-landing-actions' },
              h('button', {
                type: 'button',
                className: 'ap-btn',
                disabled: !props.cwd,
                onClick: props.onAdopt,
              }, Icon('layout', 16), tAp('wb.upgrade')),
              h('button', { type: 'button', className: 'ap-btn primary', onClick: props.onCreate },
                Icon('plus', 16), tAp('wb.create')),
            ),
          ),
        )
        : h('div', { className: 'ap-ov' },
          h('aside', { className: 'ap-col' },
            h('div', { className: 'ap-col-hd' }, tAp('wb.projects')),
            props.projects.map((item) => h('button', {
              key: item.project.projectId,
              type: 'button',
              className: 'ap-proj' + (item.project.projectId === props.selectedId ? ' on' : ''),
              onClick: () => props.onSelectProject(item.project.projectId),
            },
              h('strong', null, item.project.name),
              h('em', null, item.project.projectId),
            )),
          ),
          props.overview || h('div', { className: 'ap-landing' }, h('p', { className: 'ap-sub' }, tAp('wb.pickProject'))),
        )
    }

    return h('div', { className: 'ap-wb' },
      h('header', { className: 'ap-hdr' },
        h('h1', null, tAp('workbench.title')),
        h('div', { className: 'ap-path', title: props.cwd },
          Icon('folder', 14),
          h('span', null, props.cwd || tAp('wb.noCwd')),
        ),
        props.onClose
          ? h('div', { className: 'ap-actions', style: { marginTop: 10 } },
            h('button', { type: 'button', className: 'ap-btn', onClick: props.onClose }, tAp('wb.back')),
          )
          : null,
      ),
      h('div', { className: 'ap-toolbar' },
        h('div', { className: 'ap-mods' },
          props.catalog.map((item) => h('button', {
            key: item.id,
            type: 'button',
            className: 'ap-mod' + (props.module === item.id ? ' on' : ''),
            onClick: () => props.onSelectModule(item.id),
          }, moduleIconNode(item, 15), moduleLabel(item))),
          h('button', {
            type: 'button',
            className: 'ap-mod' + (props.module === 'kb' ? ' on' : ''),
            title: tAp('wb.kbTitle'),
            onClick: () => props.onSelectModule('kb'),
          }, Icon('book', 15), tAp('wb.kb')),
          h('button', {
            type: 'button',
            className: 'ap-mod' + (props.module === 'modules' ? ' on' : ''),
            title: tAp('wb.modulesTitle'),
            onClick: () => props.onSelectModule('modules'),
          }, Icon('settings', 15), tAp('wb.modules')),
          h('button', {
            type: 'button',
            className: 'ap-mod' + (props.module === 'archive' ? ' on' : ''),
            title: tAp('archive.lead'),
            onClick: () => props.onSelectModule('archive'),
          }, Icon('archive', 15), tAp('archive.title')),
        ),
        specialModule ? null : h('div', { className: 'ap-actions' },
          h('button', { type: 'button', className: 'ap-btn', onClick: props.onRefresh },
            Icon('refresh', 14, props.refreshing ? 'ap-spin' : ''), tAp('wb.refresh')),
          h('button', {
            type: 'button',
            className: 'ap-btn',
            disabled: !props.cwd,
            title: tAp('wb.adoptTitle'),
            onClick: props.onAdopt,
          }, Icon('layout', 14), tAp('wb.adopt')),
          h('button', { type: 'button', className: 'ap-btn primary', onClick: props.onCreate },
            Icon('plus', 14), tAp('wb.create')),
        ),
      ),
      props.moduleErrorCount
        ? h('div', { className: 'ap-err', style: { padding: '8px 24px 0' } },
          tAp('wb.moduleErrors', { n: props.moduleErrorCount }))
        : null,
      props.error ? h('div', { className: 'ap-err', style: { padding: '8px 24px 0' } }, props.error) : null,
      body,
      props.picking
        ? h('div', { className: 'ap-overlay', onClick: (event) => { if (event.target === event.currentTarget) props.onClosePicker() } },
          h('div', { className: 'ap-modal wide' },
            h('h1', null, Icon('filePlus', 18), '添加资料'),
            h('p', { className: 'hint' }, '仅限用户明确登记的文件。企业工效表可一起登记，有则优先于网络调研。'),
            h(FilePickPanel, {
              cwd: props.cwd,
              selected: props.pickSelected,
              onToggle: props.onTogglePick,
            }),
            h('div', { className: 'ap-foot' },
              h('button', { type: 'button', className: 'ap-btn', onClick: props.onClosePicker }, '取消'),
              h('button', { type: 'button', className: 'ap-btn primary', disabled: props.busy === 'files', onClick: props.onSaveFiles }, '保存登记'),
            ),
          ),
        )
        : null,
    )
  }
}
