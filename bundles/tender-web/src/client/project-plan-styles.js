export const projectPlanCss = `
.ap-doc-scroll.plan{padding:0;overflow:hidden;background:#fff;display:flex;flex-direction:column}
.ap-plan{--plan-bg:#fff;--plan-text:#202a34;--plan-muted:#697685;--plan-border:#d9dee4;--plan-header:#59636c;--plan-selected:#e2f0fc;--plan-accent:#167647;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;color:var(--plan-text);background:var(--plan-bg);font:13px/1.4 'Segoe UI','Microsoft YaHei',sans-serif}
.ap-plan *{box-sizing:border-box}
.ap-plan button,.ap-plan input,.ap-plan select,.ap-plan textarea{font:12px/1.4 'Segoe UI','Microsoft YaHei',sans-serif;color:var(--plan-text)}
.ap-plan button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;border:1px solid transparent;border-radius:3px;background:transparent;padding:4px 8px;cursor:pointer;white-space:nowrap}
.ap-plan button:hover:not(:disabled){background:var(--plan-selected);border-color:var(--plan-border)}
.ap-plan button:disabled{opacity:.4;cursor:default}
.ap-plan button:focus-visible,.ap-plan input:focus,.ap-plan select:focus,.ap-plan textarea:focus{outline:2px solid #3991d4;outline-offset:-1px}
.ap-plan input,.ap-plan select,.ap-plan textarea{border:1px solid var(--plan-border);border-radius:3px;background:var(--plan-bg);min-height:30px;padding:4px 7px;min-width:0}
.ap-plan button.primary{background:var(--plan-accent);color:white;border-color:var(--plan-accent)}
.ap-plan-toolbar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--plan-border);flex-wrap:wrap}
.ap-plan-toolbar strong{font-size:18px;font-weight:600;color:var(--plan-accent);margin-inline-end:6px;white-space:nowrap}
.ap-plan-project{max-width:320px;width:230px}
.ap-plan-search{width:180px}
.ap-plan-mobile-view{display:none}
.ap-plan-tools{display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.ap-plan-tools label{display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap}
.ap-plan-tools input[type=checkbox]{min-height:0;width:13px;height:13px;accent-color:var(--plan-accent)}
.ap-plan-tools select{max-width:112px}
.ap-plan-export{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--plan-border);background:#f4f7f8;flex-wrap:wrap}
.ap-plan-export label{display:flex;gap:6px;align-items:center}
.ap-plan-export input{width:270px;max-width:100%}
.ap-plan-split{display:grid;grid-template-columns:minmax(0,var(--ap-plan-table,52%)) 7px minmax(0,1fr);flex:1;min-height:160px;direction:ltr;overflow:hidden}
.ap-plan-pane{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.ap-plan-divider{background:#edf0f3;border-inline:1px solid var(--plan-border);cursor:col-resize;touch-action:none}
.ap-plan-divider:hover,.ap-plan-divider:focus-visible{background:#91b9cc}
.ap-plan-header{height:52px;flex:0 0 52px;overflow:hidden;background:var(--plan-header);color:#fff;border-bottom:1px solid var(--plan-border)}
.ap-plan-grid-head,.ap-plan-task-row{display:grid;grid-template-columns:44px 95px 320px 86px 112px 112px 70px 160px}
.ap-plan-grid-head{height:52px;width:1099px;align-items:end;will-change:transform}
.ap-plan-grid-head>div{padding:8px;border-inline-end:1px solid #74808b;height:32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-plan-scroll{flex:1;min-height:0;overflow:scroll;scrollbar-width:thin;overscroll-behavior:contain}
.ap-plan-grid-content{position:relative;width:1099px;min-height:100%}
.ap-plan-task-row{position:absolute;left:0;width:1099px;height:28px;align-items:center;border-bottom:1px solid var(--plan-border);background:var(--plan-bg);cursor:default;outline:none}
.ap-plan-task-row:nth-child(even){background:color-mix(in srgb,var(--plan-bg) 97%,#637b90)}
.ap-plan-task-row.selected{background:var(--plan-selected)}
.ap-plan-task-row:focus-visible{box-shadow:inset 0 0 0 2px #3991d4}
.ap-plan-task-row.summary{font-weight:650}
.ap-plan-cell{height:28px;display:flex;align-items:center;gap:4px;border-inline-end:1px solid var(--plan-border);padding:0 8px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ap-plan-cell.row-number{color:var(--plan-muted);justify-content:center;padding:0 3px;background:color-mix(in srgb,var(--plan-bg) 93%,#637b90);font-size:11px}
.ap-plan-cell.task-name{padding-inline-start:6px}
.ap-plan-cell.task-name span{overflow:hidden;text-overflow:ellipsis}
.ap-plan-cell.task-name button{min-height:20px;min-width:20px;width:20px;padding:1px;border:0;flex:none}
.ap-plan-cell.task-name input{width:100%;height:24px;min-height:24px;padding:2px 4px;font-weight:400}
.ap-plan-caret-space{width:20px;flex:none}
.ap-plan-modified{color:#bd7218;flex:none;font-size:15px}
.ap-plan-ruler{position:relative;height:52px;will-change:transform}
.ap-plan-ruler-cell{position:absolute;padding:3px 6px;white-space:nowrap;overflow:hidden;border-inline-end:1px solid #74808b;height:26px;font-size:11px}
.ap-plan-ruler-cell.unit{top:26px;border-top:1px solid #74808b}
.ap-plan-chart-content{position:relative;min-height:100%;background:var(--plan-bg);isolation:isolate}
.ap-plan-chart-row{position:absolute;left:0;right:0;height:28px;border-bottom:1px solid var(--plan-border);z-index:0;cursor:pointer}
.ap-plan-chart-row.selected{background:var(--plan-selected)}
.ap-plan-chart-grid{position:absolute;inset:0;pointer-events:none;z-index:1}
.ap-plan-tick{position:absolute;top:0;bottom:0;border-inline-start:1px solid #e2e7ec}
.ap-plan-bar{position:absolute;height:12px;top:8px;background:#87bceb;border:1px solid #368cd3;border-radius:1px;z-index:3;min-height:0!important;padding:0!important;overflow:visible}
.ap-plan-bar:hover:not(:disabled){background:#70aedd!important;border-color:#368cd3!important}
.ap-plan-bar.critical{background:#f9aaaa;border-color:#d45e5e}
.ap-plan-bar.critical:hover:not(:disabled){background:#f19a9a!important;border-color:#d45e5e!important}
.ap-plan-progress{height:100%;background:#2a7fc6;display:block}
.ap-plan-bar.critical .ap-plan-progress{background:#c94343}
.ap-plan-bar.summary{height:6px;top:9px;background:#39444f;border:0;border-radius:0;overflow:visible}
.ap-plan-bar.summary:before,.ap-plan-bar.summary:after{content:'';position:absolute;top:0;border-top:11px solid #39444f;border-right:6px solid transparent}
.ap-plan-bar.summary:before{left:0}.ap-plan-bar.summary:after{right:0;transform:scaleX(-1)}
.ap-plan-bar.milestone{width:10px!important;height:10px;top:9px;transform:translateX(-5px) rotate(45deg);background:#287fbd;border-color:#287fbd;border-radius:0}
.ap-plan-bar.milestone.critical{background:#cf5555;border-color:#cf5555}
.ap-plan-bar.selected{box-shadow:0 0 0 2px var(--plan-bg),0 0 0 3px #1573ad}
.ap-plan-links{position:absolute;left:0;top:0;pointer-events:none;z-index:2;overflow:hidden}
.ap-plan-today{position:absolute;top:0;bottom:0;border-left:1px dashed #328653;z-index:4;pointer-events:none}
.ap-plan-today span{position:sticky;top:0;display:inline-block;background:#328653;color:white;padding:1px 4px;white-space:nowrap;font-size:10px}
.ap-plan-inspector{display:grid;grid-template-columns:minmax(0,2fr) minmax(150px,1fr) minmax(160px,1fr);gap:12px;padding:10px 14px;border-top:1px solid var(--plan-border);max-height:220px;overflow:auto;flex-shrink:0}
.ap-plan-detail-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ap-plan-detail-fields .name{grid-column:1/-1}
.ap-plan-inspector label{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:11px;color:var(--plan-muted)}
.ap-plan-inspector input,.ap-plan-inspector textarea{width:100%;font-size:12px;color:var(--plan-text)}
.ap-plan-inspector textarea{height:90px;resize:vertical}
.ap-plan-detail-read{display:flex;flex-direction:column;gap:8px;border-inline-start:1px solid var(--plan-border);padding-inline-start:12px;font-size:11px}
.ap-plan-detail-read div{overflow-wrap:anywhere}
.ap-plan-detail-read span{display:block;color:var(--plan-muted);margin-bottom:3px}
.ap-plan-detail-read button{font-size:11px;color:#247eaf;min-height:22px;padding:0 4px}
.ap-plan-footer{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 14px;border-top:1px solid var(--plan-border);color:var(--plan-muted);font-size:11px;flex-shrink:0}
.ap-plan-legend{display:flex;align-items:center;gap:10px;margin-inline-start:auto}
.ap-plan-legend i{display:inline-block;width:10px;height:7px;background:#87bceb;margin-inline-end:4px;border:1px solid #368cd3}
.ap-plan-legend i.critical{background:#f9aaaa;border-color:#d45e5e}
.ap-plan-legend i.milestone{height:7px;width:7px;transform:rotate(45deg);background:#287fbd}
.ap-plan-message{padding:8px 14px;border-bottom:1px solid var(--plan-border);font-size:12px;flex-shrink:0;overflow-wrap:anywhere;max-height:80px;overflow:auto}
.ap-plan-message.error{color:#b92e2e;background:#fff4f4}
.ap-plan-message.success{color:#247348;background:#f0faf4}
.ap-plan-empty{padding:30px;color:var(--plan-muted);text-align:center}
.ap-plan-help{padding:6px 14px;border-top:1px solid var(--plan-border);font-size:11px;color:var(--plan-muted)}
.ap-plan-help summary{cursor:pointer}
body[data-ds-dark-theme] .ap-plan{--plan-bg:#1e252c;--plan-text:#e1e8ee;--plan-muted:#a4b2be;--plan-border:#394550;--plan-header:#35424f;--plan-selected:#243e54;--plan-accent:#4db27b}
body[data-ds-dark-theme] .ap-plan-export{background:#232e37}
body[data-ds-dark-theme] .ap-plan-tick{border-color:#35414c}
@media(max-width:850px){.ap-plan-toolbar{gap:6px;padding:8px}.ap-plan-toolbar strong{font-size:16px}.ap-plan-project{width:210px}.ap-plan-search{width:160px}.ap-plan-inspector{grid-template-columns:1fr 1fr;max-height:210px}.ap-plan-detail-read{display:none}.ap-plan-footer{gap:6px}.ap-plan-tools button{padding:4px 6px}}
@media(max-width:550px){.ap-plan-toolbar{gap:4px}.ap-plan-project{width:calc(100% - 110px);max-width:none}.ap-plan-search{width:calc(100% - 140px)}.ap-plan-mobile-view{display:block}.ap-plan-inspector{grid-template-columns:1fr;max-height:220px}.ap-plan-detail-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.ap-plan-inspector>label{display:none}.ap-plan-split{grid-template-columns:minmax(0,1fr)}.ap-plan-divider{display:none}.ap-plan-split.table-view>.ap-plan-pane:last-child,.ap-plan-split.chart-view>.ap-plan-pane:first-child{display:none}.ap-plan-legend{display:none}.ap-plan-export label{max-width:100%;flex-wrap:wrap}.ap-plan-export input{width:210px}.ap-plan-help{display:none}}
`
