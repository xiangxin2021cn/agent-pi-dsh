window.__ModuleLoader__.load({
  id: 'dsh-tender-web',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const css = `
:root, html{
  --ap-accent: oklch(0.64 0.13 205);
  --ap-success: oklch(0.60 0.16 165);
  --ap-destructive: oklch(0.55 0.22 27);
  --ap-info: oklch(0.74 0.15 118);
}
body[data-ds-dark-theme]{
  --ap-accent: oklch(0.73 0.14 205);
  --ap-success: oklch(0.68 0.14 165);
  --ap-destructive: oklch(0.68 0.18 27);
}
.ap-wb{
  height:100%;overflow:auto;box-sizing:border-box;
  display:flex;flex-direction:column;min-height:0;
  color:var(--dsw-alias-label-primary);
  background:var(--dsw-alias-bg-layer-1);
  font-size:13px;line-height:1.45;
}
.ap-icon{display:inline-block;flex-shrink:0;vertical-align:-0.125em}
.ap-hdr{border-bottom:1px solid var(--dsw-alias-border-l1);padding:20px 24px 16px;flex-shrink:0}
.ap-hdr h1{font-size:17px;font-weight:600;margin:0;letter-spacing:-0.01em}
.ap-path{margin-top:6px;display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;min-width:0}
.ap-path span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 24px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-layer-1));flex-shrink:0}
.ap-mods{display:flex;gap:4px}
.ap-mod{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:500}
.ap-mod:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-mod.on{color:var(--ap-accent);background:color-mix(in srgb, var(--ap-accent) 12%, transparent)}
.ap-actions{display:flex;gap:8px;flex-wrap:wrap}
.ap-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 11px;cursor:pointer;font-size:12px;font-weight:500}
.ap-btn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-alias-bg-base))}
.ap-btn.primary{background:color-mix(in srgb, var(--ap-accent) 16%, var(--dsw-alias-bg-base));border-color:color-mix(in srgb, var(--ap-accent) 40%, var(--dsw-alias-border-l2));color:var(--ap-accent)}
.ap-btn.primary:hover{background:color-mix(in srgb, var(--ap-accent) 22%, var(--dsw-alias-bg-base))}
.ap-btn.warn{color:var(--ap-destructive);border-color:color-mix(in srgb, var(--ap-destructive) 35%, var(--dsw-alias-border-l2))}
.ap-body{padding:20px 24px 40px}
.ap-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:16px 18px;margin:0 0 12px;background:var(--dsw-alias-bg-base)}
.ap-card-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-card-hd h2{font-size:15px;font-weight:600;margin:0}
.ap-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-top:4px}
.ap-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.ap-chip{font-size:10px;font-weight:500;padding:2px 8px;border-radius:6px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-secondary)}
.ap-chip.warn{background:color-mix(in srgb, var(--ap-destructive) 12%, transparent);color:var(--ap-destructive)}
.ap-chip.ok{background:color-mix(in srgb, var(--ap-success) 12%, transparent);color:var(--ap-success)}
.ap-chip.live{background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent)}
.ap-stages{display:flex;align-items:center;gap:4px;overflow-x:auto;border-bottom:1px solid var(--dsw-alias-border-l1);margin:14px -18px 0;padding:0 18px}
.ap-stage{flex-shrink:0;height:32px;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);padding:0 10px;cursor:pointer;font-size:12px}
.ap-stage:hover{color:var(--dsw-alias-label-primary)}
.ap-stage.on{border-bottom-color:var(--ap-accent);color:var(--dsw-alias-label-primary);font-weight:600}
.ap-stage.done{color:var(--ap-success)}
.ap-stage.blocked{color:var(--ap-destructive)}
.ap-gap{font-size:12px;color:var(--dsw-alias-label-secondary);margin:6px 0;display:flex;align-items:flex-start;gap:8px}
.ap-task{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.ap-task:first-of-type{border-top:0}
.ap-bar{height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);overflow:hidden;margin:8px 0 4px}
.ap-bar>i{display:block;height:100%;background:var(--ap-accent);border-radius:999px;transition:width .3s ease}
.ap-bar.fail>i{background:var(--ap-destructive)}
.ap-kb-ok{padding:8px 12px;border-radius:8px;background:color-mix(in srgb, var(--ap-success) 14%, transparent);color:var(--ap-success);font-size:12px;margin:8px 0}
.ap-kb-files{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ap-kb-file{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-kb-file-ico{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent);flex-shrink:0}
.ap-kb-file-ico.warn{background:color-mix(in srgb, var(--ap-destructive) 12%, transparent);color:var(--ap-destructive)}
.ap-kb-file-ico.ok{background:color-mix(in srgb, var(--ap-success) 12%, transparent);color:var(--ap-success)}
.ap-kb-file-main{min-width:0;flex:1}
.ap-kb-file-main strong{display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-kb-file .ap-bar{margin:6px 0 2px}
.ap-kb-drop{outline:2px dashed color-mix(in srgb, var(--ap-accent) 55%, transparent);outline-offset:4px;border-radius:12px}
.ap-kb-paths{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin:10px 0 12px}
@media (max-width: 1100px){.ap-kb-paths{grid-template-columns:1fr}}
.ap-kb-path{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-base))}
.ap-kb-path strong{display:block;font-size:13px;margin-bottom:4px}
.ap-kb-path p{margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}
.ap-kb-path p + p{margin-top:8px}
.ap-kb-say{margin-top:8px;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--ap-accent) 10%, var(--dsw-alias-bg-base))}
.ap-kb-folder{margin:8px 0 4px;padding:2px 0 2px 12px;border-left:2px solid color-mix(in srgb, var(--ap-accent) 40%, var(--dsw-alias-border-l2))}
.ap-kb-folder-hd{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 4px}
.ap-kb-home{font:inherit;font-size:12px;max-width:148px;padding:2px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit}
.ap-kb-skills{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.ap-kb-skill{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-kb-skill-ico{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--ap-accent) 12%, transparent);color:var(--ap-accent);flex-shrink:0}
.ap-kb-skill-main{min-width:0;flex:1}
.ap-kb-skill-hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ap-kb-skill-hd strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.ap-kb-skill-desc{margin:4px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.ap-kb-skill .ap-chip{display:inline-block;max-width:100%;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-split{display:flex;flex:1;min-height:0}
.ap-col{width:280px;flex:none;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-layer-1))}
.ap-col-hd{padding:12px 14px 6px;font-size:11px;font-weight:650;letter-spacing:.06em;color:var(--dsw-alias-label-tertiary)}
.ap-col-empty{padding:4px 14px 10px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.45}
.ap-proj{display:block;width:100%;border:0;border-left:2px solid transparent;background:transparent;text-align:left;padding:8px 14px;cursor:pointer;color:inherit}
.ap-proj:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-proj.on{background:color-mix(in srgb, var(--ap-accent) 12%, transparent);border-left-color:var(--ap-accent)}
.ap-proj strong{display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-proj em{display:block;font-style:normal;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.ap-sess{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;text-align:left;padding:5px 14px 5px 22px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;min-width:0}
.ap-sess:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}
.ap-sess.on{color:var(--ap-accent)}
.ap-sess span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-main{flex:1;min-width:0;overflow:auto}
.ap-landing{display:flex;min-height:calc(100% - 40px);align-items:center;justify-content:center;padding:40px 24px}
.ap-landing-inner{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;max-width:520px}
.ap-landing-inner h1{font-size:17px;margin:0;font-weight:600}
.ap-landing-inner p{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.ap-landing-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:4px}
.ap-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 55%, transparent);pointer-events:auto;z-index:40}
.ap-modal{width:min(480px,92vw);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:16px;padding:22px 24px;pointer-events:auto;box-shadow:0 16px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}
.ap-modal h1{font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:8px}
.ap-modal .hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0 0 16px}
.ap-modal label{display:block;font-size:12px;font-weight:500;margin:8px 0 2px;color:var(--dsw-alias-label-secondary)}
.ap-wb input,.ap-wb select,.ap-modal input,.ap-modal select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font-size:13px}
.ap-kb-pick{position:relative;display:inline-flex;align-items:center}
.ap-kb-pick input[type=file]{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;font-size:16px;padding:0;border:0}
.ap-wb input[type=file],.ap-kb-native{display:block !important;width:auto !important;max-width:100%;margin-top:8px;padding:8px 10px !important;cursor:pointer}
.ap-err{color:var(--ap-destructive);font-size:12px;white-space:pre-wrap;margin:8px 0}
.ap-draft{white-space:pre-wrap;font:var(--dsw-font-markdown-code-block-small);background:var(--dsw-alias-markdown-code-block);padding:10px;border-radius:8px;max-height:180px;overflow:auto}
.ap-spin{animation:ap-spin 0.8s linear infinite}
@keyframes ap-spin{to{transform:rotate(360deg)}}
.ap-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.ap-codex-settings{max-width:760px;padding:24px;color:var(--dsw-alias-label-primary)}
.ap-codex-settings h1{font-size:18px;margin:0 0 6px}
.ap-codex-lead{margin:0 0 18px;color:var(--dsw-alias-label-secondary);line-height:1.65}
.ap-codex-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:18px;background:var(--dsw-alias-bg-base)}
.ap-codex-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.ap-codex-status strong{font-size:14px}
.ap-codex-note{margin:14px 0 0;padding:12px;border-radius:9px;background:color-mix(in srgb, var(--ap-accent) 8%, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-secondary);line-height:1.6}
.ap-codex-note code{color:var(--ap-accent)}
:root{--ap-files-w:300px}
.ap-files-dock{
  position:fixed;top:0;right:0;bottom:0;width:var(--ap-files-w);
  pointer-events:auto;z-index:21;
  border-left:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);
  box-shadow:-8px 0 24px color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.ap-files-resizer{
  position:absolute;left:-4px;top:0;bottom:0;width:10px;z-index:4;
  cursor:col-resize;touch-action:none;
}
.ap-files-resizer::after{
  content:'';position:absolute;top:18%;bottom:18%;left:4px;width:3px;border-radius:999px;
  background:var(--dsw-alias-border-l2);opacity:.75;
}
.ap-files-resizer:hover::after,
.ap-files-dock.resizing .ap-files-resizer::after{
  background:var(--ap-accent,#0f8a8a);opacity:1;
}
.ap-files-dock.collapsed .ap-files-resizer{display:none}
html.ap-rail-resizing{cursor:col-resize;user-select:none}
[data-side="sidebar"]{
  z-index:40!important;width:10px;margin-left:-5px;
}
[data-side="sidebar"]::after{
  content:'';position:absolute;top:16%;bottom:16%;left:3px;width:3px;border-radius:999px;
  background:var(--dsw-alias-border-l2);opacity:.85;
}
[data-side="sidebar"]:hover::after,
[data-side="sidebar"][data-dragging]::after{
  background:var(--ap-accent,#0f8a8a);opacity:1;
}
.ap-files-dock .ap-files{height:100%}
.ap-files-dock.collapsed{width:56px;box-shadow:none}
.ap-files-dock.collapsed .ap-files-tree,
.ap-files-dock.collapsed .ap-err,
.ap-files-dock.collapsed .ap-files-hd strong{display:none}
.ap-files-dock.collapsed .ap-files-hd{
  flex-direction:column;flex:1;height:100%;border:0;padding:18px 10px 10px;align-items:center;
}
.ap-files-dock.collapsed .ap-files-hd .ap-row{
  flex-direction:column;flex:1;width:100%;justify-content:flex-start;align-items:center;gap:8px;
}
.ap-files-dock.collapsed .ap-files-hd .ap-toolbtn{width:36px;height:36px}
.ap-files-dock.collapsed .ap-files-toggle{margin-top:auto}
html.ap-files-rail [data-phase="hero"],
html.ap-files-rail [data-phase="active"],
html.ap-files-rail [data-phase="settling"]{margin-right:var(--ap-files-w)}
html.ap-files-rail.ap-files-collapsed [data-phase="hero"],
html.ap-files-rail.ap-files-collapsed [data-phase="active"],
html.ap-files-rail.ap-files-collapsed [data-phase="settling"]{margin-right:56px}
html.ap-wb-open [data-shell-overlay]{z-index:20}
.ap-wb-page{
  position:absolute;top:0;right:0;bottom:0;pointer-events:auto;z-index:6;
  background:var(--dsw-alias-bg-layer-1);
  border-left:1px solid var(--dsw-alias-border-l1);
  overflow:auto;
}
html.ap-files-rail .ap-wb-page{right:var(--ap-files-w)}
html.ap-files-rail.ap-files-collapsed .ap-wb-page{right:56px}
.ap-nav{
  display:flex;align-items:center;gap:8px;width:100%;height:36px;margin:0 0 6px;
  border:0;border-radius:8px;padding:0 10px;cursor:pointer;
  background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:13px;font-weight:600;text-align:left;
}
.ap-nav:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);color:var(--dsw-alias-label-primary)}
.ap-nav.on{background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent)}
.ap-nav.rail{width:36px;height:36px;padding:0;margin:0 0 8px;justify-content:center}
.ap-nav-host,.ap-company,.ap-pi{width:100%;flex:none}
.ap-arch-lead{margin:0 0 12px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ap-arch-group{margin:0 0 16px}
.ap-arch-group-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}
.ap-arch-group-hd h3{margin:0;font-size:13px;font-weight:650}
.ap-arch-empty{margin:0 0 8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.ap-arch-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px;background:var(--dsw-alias-bg-base)}
.ap-arch-row strong{display:block;font-size:13px;font-weight:600}
.ap-arch-row .ap-sub{margin-top:2px}
.ap-arch-actions{display:flex;flex-wrap:wrap;gap:6px;flex:none}
[data-ap-archived-workspace]{display:none!important}
.ap-mount{flex:none;width:100%;display:flex;flex-direction:column;align-items:stretch}
html.ap-simple-nav [data-slot="sidebar"] *:has(> button:has(> svg[viewBox="0 0 182 24"])){
  height:auto!important;min-height:40px;justify-content:flex-end;overflow:visible!important;
}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"]){
  display:inline-flex!important;align-items:center;justify-content:flex-start;
  min-width:0;height:auto;padding:0 8px 0 0;overflow:hidden;
}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"]) svg{display:none!important}
html.ap-simple-nav [data-slot="sidebar"] button:has(> svg[viewBox="0 0 182 24"])::after,
html.ap-simple-nav [data-slot="sidebar"] button:has([class*="fallbackBrandName"])::after{
  content:"Agent Pi DSH";
  font-size:13px;font-weight:650;letter-spacing:-0.03em;line-height:1.3;
  color:var(--dsw-alias-label-primary);white-space:nowrap;
}
html.ap-simple-nav [data-slot="sidebar"] [class*="fallbackBrandName"],
html.ap-simple-nav [data-slot="sidebar"] [class*="buildRevision"]{display:none!important}
html.ap-simple-nav [data-slot="sidebar"] button[class*="brand"] svg[viewBox="0 0 23.16 17.04"]{display:none!important}
.ap-sidebar-brand-name{
  font-size:13px;font-weight:650;letter-spacing:-0.03em;line-height:1.3;
  color:var(--dsw-alias-label-primary);white-space:nowrap;
}
.ap-company{display:flex;align-items:center;justify-content:center;padding:4px 2px 10px}
.ap-company img{display:block;width:100%;height:auto;max-height:34px;object-fit:contain;object-position:center;user-select:none}
.ap-pi{display:flex;align-items:center;justify-content:center;margin:8px 0 2px;padding:4px 4px 6px;background:transparent;box-sizing:border-box}
.ap-pi img{display:block;width:100%;max-width:140px;height:auto;max-height:100px;object-fit:contain;object-position:center;user-select:none;pointer-events:none}
.ap-pi.rail{width:36px;height:36px;margin:6px auto 4px;padding:0}
.ap-pi.rail img{width:32px;height:32px;max-height:32px}
[data-sidebar-collapsed] #ap-mount-company{display:none}
[data-phase="hero"]::before,
[data-phase="active"]::before,
[data-phase="settling"]::before{
  content:"";display:block;flex:none;box-sizing:border-box;
  height:44px;margin:8px 24px 2px;pointer-events:none;
  background:url("/api/agent-pi/brand/company.png?v=5") center / contain no-repeat;
}
.ap-files{height:100%;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;position:relative}
.ap-files-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-shrink:0}
.ap-files-hd strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.ap-files-hd .ap-row{gap:4px}
.ap-files-tree{flex:1;min-height:0;overflow:auto;padding:6px 8px 16px}
.ap-files-sec{font-size:11px;font-weight:650;color:var(--dsw-alias-label-tertiary);padding:10px 6px 4px}
.ap-files-empty{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:4px 6px 8px;line-height:1.45}
.ap-tree-row{display:flex;align-items:center;gap:2px;min-width:0}
.ap-tree-btn{display:flex;align-items:center;gap:6px;flex:1;width:auto;min-width:0;border:0;background:transparent;color:inherit;text-align:left;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px}
.ap-tree-btn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-tree-inject{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:0;border-radius:6px;background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent);cursor:pointer;padding:0}
.ap-tree-inject:hover{background:color-mix(in srgb, var(--ap-accent) 24%, transparent)}
.ap-tree-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-tree-kids{margin-left:12px;border-left:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);padding-left:4px}
.ap-menu{position:fixed;z-index:2147483000;min-width:180px;padding:4px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)}
.ap-menu button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:inherit;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12px;text-align:left}
.ap-menu button:hover{background:color-mix(in srgb, var(--ap-accent) 12%, transparent)}
.ap-toolbtn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}
.ap-toolbtn:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);color:var(--ap-accent)}
.ap-toolbtn.on{color:var(--ap-accent, #0f8a8a);background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 14%, transparent)}
.ap-toolbtn:disabled{opacity:.4;cursor:default}
.ap-codex-turn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer}
.ap-codex-turn:hover,.ap-codex-turn.on{color:var(--ap-accent);border-color:color-mix(in srgb,var(--ap-accent) 45%,var(--dsw-alias-border-l2));background:color-mix(in srgb,var(--ap-accent) 12%,transparent)}
.ap-header-tool{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;min-width:32px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:18px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.ap-header-tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.ap-header-tool:disabled{opacity:.4;cursor:default}
.ap-lang{
  display:inline-flex;align-items:center;justify-content:center;gap:4px;
  width:100%;height:32px;margin:0 0 6px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;font-weight:650;cursor:pointer;letter-spacing:.02em;
}
.ap-lang:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-lang b{color:var(--dsw-alias-label-primary);font-weight:700}
.ap-badge{position:absolute;top:-3px;right:-3px;min-width:14px;height:14px;padding:0 4px;border-radius:999px;background:var(--ap-accent);color:#fff;font-size:9px;line-height:14px;font-weight:700}
.ap-attach-host{min-width:0;padding:4px 12px 6px}
[data-slot="conversation.input.dock"]{
  display:flex!important;flex-direction:column;width:100%;min-width:0;visibility:visible!important;
}
[data-slot="conversation.input.dock"] .ap-attach-host{
  display:block!important;visibility:visible!important;opacity:1!important;
  max-width:var(--dsh-composer-card-max-width, 100%);
  margin:0 auto;
  padding:0 0 8px;
  position:relative;z-index:8;
}
.ap-composer-tools{display:flex;align-items:center;gap:8px;flex:none;min-width:max-content}
[data-slot="conversation.input.left"]{overflow:visible!important;flex:none;min-width:max-content}
.ap-attach-in-card{
  display:block!important;visibility:visible!important;opacity:1!important;
  width:100%;box-sizing:border-box;padding:8px 12px 0;min-height:0;
}
.ap-attach-in-card .ap-attach-host{padding:0}
.ap-attach-rail{display:flex;gap:8px;padding:0;overflow-x:auto;max-width:100%}
.ap-attach-bubble{position:relative;flex:none;display:flex;align-items:center;gap:8px;height:40px;max-width:240px;padding:0 12px 0 8px;border:1px solid var(--dsw-alias-border-l2-darkmode-thin, color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent));border-radius:12px;background:var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 6%, var(--dsw-alias-bg-base)))}
.ap-attach-bubble.loading{opacity:.72}
.ap-attach-bubble.image{width:40px;height:40px;max-width:40px;padding:0;overflow:hidden}
.ap-attach-thumb{width:22px;height:22px;border-radius:6px;background:transparent;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;color:var(--dsw-alias-state-business-primary, #2b6cb0)}
.ap-attach-bubble.image .ap-attach-thumb{width:40px;height:40px;border-radius:12px}
.ap-attach-thumb img{width:100%;height:100%;object-fit:cover}
.ap-attach-meta{display:flex;align-items:center;min-width:0;max-width:176px}
.ap-attach-meta strong{font-size:12px;font-weight:600;line-height:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.ap-attach-meta em{display:none}
.ap-attach-x{position:absolute;top:2px;right:2px;width:16px;height:16px;border:0;border-radius:999px;background:var(--dsw-alias-button-contrast-fill, color-mix(in srgb, var(--dsw-alias-label-primary) 70%, #000));color:var(--dsw-alias-label-primary-inverted, #fff);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:1}
.ap-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:90;padding:8px 12px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 88%, #000);color:#fff;font-size:12px;box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent)}
.ap-attach-float{
  position:fixed;z-index:2147482000;pointer-events:auto;
  box-sizing:border-box;padding:0 4px;
  visibility:visible!important;opacity:1!important;
}
.ap-attach-float .ap-attach-rail{
  padding:6px 8px;border-radius:12px;
  background:color-mix(in srgb, var(--dsw-alias-bg-base) 92%, transparent);
  box-shadow:0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent);
}
.ap-keydlg{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent)}
.ap-keydlg-card{width:min(440px,calc(100vw - 48px));padding:24px 24px 20px;border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:0 24px 64px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);color:var(--dsw-alias-label-primary)}
.ap-keydlg-card h2{margin:0 0 10px;font-size:18px;font-weight:650}
.ap-keydlg-card p{margin:0 0 16px;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ap-keydlg-field{display:flex;flex-direction:column;gap:6px;margin:0 0 16px}
.ap-keydlg-field span{font-size:12px;font-weight:600}
.ap-keydlg-field input{height:36px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:inherit}
.ap-keydlg-error{color:var(--ap-destructive)!important;margin:0 0 12px!important}
.ap-keydlg-actions{display:flex;justify-content:flex-end;gap:8px}
.ap-switch{position:relative;width:36px;height:20px;flex:none;flex-shrink:0;border:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 18%, var(--dsw-alias-bg-base));cursor:pointer;padding:0}
.ap-switch.on{background:var(--ap-accent, #0f8a8a);border-color:var(--ap-accent, #0f8a8a)}
.ap-switch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s ease;pointer-events:none;display:block}
.ap-switch.on .ap-switch-knob{left:18px}
[data-slot="sidebar.workspaces"] [class*="rowActions"],
[data-slot="sidebar.workspaces"] [class*="iconButton"]{
  opacity:1!important;visibility:visible!important;color:#111827!important;
}
.ap-preview{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);z-index:2}
.ap-preview pre{flex:1;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;font:var(--dsw-font-markdown-code-block-small)}
.ap-doc{position:fixed;inset:0;z-index:400;display:flex;flex-direction:column;pointer-events:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
html.ap-doc-open [data-shell-overlay]{z-index:400;pointer-events:auto}
.ap-doc-hd{height:48px;flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 12px;position:relative}
.ap-doc-path{position:absolute;left:50%;transform:translateX(-50%);min-width:0;max-width:min(280px,22vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, var(--dsw-alias-bg-base));border-radius:8px;padding:6px 12px;font-size:12px;z-index:1;pointer-events:none}
.ap-doc-actions{display:flex;align-items:center;gap:4px;flex-shrink:0;position:relative;z-index:2}
.ap-doc-exports{display:inline-flex;align-items:center;gap:4px;margin-left:4px;padding-left:8px;border-left:1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)}
.ap-doc-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;min-width:28px;padding:0 8px;border:0;border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);font-size:12px;font-weight:500;cursor:pointer;opacity:.8}
.ap-doc-btn:hover{opacity:1}
.ap-doc-btn:disabled{opacity:.35;cursor:default}
.ap-doc-scroll{flex:1;min-height:0;overflow:auto;padding:40px 24px 80px}
.ap-doc-scroll.univer{padding:0;overflow:hidden;background:#fff;position:relative}
.ap-univer-frame{position:absolute;inset:0;display:block;width:100%;height:100%;border:0;background:#fff}
.ap-doc-sheet{width:min(960px,100%);margin:0 auto;background:var(--dsw-alias-bg-base);border-radius:16px;padding:36px 44px 56px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)}
.ap-doc-sheet.wide{width:min(1180px,100%);padding:28px 28px 40px}
.ap-doc-sheet h1{font-size:22px;line-height:1.3;margin:0 0 16px;font-weight:650}
.ap-doc-sheet h2{font-size:17px;margin:22px 0 10px;font-weight:650}
.ap-doc-sheet h3{font-size:15px;margin:18px 0 8px;font-weight:600}
.ap-doc-sheet p,.ap-doc-sheet li{font-size:14px;line-height:1.7;margin:0 0 10px}
.ap-doc-sheet ul,.ap-doc-sheet ol{margin:0 0 12px;padding-left:22px}
.ap-doc-sheet blockquote{border-left:4px solid var(--dsw-alias-border-l2);margin:0 0 12px;padding:0 12px;color:var(--dsw-alias-label-secondary)}
.ap-doc-sheet img{max-width:100%;height:auto;border-radius:8px;margin:8px 0}
.ap-doc-sheet hr{border:0;border-top:1px solid var(--dsw-alias-border-l2);margin:18px 0}
.ap-doc-sheet code{font:var(--dsw-font-markdown-code-block-small);background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);padding:1px 5px;border-radius:4px}
.ap-doc-sheet pre{white-space:pre-wrap;background:var(--dsw-alias-markdown-code-block);padding:12px;border-radius:8px;overflow:auto;font:var(--dsw-font-markdown-code-block-small)}
.ap-doc-sheet a{color:var(--ap-accent);word-break:break-all}
.ap-doc-sheet table{border-collapse:collapse;width:max-content;min-width:100%;margin:0;font-size:13px}
.ap-doc-sheet th,.ap-doc-sheet td{border:1px solid var(--dsw-alias-border-l2);padding:6px 8px;text-align:left}
.ap-doc-table-wrap{overflow:auto;max-width:100%;margin:0 0 14px}
.ap-doc-more{margin:8px 0 16px}
.ap-doc-edit{width:100%;min-height:56vh;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px 14px;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-markdown-code-block-small);resize:vertical;line-height:1.65}
.ap-doc-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 10px;position:sticky;top:0;z-index:2;padding:8px 0 10px;background:var(--dsw-alias-bg-base)}
.ap-fico-md{color:#0e7490}
.ap-fico-sheet{color:#217346}
.ap-fico-word{color:#2563eb}
.ap-fico-ppt{color:#ea580c}
.ap-fico-pdf{color:#dc2626}
.ap-fico-html{color:#7c3aed}
.ap-fico-img{color:#0284c7}
.ap-fico-json{color:#ca8a04}
.ap-fico-txt{color:#64748b}
.ap-fico-file{color:#94a3b8}
.ap-fico-folder{color:#d97706}
.ap-icon.ap-fico-md,.ap-icon.ap-fico-sheet,.ap-icon.ap-fico-word,.ap-icon.ap-fico-ppt,
.ap-icon.ap-fico-pdf,.ap-icon.ap-fico-html,.ap-icon.ap-fico-img,.ap-icon.ap-fico-json,
.ap-icon.ap-fico-txt,.ap-icon.ap-fico-file{border-radius:3px}
.ap-ai-sel{position:fixed;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent)}
.ap-ai-sel-card{width:min(520px,92vw);background:var(--dsw-alias-bg-base);border-radius:14px;padding:18px 20px 16px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent)}
.ap-ai-sel-hd{display:flex;align-items:center;gap:8px;font-weight:650;margin:0 0 10px}
.ap-ai-sel-hd .ap-ai-sel-x{margin-left:auto}
.ap-ai-sel textarea{width:100%;min-height:110px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px;box-sizing:border-box;background:color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}
.ap-sheet{overflow:auto;max-width:100%;margin:0 0 16px}
.ap-sheet table{border-collapse:collapse;font-size:12px}
.ap-sheet th,.ap-sheet td{border:1px solid var(--dsw-alias-border-l2);padding:0}
.ap-sheet input{width:100%;min-width:72px;border:0;padding:5px 7px;background:transparent;color:inherit;font:inherit;box-sizing:border-box}
.ap-slide{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;margin:0 0 12px}
.ap-slide input,.ap-slide textarea{width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;margin:4px 0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}
.ap-doc-toolbar .ap-doc-btn{height:26px;font-size:11px;opacity:1}
.ap-doc-btn.on{opacity:1;color:var(--ap-accent);box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--ap-accent) 55%, transparent)}
.ap-doc-wysiwyg{min-height:56vh;outline:none;caret-color:var(--ap-accent)}
.ap-doc-wysiwyg:empty:before{content:'开始编辑文档…';color:var(--dsw-alias-label-tertiary)}
.ap-doc-hint{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}
.ap-doc-img{display:block;max-width:100%;margin:0 auto;border-radius:8px}
.ap-doc-frame{width:100%;height:calc(100vh - 96px);border:0;background:var(--dsw-alias-bg-base);border-radius:12px}
.ap-doc-status{margin:0 0 14px;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-cite{display:inline-flex;align-items:center;gap:3px;max-width:100%;margin:0 2px;padding:0 6px;border-radius:999px;border:1px solid color-mix(in srgb, var(--ap-accent, #0f8a8a) 45%, transparent);background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 8%, transparent);color:var(--ap-accent, #0f8a8a);font-size:11px;line-height:18px;font-family:var(--dsw-font-family-mono, ui-monospace, monospace);cursor:pointer;vertical-align:baseline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ap-cite:hover{background:color-mix(in srgb, var(--ap-accent, #0f8a8a) 16%, transparent)}
.ap-cite-pop{position:fixed;right:24px;bottom:24px;z-index:520;width:min(420px,calc(100vw - 48px));display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 48px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent)}
.ap-cite-pop-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:12px;min-width:0}
.ap-cite-pop-hd strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.ap-cite-pop-bd{padding:12px 14px;font-size:13px;line-height:1.65;font-family:inherit}
.ap-cite-pop-bd .crumb{font-size:11px;color:var(--dsw-alias-label-tertiary);margin:0 0 8px}
.ap-cite-pop-bd p{margin:0 0 6px}
.ap-audit{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin-top:8px}
.ap-audit.bad{border-color:color-mix(in srgb, #c2410c 55%, transparent);background:color-mix(in srgb, #c2410c 6%, transparent)}
.ap-audit ul{margin:6px 0 0;padding-left:18px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ap-mod-emoji{font-size:15px;line-height:1;display:inline-block}
.ap-mm-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px}
    .ap-mm-row.off{opacity:.55}
    .ap-mm-row strong{font-size:13px}
    .ap-mm-row .grow{flex:1;min-width:0}
    .ap-mm-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin-bottom:8px;overflow:hidden}
    .ap-mm-card.off{opacity:.55}
    .ap-mm-card .ap-mm-row{border:0;border-radius:0;margin:0}
    .ap-mm-stages{padding:8px 14px 12px 40px;border-top:1px solid var(--dsw-alias-border-l1)}
    .ap-mm-stage{display:flex;gap:8px;align-items:flex-start;padding:6px 0;font-size:12px}
    .ap-mm-stage strong{font-size:12px}
    .ap-mm-ed-stage{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin:10px 0}
    .ap-mm-field{display:block;margin-top:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
    .ap-mm-field input,.ap-mm-field textarea,.ap-mm-field select{width:100%;margin-top:4px;padding:8px 10px;box-sizing:border-box;border-radius:8px;border:1px solid var(--dsw-border, rgba(127,127,127,.35));background:transparent;color:inherit;font:inherit}
    .ap-mm-field textarea{min-height:88px;resize:vertical}
    .ap-mm-field.tall textarea{min-height:140px}
    .ap-mm-checks{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px}
    .ap-create-lead{margin-top:8px;padding:12px 14px;border:1px solid color-mix(in srgb, var(--ap-accent) 28%, var(--dsw-alias-border-l1));border-radius:12px;background:color-mix(in srgb, var(--ap-accent) 7%, transparent)}
    .ap-create-lead strong{display:block;margin-bottom:4px}
    .ap-create-picks{display:grid;grid-template-columns:1fr;gap:10px;margin-top:12px}
    .ap-create-pick{display:block;width:100%;text-align:left;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:inherit;cursor:pointer}
    .ap-create-pick:hover{background:color-mix(in srgb, var(--ap-accent) 8%, transparent)}
    .ap-create-pick strong{display:block;font-size:13px;margin-bottom:4px}
    .ap-create-pick span{display:block;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}
.ap-folder-row{display:flex;align-items:center;gap:8px;flex:1;min-width:0;width:auto;border:0;background:transparent;text-align:left;padding:8px 6px;border-radius:8px;cursor:pointer;font-size:14px;color:inherit}
.ap-folder-row:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-btn.ghost{background:transparent;border-color:transparent}
.ap-btn.ghost:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}
.ap-btn.link{background:transparent;border:0;padding:4px 6px;color:var(--dsw-alias-label-secondary);font-weight:500}
.ap-btn.link:hover{color:var(--ap-accent);background:transparent}
.ap-btn:disabled{opacity:.4;cursor:default}
.ap-modal.wide{width:min(680px,94vw);max-height:86vh;overflow:auto}
.ap-steps{display:flex;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l1);padding:0 0 10px;margin:0 0 14px}
.ap-steps span{flex:1;text-align:center;font-size:12px;color:var(--dsw-alias-label-tertiary);padding:0 0 8px;border-bottom:2px solid transparent}
.ap-steps span.on{color:var(--dsw-alias-label-primary);border-bottom-color:var(--ap-accent);font-weight:600}
.ap-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 10px}
.ap-file-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}
.ap-confirm p{margin:6px 0;font-size:13px}
.ap-confirm .k{color:var(--dsw-alias-label-tertiary)}
.ap-ov{display:flex;flex:1;min-height:0}
.ap-ov-main{flex:1;min-width:0;overflow:auto}
.ap-ov-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ap-ov-hd h1{font-size:20px;font-weight:650;margin:0;letter-spacing:-0.02em}
.ap-sec{padding:18px 24px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ap-sec h2{font-size:13px;font-weight:650;margin:0}
.ap-mon-hd{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-mon-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-dot{width:6px;height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent);display:inline-block}
.ap-dot.on{background:var(--ap-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--ap-accent) 22%, transparent)}
.ap-check{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;margin:12px 0 4px;overflow:hidden}
.ap-check-hd{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;font-weight:600;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent)}
.ap-check-hd .ap-sub{font-weight:400;flex:1}
.ap-check-row{display:flex;align-items:baseline;gap:8px;padding:7px 12px;font-size:12px;border-top:1px solid var(--dsw-alias-border-l2)}
.ap-check-row:first-of-type{border-top:0}
.ap-check-row strong{font-weight:600;flex:none}
.ap-check-row .ap-sub{min-width:0}
.ap-check-row.bad{background:color-mix(in srgb, #c0392b 6%, transparent)}
.ap-check-row.bad .ap-sub{color:color-mix(in srgb, #c0392b 72%, var(--dsw-alias-label-primary))}
.ap-check-num{width:16px;flex:none;color:var(--dsw-alias-label-tertiary)}
.ap-stage-row{display:flex;align-items:flex-start;gap:14px;padding:14px 0;border-top:1px solid var(--dsw-alias-border-l2)}
.ap-stage-row:first-of-type{border-top:0}
.ap-stage-num{width:18px;flex:none;color:var(--dsw-alias-label-tertiary);font-size:13px;padding-top:2px}
.ap-stage-body{flex:1;min-width:0}
.ap-stage-body strong{display:block;font-size:13px;font-weight:600}
.ap-stage-hint{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.45}
.ap-stage-acts{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}
.ap-files-list button.ap-file-link{display:block;width:100%;border:0;background:transparent;text-align:left;padding:8px 0;font-size:13px;color:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ap-files-list button.ap-file-link:hover{color:var(--ap-accent)}
.ap-file-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ap-file-row .ap-file-link{width:auto;flex:1;min-width:0}
.ap-task-open{border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit}
.ap-task-open:hover{color:var(--ap-accent)}
.ap-tree-pick{max-height:220px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px;margin:8px 0}
.ap-tree-pick .ap-tree-btn.on{background:color-mix(in srgb, var(--ap-accent) 14%, transparent);color:var(--ap-accent)}
.ap-close{position:absolute;top:14px;right:14px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:4px;border-radius:6px}
.ap-close:hover{color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)}
.ap-modal{position:relative}
.ap-modal.wide h1{padding-right:32px}

[data-phase="hero"] svg[viewBox="0 0 182 24"],
[data-phase="hero"] svg[viewBox="0 0 23.16 17.04"],
button[class*="toggle"] > svg[viewBox="0 0 23.16 17.04"]{display:none!important}
[data-phase="hero"] button:has(> svg[viewBox="0 0 182 24"])::after{content:"Agent Pi DSH";font-size:15px;font-weight:650;letter-spacing:-0.02em}
button[class*="toggle"]:has(> svg[viewBox="0 0 23.16 17.04"])::before{content:"";width:22px;height:22px;background:url("/api/agent-pi/brand/symbol.png?v=8") center/contain no-repeat}
[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"]),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]){
  display:flex!important;justify-content:center!important;align-items:center!important;
  grid-template-columns:none!important;width:100%!important;min-height:188px;
  margin:0 0 8px;padding:0;position:relative;
  background:url("/api/agent-pi/brand/logo.png?v=8") center / contain no-repeat !important;
}
[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"]) > :not(.ap-hero-logo),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]) > :not(.ap-hero-logo){display:none!important}
[data-phase="hero"] div:has(> img.ap-hero-logo),
[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"]):has(> img.ap-hero-logo){background:none!important}
.ap-hero-logo{display:block;width:min(360px,72vw);height:auto;max-height:200px;object-fit:contain;background:transparent}
[data-plugin-entry]{color:#111827!important}
[data-plugin-entry] button{color:#111827!important;-webkit-text-fill-color:#111827!important}
[data-plugin-entry] strong{
  color:#111827!important;-webkit-text-fill-color:#111827!important;
  font-size:14px!important;line-height:20px!important;font-weight:600!important;
  display:block!important;flex:1 1 auto!important;min-width:48px!important;
  opacity:1!important;visibility:visible!important;overflow:hidden!important;
  text-overflow:ellipsis!important;white-space:nowrap!important;z-index:2!important
}
[data-plugin-entry] strong:empty::before{content:attr(title);color:#111827;-webkit-text-fill-color:#111827}
[data-plugin-entry] [data-enabled]{opacity:1!important;visibility:visible!important}
[data-cordis-plugin-id]{color:#111827!important}
`
    if (typeof document !== 'undefined') {
      const existing = document.querySelector('style[data-plugin-css="dsh-tender-web"]')
      if (existing) existing.remove()
      const tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-tender-web'
      tag.textContent = css
      document.head.appendChild(tag)
    }

    const ICONS = {
      settings: [
        ['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' }],
        ['circle', { cx: 12, cy: 12, r: 3 }],
      ],
      clipboardCheck: [
        ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
        ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
        ['path', { d: 'm9 14 2 2 4-4' }],
      ],
      clipboardList: [
        ['rect', { width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 }],
        ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
        ['path', { d: 'M12 11h4' }],
        ['path', { d: 'M12 16h4' }],
        ['path', { d: 'M8 11h.01' }],
        ['path', { d: 'M8 16h.01' }],
      ],
      book: [
        ['path', { d: 'M12 7v14' }],
        ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }],
      ],
      landmark: [
        ['line', { x1: 3, x2: 21, y1: 22, y2: 22 }],
        ['line', { x1: 6, x2: 6, y1: 18, y2: 11 }],
        ['line', { x1: 10, x2: 10, y1: 18, y2: 11 }],
        ['line', { x1: 14, x2: 14, y1: 18, y2: 11 }],
        ['line', { x1: 18, x2: 18, y1: 18, y2: 11 }],
        ['polygon', { points: '12 2 20 7 4 7' }],
      ],
      plus: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'M12 5v14' }],
      ],
      refresh: [
        ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
        ['path', { d: 'M21 3v5h-5' }],
        ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
        ['path', { d: 'M8 16H3v5' }],
      ],
      folder: [
        ['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' }],
      ],
      message: [
        ['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }],
      ],
      layout: [
        ['rect', { width: 7, height: 18, x: 3, y: 3, rx: 1 }],
        ['rect', { width: 7, height: 8, x: 14, y: 3, rx: 1 }],
        ['rect', { width: 7, height: 8, x: 14, y: 13, rx: 1 }],
      ],
      list: [
        ['path', { d: 'M8 6h13' }],
        ['path', { d: 'M8 12h13' }],
        ['path', { d: 'M8 18h13' }],
        ['path', { d: 'M3 6h.01' }],
        ['path', { d: 'M3 12h.01' }],
        ['path', { d: 'M3 18h.01' }],
      ],
      unlock: [
        ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
      ],
      arrow: [
        ['path', { d: 'M5 12h14' }],
        ['path', { d: 'm12 5 7 7-7 7' }],
      ],
      filePlus: [
        ['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }],
        ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
        ['path', { d: 'M9 15h6' }],
        ['path', { d: 'M12 18v-6' }],
      ],
      play: [
        ['circle', { cx: 12, cy: 12, r: 10 }],
        ['polygon', { points: '10 8 16 12 10 16' }],
      ],
      search: [
        ['circle', { cx: 11, cy: 11, r: 8 }],
        ['path', { d: 'm21 21-4.3-4.3' }],
      ],
      lock: [
        ['rect', { width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2 }],
        ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
      ],
      square: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ],
      plusSquare: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
        ['path', { d: 'M8 12h8' }],
        ['path', { d: 'M12 8v8' }],
      ],
      sparkles: [
        ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
        ['path', { d: 'M20 2v4' }],
        ['path', { d: 'M22 4h-4' }],
        ['circle', { cx: 4, cy: 20, r: 2 }],
      ],
      paperclip: [
        ['path', { d: 'M13.234 20.252 21 12.3' }],
        ['path', { d: 'm16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486' }],
      ],
      file: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M8 9h8M8 13h6', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileText: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M7 8h10M7 12h10M7 16h7', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileMd: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M7.5 16V8l4.5 6 4.5-6v8', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileSheet: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['rect', { x: 6.5, y: 6.5, width: 11, height: 3.4, rx: 0.4, fill: '#fff', stroke: 'none' }],
        ['path', { d: 'M7 13h10M7 16.5h10M10.5 10v7M14.5 10v7', stroke: '#fff', fill: 'none', strokeWidth: 1.6 }],
      ],
      fileWord: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'm7.4 8 2.3 9 2.3-5.6 2.3 5.6 2.3-9', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      filePpt: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['polygon', { points: '9,8 17,12 9,16', fill: '#fff', stroke: 'none' }],
      ],
      filePdf: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M8 17V8h4.4a2.7 2.7 0 0 1 0 5.4H8', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileHtml: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'm9 8-3.2 4L9 16M15 8l3.2 4L15 16', stroke: '#fff', fill: 'none', strokeWidth: 1.8 }],
      ],
      fileJson: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['path', { d: 'M10 7c-2 0-2 2-2 3s0 2-1.6 2C8 12 8 13 8 14s0 3 2 3M14 7c2 0 2 2 2 3s0 2 1.6 2C16 12 16 13 16 14s0 3-2 3', stroke: '#fff', fill: 'none', strokeWidth: 1.7 }],
      ],
      chevron: [
        ['path', { d: 'm9 18 6-6-6-6' }],
      ],
      panelRight: [
        ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
        ['path', { d: 'M15 3v18' }],
      ],
      x: [
        ['path', { d: 'M18 6 6 18' }],
        ['path', { d: 'm6 6 12 12' }],
      ],
      pencil: [
        ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
        ['path', { d: 'm15 5 4 4' }],
      ],
      eye: [
        ['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }],
        ['circle', { cx: 12, cy: 12, r: 3 }],
      ],
      image: [
        ['rect', { x: 3, y: 2, width: 18, height: 20, rx: 3, fill: 'currentColor', stroke: 'none' }],
        ['circle', { cx: 9, cy: 9, r: 1.7, fill: '#fff', stroke: 'none' }],
        ['path', { d: 'm6.5 17 3.4-3.6 2.6 2.4 2.4-2.2 2.6 3.4', stroke: '#fff', fill: 'none', strokeWidth: 1.6 }],
      ],
      copy: [
        ['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2 }],
        ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
      ],
      trash: [
        ['path', { d: 'M3 6h18' }],
        ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
        ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
      ],
      archive: [
        ['rect', { width: 20, height: 5, x: 2, y: 3, rx: 1 }],
        ['path', { d: 'M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8' }],
        ['path', { d: 'M10 12h4' }],
      ],
      save: [
        ['path', { d: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' }],
        ['path', { d: 'M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7' }],
        ['path', { d: 'M7 3v4a1 1 0 0 0 1 1h7' }],
      ],
      download: [
        ['path', { d: 'M12 17V3' }],
        ['path', { d: 'm6 11 6 6 6-6' }],
        ['path', { d: 'M19 21H5' }],
      ],
      export: [
        ['path', { d: 'M7 7h10v10' }],
        ['path', { d: 'M7 17 17 7' }],
      ],
    }

    function Icon(name, size, className) {
      const nodes = ICONS[name] || []
      return h('svg', {
        className: ['ap-icon', className].filter(Boolean).join(' '),
        width: size || 16,
        height: size || 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      }, nodes.map((node, i) => h(node[0], Object.assign({ key: i }, node[1]))))
    }

    const WORKBENCH_LABEL = '专业化工作台'
    const AP_I18N = {
      zh: {
        'workbench.title': '专业化工作台',
        'files.openExplorer': '在资源管理器中打开',
        'files.opening': '正在打开资源管理器…',
        'files.openFailed': '无法打开文件夹',
        'files.noCwd': '还没有工作区路径',
        'files.uploadFiles': '上传文件到对话',
        'files.uploadFolder': '上传文件夹',
        'files.title': '资源文件',
        'files.official': '工作成果',
        'files.officialName': 'Official Outputs',
        'files.officialEmpty': '还没有正式产出。会话里改过的报告、地图等会自动落到这里。',
        'files.officialHint': '这里展示会话与工作台的正式产出，不依赖模型自己选目录。',
        'files.workspace': '工作区',
        'files.uploads': '上传资料',
        'files.pickWorkspace': '先选择工作区',
        'files.collapse': '收起资源文件',
        'files.expand': '展开资源文件',
        'files.refresh': '刷新',
        'files.addFolder': '加入文件夹地址（不上传文件）',
        'files.resize': '拖动调整宽度',
        'nav.kb': '知识库',
        'nav.kbTitle': '本地知识库：规范、合同、范文与用户模板，按文档结构精确索引',
        'wb.back': '返回对话',
        'wb.noCwd': '未选择工作区 · 聊天仍是默认路径，工作台只加速阶段准备',
        'wb.kb': '知识库',
        'wb.kbTitle': '跨项目共享的规范、合同、范文与用户模板；勾选用户模板后本轮复刻其格式与深度',
        'wb.modules': '模块管理',
        'wb.modulesTitle': '看已上线模块；新模块走创造对话，不要先导入 JSON',
        'wb.refresh': '刷新',
        'wb.adopt': '升级当前工作',
        'wb.adoptTitle': '把当前会话工作区登记为所选模块的专业项目，不另建目录',
        'wb.create': '新建项目',
        'wb.upgrade': '将当前工作升级',
        'wb.landing': '这就是这个流程的步骤。先开一个项目，或把当前工作升级上来，监控条才会出现并跟着走。',
        'wb.projects': '项目',
        'wb.pickProject': '选择一个项目',
        'wb.moduleErrors': '有 {n} 个模块定义文件加载失败（见模块管理）。',
        'module.tender': '投标全流程',
        'module.delivery': '实施控制',
        'module.investment': '投资尽调',
        'create.close': '关闭',
        'create.titleAdopt': '将当前工作升级为专业项目',
        'create.titleNew': '新建{name}项目',
        'create.hintAdopt': '沿用当前会话工作区和已有正式成果，只补一张专业盘面。可选投标、实施、尽调或任意自建模块。',
        'create.hintNew': '使用现有对话执行内核，建立独立项目目录、明确资料边界并按专业流程推进。登记资料时可附企业工效表，有则优先于网络调研。',
        'create.whichModule': '升级到哪个专业模块？不会改写已有正式成果。',
        'create.step.module': '选择模块',
        'create.step.info': '项目信息',
        'create.step.folder': '项目文件夹',
        'create.step.files': '依据资料',
        'create.step.confirmAdopt': '确认升级',
        'create.step.confirmNew': '流程确认',
        'session.archive': '归档对话',
        'session.archiveTitle': '归档当前对话。完整记录在左侧「归档」里查看，归档后也可删除。',
        'session.archiveFailed': '归档失败',
        'session.delete': '删除对话',
        'session.deleteConfirm': '从侧栏和归档中移除？完整记录不再列出（本机日志仍保留）。',
        'session.deleteFailed': '删除失败',
        'archive.title': '归档',
        'archive.lead': '完成的工作区先归档，不占进行中列表。点开仍是完整对话记录；归档的工作区和对话都可以删除。',
        'archive.empty': '还没有归档。侧栏工作区菜单选「归档工作区」，或对单条会话选「归档会话」。',
        'archive.open': '打开完整记录',
        'archive.delete': '删除',
        'archive.ungrouped': '未分组',
        'archive.workspace': '归档工作区',
        'archive.workspaceConfirm': '归档后，这个工作区和里面的对话会从进行中列表移到「归档」。完整记录仍可打开，归档后也可以删除。',
        'archive.workspaceFailed': '工作区归档失败',
        'archive.workspaceLive': '工作区仍在进行中',
        'archive.workspaceEmpty': '这个工作区没有对话。',
        'archive.deleteWorkspace': '删除工作区',
        'archive.deleteWorkspaceConfirm': '删除这个工作区登记？目录和已归档对话还在。',
        'kb.title': '本地知识库',
        'kb.refresh': '刷新',
        'kb.reindexAll': '全部重建',
        'kb.reindexing': '重建中…',
        'kb.reindexTitle': '按原路径（若仍存在）重新切块并更新索引',
        'kb.import': '导入',
        'kb.tokenOk': 'Token 有效',
        'kb.tokenBad': 'Token 无效',
        'kb.mineruSaved': 'MinerU 已保存',
        'kb.mineruMissing': 'MinerU 未配置',
        'kb.mineruNeedRestart': 'MinerU 需重启宿主',
        'kb.path1Title': '路径一 · 本页导入',
        'kb.path1Body': '用「选择文件」或多选拖入。文件先落入下方原始文档区，不会自动解析。有文本层的 PDF 本机抽文本（快）；扫描件和复杂版式再点「解析入库」走 MinerU。MinerU 的 HTML 表会收成 Markdown 表；已入库的点「全部重建」即可。索引按文档自己的章/节/条/Clause 切。',
        'kb.path2Title': '路径二 · 对话导入知识库',
        'kb.path2Warn': '只把 PDF 丢进主对话、不说话，不会进知识库。贴上文件后发送下面这句：',
        'kb.path2After': '也能说：知识库、入库、知识包、准确整理、完整内容、全文转录。模型写好「…-知识包」文件夹后，右侧对该文件夹或 pack.json 右键「一键导入知识包」，立刻可检索。普通文件仍可右键「一键导入知识库」，和本页是同一套解析。',
        'kb.tplTitle': '用户模板 · 复刻版式',
        'kb.tplBody': '把你已经编好的较好文档入库为「用户模板」，再勾选「本次任务选用」。本轮业务稿复刻它的格式、大纲、章节顺序和内容深度；项目事实仍走规范、合同和本项目资料，不从模板抄数字、地名或合同号。文件名以「模板」结尾时，右侧一键入库会自动归入此类。',
        'kb.packTitle': '传递包 · 仅本应用',
        'kb.packBody': '每条知识库文件、用户模板、本机技能后面都可以「导出」成 .apkb。这是本应用密封的传递包，用 zip / Office / 记事本打不开。对方在本页点「导入传递包」，条目会回到原来的分类和子目录（例如规范 → COTO 2020）。',
        'kb.pickTitle': '选择文件后立刻出现在下方，不会自动解析',
        'kb.picking': '正在落入存储区…',
        'kb.pickFiles': '选择文件',
        'kb.importPackTitle': '导入 Agent Pi 传递包（.apkb），其他工具无法解析',
        'kb.importing': '导入中…',
        'kb.importPack': '导入传递包',
        'kb.parseTitle': '对已落入原始文档区的文件做解析并写入知识库',
        'kb.parsing': '解析中…',
        'kb.parseIn': '解析入库',
        'kb.category': '分类',
        'kb.customCategory': '自定义分类…',
        'kb.customCategoryPh': '自定义分类名',
        'kb.customNamePh': '自定义名称（可选，默认用文件名）',
        'kb.thisPick': '本次选择：{name}',
        'kb.multiHint': '支持多选。选完先落入原始文档区，不会自动解析。',
        'kb.parseFailed': '解析失败',
        'kb.stagedWait': '已落入原始文档区，等待解析入库',
        'kb.progress': '进度 {n}%',
        'kb.parsingChip': '解析中',
        'kb.failedChip': '失败',
        'kb.pendingChip': '待解析',
        'kb.retry': '重试',
        'kb.remove': '移除',
        'kb.landing': '已选中，正在落入原始文档区…',
        'kb.landingProgress': '正在落入原始文档区…',
        'kb.mineruSummary': 'MinerU Token（大文件 / 精度抽取）',
        'kb.mineruCurrent': '当前：{hint}。不回显全文。',
        'kb.mineruSavedHint': '已保存',
        'kb.mineruUnconfigured': '未配置。小于 10MB 可走免登录轻量接口；更大文件需要 Token。申请：https://mineru.net/apiManage/token',
        'kb.mineruOldHost': '当前窗口还是旧宿主，粘贴后点保存也不会落盘。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。',
        'kb.mineruTokenPh': '粘贴 MinerU Token 后点保存',
        'kb.saving': '保存中…',
        'kb.saveToken': '保存 Token',
        'kb.probeTitle': '向 MinerU 探测鉴权，不提交解析任务',
        'kb.probing': '验证中…',
        'kb.probe': '验证是否有效',
        'kb.clear': '清除',
        'kb.mineruOcr': '有文本层的 PDF 会关闭 OCR；扫描件才开 OCR。超过官方页数或体积上限时自动拆段、串行解析、合并成一条。',
        'kb.pastePath': '或粘贴已有文件路径',
        'kb.pastePathPh': '原文件路径、知识包文件夹，或 MinerU 产物文件夹',
        'kb.staging': '落入中…',
        'kb.stage': '落入存储区',
        'kb.searchPreview': '检索预览',
        'kb.searchPh': '关键词 / 条款号 / 表头（与模型 kb_search 相同的 MiniSearch BM25）',
        'kb.search': '检索',
        'kb.noHits': '无命中。',
        'kb.score': '分值 {n}',
        'kb.entries': '条目（{n} 个）',
        'kb.entriesLead': '每行是一份原文档。点名称用右侧同一套文件预览打开解析稿 Markdown（可改，保存后重建切片）。分类下可建子目录归类（例如规范 → COTO 2020）；入库时能认出 COTO / COLTO / FIDIC 章节名会自动归入。每行「归入」可改挂到哪个节点。MinerU 表若仍露出 HTML 标签，点「全部重建」收成 Markdown 表。预览若是整页一段、词中空格，那是抽文本墙：回主对话贴上 PDF，发送「{say}」，或点「MinerU 重解析」。打勾「本次任务选用」即时生效。已选用 {n} 条。',
        'kb.empty': '知识库为空。预置方法标准与范文会在首次使用时自动入库；也可以在上方导入规范、范文，或把你编好的文档导入为用户模板。',
        'kb.taskSelect': '本次任务选用',
        'kb.openPreview': '打开解析稿预览',
        'kb.ready': '已入知识库',
        'kb.fidelityTitle': '索引只存条款地址；阅读时从解析稿按偏移切片',
        'kb.inTask': '本次任务',
        'kb.seeded': '预置',
        'kb.home': '归入',
        'kb.homeTitle': '归入子目录',
        'kb.unfiled': '未归类',
        'kb.newFolder': '新建子目录…',
        'kb.reparseMineru': 'MinerU 重解析',
        'kb.reparseTitle': '跳过本机文本层，用 MinerU 重做排版稿并重建切片',
        'kb.export': '导出',
        'kb.exportTitle': '导出为本应用传递包（.apkb），其他工具无法打开',
        'kb.delete': '删除',
        'kb.count': '{n} 个',
        'kb.addFolder': '新增子目录',
        'kb.addFolderTitle': '在此分类下新建子目录，用来归类入库文件',
        'kb.folderOk': '新建',
        'kb.folderCancel': '取消',
        'kb.confirmOk': '确定',
        'kb.exportFolder': '导出此目录',
        'kb.exportFolderTitle': '把此子目录下已入库文件打成一个传递包',
        'kb.deleteFolder': '删除子目录',
        'kb.deleteFolderTitle': '删除子目录，文件留在本分类下',
        'kb.emptyFolder': '空目录。用文件行的「归入」挂进来。',
        'kb.skills': '本机技能（{n} 个）',
        'kb.skillsLead': '这里是你装在本机技能目录里的方法（$DSH_HOME/skills），不是出厂捆绑技能。导出同样打成 .apkb，对方导入后热加载，不用重装应用。',
        'kb.skillsEmpty': '还没有本机技能。把方法沉淀成技能后会出现在这里。',
        'kb.exportSkillTitle': '导出为本应用传递包',
        'kb.oldHostMineru': '当前窗口还是旧宿主：MinerU Token 保存不会落盘。请关掉 Agent Pi DSH 再打开（刷新不够）。',
        'kb.ingestedOk': '知识库入库成功：{names}',
        'kb.transferEntries': '{n} 个知识条目',
        'kb.transferSkills': '{n} 个技能',
        'kb.transferEmpty': '空',
        'kb.transferImported': '已导入传递包：{parts}{detail}',
        'kb.transferSaved': '传递包已写入本机。只可用 Agent Pi DSH 打开 .apkb。',
        'kb.stagedNotice': '已落入原始文档区：{name}。点「解析入库」开始处理。',
        'kb.skipUnchanged': '内容未变化，已选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.replacedTask': '已重建并选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.ingestedTask': '已入库并选用到本次任务：{name}。下一轮发送立即生效，无需重启。',
        'kb.needFile': '请先选择要入库的文件',
        'kb.badTypes': '请选择 PDF、Word、Excel、PPT、图片、.md / .txt / .json，或本应用传递包 .apkb。',
        'kb.skippedTypes': '已跳过不支持的格式：{names}',
        'kb.needToken': '请填写 MinerU Token',
        'kb.saveNoDisk': '保存没有写到本机。刷新不够，当前窗口还是旧宿主。请关掉 Agent Pi DSH 再打开，然后重新粘贴并点保存。',
        'kb.oldHostSave': '当前窗口还是旧宿主，Token 接口还不存在。请关掉 Agent Pi DSH 再打开后再保存（刷新不够）。',
        'kb.needTokenOrSave': '请先粘贴 Token，或先保存后再验证',
        'kb.probeMissing': '验证接口还不存在。请关掉 Agent Pi DSH 再打开后再试（刷新不够）。',
        'kb.cleared': '已清除本机 MinerU Token',
        'kb.clearFailed': '清除失败。当前窗口还是旧宿主，请关掉 Agent Pi DSH 再打开。',
        'kb.parseRetry': '解析失败，请重新选择该文件入库',
        'kb.deleteEntryConfirm': '删除知识库条目「{name}」？索引与托管副本会一起删除{seeded}。',
        'kb.deleteSeeded': '；预置条目删除后不会自动恢复',
        'kb.deleted': '已删除 {slug}',
        'kb.reindexed': '已重建 {n} 个条目{missing}',
        'kb.missingSrc': '；缺源：{list}',
        'kb.folderPrompt': '子目录名称，例如 COTO 2020',
        'kb.folderCreated': '已新增子目录「{name}」',
        'kb.deleteFolderConfirm': '删除子目录「{name}」？文件仍留在「{category}」下，不会删文件。',
        'kb.folderDeleted': '已删除子目录「{name}」',
        'kb.exported': '已导出传递包 {name}。只可用本应用导入，其他工具打不开。',
        'kb.newFolderPrompt': '新建子目录，例如 COTO 2020',
        'kb.parseStarted': '已开始解析 {n} 个文件。MinerU 可能较久，请看下方进度。',
        'kb.parseNone': '没有新的解析任务。',
        'kb.cat.规范': '规范',
        'kb.cat.合同': '合同',
        'kb.cat.范文': '范文',
        'kb.cat.方法标准': '方法标准',
        'kb.cat.用户模板': '用户模板',
        'kb.cat.用户模版': '用户模板',
        'kb.cat.自定义': '自定义',
        'kb.cat.未分类': '未分类',
        'kb.hint.用户模板': '勾选后，本轮写作复刻其格式、大纲与内容深度',
        'mm.title': '模块管理',
        'mm.lead': '本页用来看已上线的模块、开关和拷贝。新模块不要在这里填字段，到下面的创造模式进对话。',
        'mm.lead2': '内置投标不会被改写。进行中的老项目不会自动改盘面。',
        'mm.designTitle': '回到对话，用人机交互生成完整工作台模块包',
        'mm.design': '去对话里创造',
        'mm.createTitle': '模块创造模式',
        'mm.createLead': '不要先导入 JSON。点下面一条路，回到对话用人机交互。生成的是和「投标全流程」同等级的完整模块包：顶栏、阶段监控、资料登记、流程控制、配套方法和知识库。保存后本应用按同一套专业化工作台画出来。',
        'mm.createWarn': '不要切到 Agent 预设里的「创造模式」——那是改插件组装的。模块创造只走本页进对话这条路。',
        'mm.createAdvanced': '只有已经拿到本应用校验过的模块定义时，才在这里粘贴。普通使用请走上面的创造对话。',
        'mm.packNotJson': '完整模块包，不是一段 JSON',
        'mm.pickKind': '选你们属于哪一种。选完回到对话，用大白话问一两句；模型直接装上，你不用粘贴定义。',
        'mm.card.distill': '做过一单，照这个来',
        'mm.card.distillBody': '把这次对话里已经认可的成果，整理成以后同类工作的标准。范文进知识库，做法记下来。',
        'mm.card.copy': '步骤和投标全流程一样，规矩不同',
        'mm.card.copyBody': '还是登记 → 解析 → 组价 → 出稿。拷贝一份，挂上你们的评分办法、组价表或投标函。阶段条还是四步。',
        'mm.card.custom': '步骤就不一样',
        'mm.card.customBody': '例如先资格再技术再商务、没有组价。用中文说清几步，新标签和监控条按这几步画。',
        'mm.advanced': '高级 · 粘贴模块定义（开发者）',
        'mm.installing': '安装中…',
        'mm.install': '校验并安装',
        'mm.copyTitle': '拷贝为自建模块',
        'mm.copyLead': '从「{name}」复制阶段、技能和总报告门槛。内置投标不会被改写；副本保存后立刻出现在顶栏，并可继续改阶段。',
        'mm.labelZh': '中文名',
        'mm.moduleId': '模块 id（小写英文，不能用 tender / delivery / investment）',
        'mm.cancel': '取消',
        'mm.copying': '拷贝中…',
        'mm.copyOpen': '拷贝并打开编辑器',
        'mm.copyLive': '拷贝并上线',
        'mm.editTitle': '编辑模块 · {name}',
        'mm.editLead': '可增删改阶段、调整顺序和总报告门槛。保存即覆盖这份自建定义。进行中项目不会自动迁盘面。',
        'mm.labelEn': '英文名（可选）',
        'mm.setupStage': '开工阶段',
        'mm.kbPack': '规范包',
        'mm.kbPackLead': '挂你们公司的规范、组价表、投标函范文。不改阶段结构。勾选后阶段稿只点名这些知识库条目，不再带出厂范文的磁盘路径。',
        'mm.kbOwnOnly': '只用勾选的知识库（不带出厂范文）',
        'mm.kbEmpty': '知识库还是空的。先到「知识库」页导入规范或范文，再回到这里勾选。',
        'mm.area.analysis': '解析 / 资料阶段',
        'mm.area.pricing': '组价阶段',
        'mm.area.planning': '策划出稿阶段',
        'mm.stageN': '阶段 {n}',
        'mm.moveUp': '上移',
        'mm.moveDown': '下移',
        'mm.deleteStage': '删除阶段',
        'mm.stageId': '阶段 id（小写英文）',
        'mm.stageZh': '阶段中文名',
        'mm.stageHint': '一句话提示',
        'mm.stagePrompt': '阶段要求（写给模型看）',
        'mm.skillSlugs': '技能 slug（逗号分隔）',
        'mm.reviewSlugs': '评审技能 slug（逗号分隔，可空）',
        'mm.binding': '知识库绑定',
        'mm.bindNone': '不绑定',
        'mm.bindAnalysis': '解析 analysis',
        'mm.bindPricing': '组价 pricing',
        'mm.bindPlanning': '策划 planning',
        'mm.listsSources': '按册/同名打包任务（pdf+docx 算一份）',
        'mm.summaryFile': '总报告文件名（空=不设门槛）',
        'mm.summaryOutline': '总报告大纲（一行一条）',
        'mm.addStage': '新增阶段',
        'mm.saving': '保存中…',
        'mm.saveLive': '保存并上线',
        'mm.list': '模块（{n}）',
        'mm.builtin': '内置',
        'mm.custom': '自建',
        'mm.stageCount': '{n} 个阶段',
        'mm.collapse': '收起阶段',
        'mm.expand': '查看阶段',
        'mm.copyThenEdit': '拷贝后编辑',
        'mm.editStages': '编辑阶段',
        'mm.copyAsCustom': '拷贝为自建',
        'mm.defFile': '定义文件',
        'mm.defFileTitle': '在文件管理器中查看定义文件',
        'mm.delete': '删除',
        'mm.enable': '启用',
        'mm.disable': '停用',
        'mm.noStages': '此模块没有阶段定义',
        'mm.loadFailed': '加载失败的定义文件',
        'mm.enabled': '已启用 {name}',
        'mm.disabled': '已停用 {name}',
        'mm.deleteConfirm': '删除自建模块「{name}」？该模块下已有项目会失去流程定义（数据保留）。',
        'mm.deleted': '已删除 {id}',
        'mm.jsonFail': 'JSON 解析失败：{err}',
        'mm.installed': '已安装模块 {id}',
        'mm.copySuffix': '（副本）',
        'mm.copied': '已拷贝为自建模块 {id}，顶栏现已可见',
        'mm.builtinLocked': '内置模块不能直接改。先拷贝一份自建模块，再改副本的阶段。进行中项目不会自动迁过去。',
        'mm.saveConfirm': '保存后立即生效。改阶段 id 不会自动迁移进行中项目的盘面。',
        'mm.saved': '已保存模块 {id}',
        'mm.markLists': '按册/同名打包任务',
        'mm.markSummary': '总报告：{name}',
        'mm.markSkills': '技能 {list}',
        'mm.markReview': '评审 {list}',
        'lang.zh': '中文',
        'lang.en': 'English',
        'lang.title': '语言',
      },
      en: {
        'workbench.title': 'Workbench',
        'files.openExplorer': 'Open in File Explorer',
        'files.opening': 'Opening File Explorer…',
        'files.openFailed': 'Could not open folder',
        'files.noCwd': 'No workspace path yet',
        'files.uploadFiles': 'Upload files',
        'files.uploadFolder': 'Upload folder',
        'files.title': 'Files',
        'files.official': 'Work results',
        'files.officialName': 'Official Outputs',
        'files.officialEmpty': 'No official outputs yet. Edited reports and maps from this session are copied here automatically.',
        'files.officialHint': 'Official outputs from the session and workbench appear here. The model does not pick this folder.',
        'files.workspace': 'Workspace',
        'files.uploads': 'Uploads',
        'files.pickWorkspace': 'Choose a workspace first',
        'files.collapse': 'Collapse files',
        'files.expand': 'Expand files',
        'files.refresh': 'Refresh',
        'files.addFolder': 'Add a folder path (do not upload the files)',
        'files.resize': 'Drag to resize',
        'nav.kb': 'Knowledge base',
        'nav.kbTitle': 'Local knowledge base: specs, contracts, exemplars, and user templates, indexed by document structure',
        'wb.back': 'Back to chat',
        'wb.noCwd': 'No workspace selected. Chat still uses the default path; the workbench only speeds up stage prep.',
        'wb.kb': 'Knowledge base',
        'wb.kbTitle': 'Shared specs, contracts, exemplars, and user templates. Checked user templates set this round’s format and depth.',
        'wb.modules': 'Modules',
        'wb.modulesTitle': 'Review live modules. Create new ones in chat; do not start by importing JSON.',
        'wb.refresh': 'Refresh',
        'wb.adopt': 'Upgrade current work',
        'wb.adoptTitle': 'Register this session workspace as a project in the selected module. No new folder is created.',
        'wb.create': 'New project',
        'wb.upgrade': 'Upgrade current work',
        'wb.landing': 'These are the steps for this workflow. Start a project or upgrade the current work so the monitor bar appears and stays in sync.',
        'wb.projects': 'Projects',
        'wb.pickProject': 'Select a project',
        'wb.moduleErrors': '{n} module definition file(s) failed to load. See Modules.',
        'module.tender': 'Tender process',
        'module.delivery': 'Delivery control',
        'module.investment': 'Investment review',
        'create.close': 'Close',
        'create.titleAdopt': 'Upgrade current work to a professional project',
        'create.titleNew': 'New {name} project',
        'create.hintAdopt': 'Keep this session workspace and existing official outputs. Add a professional board only. Choose tender, delivery, investment review, or any custom module.',
        'create.hintNew': 'Use the current chat runtime. Create a separate project folder, set the source boundary, and follow the professional workflow. You may attach an enterprise productivity file; it outranks web research.',
        'create.whichModule': 'Which module should this work join? Existing official outputs stay as they are.',
        'create.step.module': 'Choose module',
        'create.step.info': 'Project info',
        'create.step.folder': 'Project folder',
        'create.step.files': 'Source files',
        'create.step.confirmAdopt': 'Confirm upgrade',
        'create.step.confirmNew': 'Confirm workflow',
        'session.archive': 'Archive conversation',
        'session.archiveTitle': 'Archive this conversation. Open the full record from Archive in the sidebar. You can still delete it after archiving.',
        'session.archiveFailed': 'Could not archive',
        'session.delete': 'Delete conversation',
        'session.deleteConfirm': 'Remove it from the sidebar and Archive? The log stays on disk but will no longer be listed.',
        'session.deleteFailed': 'Could not delete',
        'archive.title': 'Archive',
        'archive.lead': 'Archive finished workspaces so they leave the live list. Open a row to read the full conversation. You can still delete archived workspaces and chats.',
        'archive.empty': 'Nothing archived yet. Choose Archive workspace in the sidebar menu, or Archive session on a single chat.',
        'archive.open': 'Open full record',
        'archive.delete': 'Delete',
        'archive.ungrouped': 'Ungrouped',
        'archive.workspace': 'Archive workspace',
        'archive.workspaceConfirm': 'Archive this workspace? It and its conversations will move from the live list to Archive. You can still open the full records or delete them later.',
        'archive.workspaceFailed': 'Could not archive the workspace',
        'archive.workspaceLive': 'Workspace is still active',
        'archive.workspaceEmpty': 'This workspace has no conversations.',
        'archive.deleteWorkspace': 'Delete workspace',
        'archive.deleteWorkspaceConfirm': 'Remove this workspace from the list? The folder and archived conversations stay on disk.',
        'kb.title': 'Local knowledge base',
        'kb.refresh': 'Refresh',
        'kb.reindexAll': 'Rebuild all',
        'kb.reindexing': 'Rebuilding…',
        'kb.reindexTitle': 'Recut chunks from the original path (if it still exists) and refresh the index',
        'kb.import': 'Import',
        'kb.tokenOk': 'Token valid',
        'kb.tokenBad': 'Token invalid',
        'kb.mineruSaved': 'MinerU saved',
        'kb.mineruMissing': 'MinerU not configured',
        'kb.mineruNeedRestart': 'Restart the host to use MinerU',
        'kb.path1Title': 'Path 1 · Import on this page',
        'kb.path1Body': 'Use Choose files or drop several files here. They land in the staging area below and are not parsed yet. PDFs with a text layer are extracted locally (fast). Scans and complex layouts wait for Parse into library, which uses MinerU. MinerU HTML tables become Markdown tables; already imported entries only need Rebuild all. The index cuts on the document’s own chapters, sections, and clauses.',
        'kb.path2Title': 'Path 2 · Import from chat',
        'kb.path2Warn': 'Dropping a PDF into the main chat without a message does not add it to the knowledge base. After attaching the file, send this line:',
        'kb.path2After': 'You can also say: 知识库, 入库, 知识包, 准确整理, 完整内容, 全文转录. After the model writes a “…-知识包” folder, right-click that folder or pack.json in the files rail and choose Import knowledge pack. It is searchable immediately. Ordinary files can still use Import to knowledge base — the same parser as this page.',
        'kb.tplTitle': 'User templates · Match the layout',
        'kb.tplBody': 'Import a document you already wrote well as a User template, then check Use in this task. This round’s draft copies its format, outline, section order, and depth. Project facts still come from specs, contracts, and this project’s files — do not copy numbers, place names, or contract numbers from the template. A file name ending in “模板” or “template” is filed here automatically from the files rail.',
        'kb.packTitle': 'Transfer pack · This app only',
        'kb.packBody': 'Every knowledge file, user template, and local skill can Export to .apkb. That is a sealed pack for this app; zip, Office, and Notepad cannot open it. The other person chooses Import transfer pack on this page, and entries return to their original category and folder (for example Specs → COTO 2020).',
        'kb.pickTitle': 'Chosen files appear below immediately and are not parsed yet',
        'kb.picking': 'Saving to storage…',
        'kb.pickFiles': 'Choose files',
        'kb.importPackTitle': 'Import an Agent Pi transfer pack (.apkb). Other tools cannot read it.',
        'kb.importing': 'Importing…',
        'kb.importPack': 'Import transfer pack',
        'kb.parseTitle': 'Parse files already in the staging area and write them into the knowledge base',
        'kb.parsing': 'Parsing…',
        'kb.parseIn': 'Parse into library',
        'kb.category': 'Category',
        'kb.customCategory': 'Custom category…',
        'kb.customCategoryPh': 'Custom category name',
        'kb.customNamePh': 'Custom name (optional; defaults to the file name)',
        'kb.thisPick': 'This selection: {name}',
        'kb.multiHint': 'Multiple files are allowed. They land in the staging area first and are not parsed yet.',
        'kb.parseFailed': 'Parse failed',
        'kb.stagedWait': 'In the staging area, waiting to be parsed',
        'kb.progress': 'Progress {n}%',
        'kb.parsingChip': 'Parsing',
        'kb.failedChip': 'Failed',
        'kb.pendingChip': 'Pending',
        'kb.retry': 'Retry',
        'kb.remove': 'Remove',
        'kb.landing': 'Selected, saving to the staging area…',
        'kb.landingProgress': 'Saving to the staging area…',
        'kb.mineruSummary': 'MinerU token (large files / high-accuracy extract)',
        'kb.mineruCurrent': 'Current: {hint}. The full token is not shown again.',
        'kb.mineruSavedHint': 'Saved',
        'kb.mineruUnconfigured': 'Not configured. Files under 10MB can use the anonymous light API; larger files need a token. Apply at https://mineru.net/apiManage/token',
        'kb.mineruOldHost': 'This window is still the old host. Saving a token here will not persist. Quit Agent Pi DSH completely, open it again, then paste and save.',
        'kb.mineruTokenPh': 'Paste the MinerU token, then save',
        'kb.saving': 'Saving…',
        'kb.saveToken': 'Save token',
        'kb.probeTitle': 'Check MinerU authentication. This does not start a parse job.',
        'kb.probing': 'Checking…',
        'kb.probe': 'Check token',
        'kb.clear': 'Clear',
        'kb.mineruOcr': 'PDFs with a text layer skip OCR; scanned pages turn OCR on. Files over the official page or size limit are split, parsed in series, and merged into one entry.',
        'kb.pastePath': 'Or paste an existing file path',
        'kb.pastePathPh': 'Original file path, knowledge-pack folder, or MinerU output folder',
        'kb.staging': 'Saving…',
        'kb.stage': 'Save to storage',
        'kb.searchPreview': 'Search preview',
        'kb.searchPh': 'Keyword / clause number / table header (same MiniSearch BM25 as kb_search)',
        'kb.search': 'Search',
        'kb.noHits': 'No hits.',
        'kb.score': 'Score {n}',
        'kb.entries': 'Entries ({n})',
        'kb.entriesLead': 'Each row is one source document. Click the name to open the parsed Markdown in the same files preview on the right (you can edit it; save rebuilds the chunks). Categories can have folders (for example Specs → COTO 2020). Import can file COTO / COLTO / FIDIC chapter names automatically. Use File under on a row to change the folder. If MinerU tables still show HTML tags, choose Rebuild all to turn them into Markdown tables. If the preview is one wall of text with spaces inside words, that is a raw text extract: attach the PDF in the main chat and send “{say}”, or choose Reparse with MinerU. Checking Use in this task takes effect immediately. {n} selected.',
        'kb.empty': 'The knowledge base is empty. Preset method standards and exemplars are imported on first use. You can also import specs or exemplars above, or import a document you already wrote as a user template.',
        'kb.taskSelect': 'Use in this task',
        'kb.openPreview': 'Open the parsed markdown preview',
        'kb.ready': 'In library',
        'kb.fidelityTitle': 'The index stores clause addresses only. Reading slices the parsed manuscript by offset.',
        'kb.inTask': 'This task',
        'kb.seeded': 'Preset',
        'kb.home': 'File under',
        'kb.homeTitle': 'Move into a folder',
        'kb.unfiled': 'Unfiled',
        'kb.newFolder': 'New folder…',
        'kb.reparseMineru': 'Reparse with MinerU',
        'kb.reparseTitle': 'Skip the local text layer. Rebuild the layout manuscript and chunks with MinerU.',
        'kb.export': 'Export',
        'kb.exportTitle': 'Export as an app transfer pack (.apkb). Other tools cannot open it.',
        'kb.delete': 'Delete',
        'kb.count': '{n}',
        'kb.addFolder': 'Add folder',
        'kb.addFolderTitle': 'Create a folder in this category to group imported files',
        'kb.folderOk': 'Create',
        'kb.folderCancel': 'Cancel',
        'kb.confirmOk': 'OK',
        'kb.exportFolder': 'Export this folder',
        'kb.exportFolderTitle': 'Pack the imported files in this folder into one transfer pack',
        'kb.deleteFolder': 'Delete folder',
        'kb.deleteFolderTitle': 'Delete the folder. Files stay in this category.',
        'kb.emptyFolder': 'Empty folder. Use File under on a file row to move it here.',
        'kb.skills': 'Local skills ({n})',
        'kb.skillsLead': 'These are methods in your local skills folder ($DSH_HOME/skills), not factory-bundled skills. Export also writes .apkb. The other person can import and hot-load them without reinstalling the app.',
        'kb.skillsEmpty': 'No local skills yet. Methods saved as skills appear here.',
        'kb.exportSkillTitle': 'Export as an app transfer pack',
        'kb.oldHostMineru': 'This window is still the old host: saving a MinerU token will not persist. Quit Agent Pi DSH completely and open it again (refresh is not enough).',
        'kb.ingestedOk': 'Imported into the knowledge base: {names}',
        'kb.transferEntries': '{n} knowledge entries',
        'kb.transferSkills': '{n} skills',
        'kb.transferEmpty': 'empty',
        'kb.transferImported': 'Imported transfer pack: {parts}{detail}',
        'kb.transferSaved': 'The transfer pack is on this machine. Only Agent Pi DSH can open .apkb files.',
        'kb.stagedNotice': 'Saved to the staging area: {name}. Choose Parse into library to start.',
        'kb.skipUnchanged': 'Content unchanged. Selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.replacedTask': 'Rebuilt and selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.ingestedTask': 'Imported and selected for this task: {name}. The next send uses it immediately. No restart needed.',
        'kb.needFile': 'Choose a file to import first',
        'kb.badTypes': 'Choose a PDF, Word, Excel, PowerPoint, image, .md / .txt / .json, or an .apkb transfer pack.',
        'kb.skippedTypes': 'Skipped unsupported formats: {names}',
        'kb.needToken': 'Enter a MinerU token',
        'kb.saveNoDisk': 'The save did not reach disk. Refresh is not enough; this window is still the old host. Quit Agent Pi DSH, open it again, then paste and save.',
        'kb.oldHostSave': 'This window is still the old host, so the token API is missing. Quit Agent Pi DSH, open it again, then save (refresh is not enough).',
        'kb.needTokenOrSave': 'Paste a token first, or save it before checking',
        'kb.probeMissing': 'The check API is missing. Quit Agent Pi DSH, open it again, then retry (refresh is not enough).',
        'kb.cleared': 'Cleared the local MinerU token',
        'kb.clearFailed': 'Could not clear. This window is still the old host. Quit Agent Pi DSH and open it again.',
        'kb.parseRetry': 'Parse failed. Choose the file again to import.',
        'kb.deleteEntryConfirm': 'Delete knowledge entry “{name}”? The index and hosted copy are removed{seeded}.',
        'kb.deleteSeeded': '; a preset entry will not come back automatically',
        'kb.deleted': 'Deleted {slug}',
        'kb.reindexed': 'Rebuilt {n} entries{missing}',
        'kb.missingSrc': '; missing source: {list}',
        'kb.folderPrompt': 'Folder name, for example COTO 2020',
        'kb.folderCreated': 'Created folder “{name}”',
        'kb.deleteFolderConfirm': 'Delete folder “{name}”? Files stay under “{category}”. Files are not deleted.',
        'kb.folderDeleted': 'Deleted folder “{name}”',
        'kb.exported': 'Exported transfer pack {name}. Only this app can import it.',
        'kb.newFolderPrompt': 'New folder name, for example COTO 2020',
        'kb.parseStarted': 'Started parsing {n} file(s). MinerU can take a while; watch the progress below.',
        'kb.parseNone': 'No new parse jobs.',
        'kb.cat.规范': 'Specs',
        'kb.cat.合同': 'Contracts',
        'kb.cat.范文': 'Exemplars',
        'kb.cat.方法标准': 'Method standards',
        'kb.cat.用户模板': 'User templates',
        'kb.cat.用户模版': 'User templates',
        'kb.cat.自定义': 'Custom',
        'kb.cat.未分类': 'Uncategorized',
        'kb.hint.用户模板': 'When checked, this round copies its format, outline, and depth',
        'mm.title': 'Modules',
        'mm.lead': 'Review live modules, toggle them, and copy them. Do not fill fields here for a new module. Use Create mode below to continue in chat.',
        'mm.lead2': 'Built-in tender is not rewritten. Live projects do not migrate their boards automatically.',
        'mm.designTitle': 'Return to chat and generate a complete workbench module pack through conversation',
        'mm.design': 'Create in chat',
        'mm.createTitle': 'Module create mode',
        'mm.createLead': 'Do not start by importing JSON. Pick a path below and continue in chat. What you get is a complete module pack at the same level as Tender process: top bar, stage monitor, source registration, workflow gates, matching methods, and a knowledge base. After save, this app draws it with the same workbench.',
        'mm.createWarn': 'Do not switch to Create mode in the Agent preset — that edits plugin assembly. Module creation only goes through this page into chat.',
        'mm.createAdvanced': 'Paste here only when you already have a module definition this app has validated. Everyday use should go through the create conversation above.',
        'mm.packNotJson': 'A complete module pack, not a JSON snippet',
        'mm.pickKind': 'Pick the case that matches you. Then return to chat and ask in plain language. The model installs it; you do not paste a definition.',
        'mm.card.distill': 'We finished one job — use this as the standard',
        'mm.card.distillBody': 'Turn the accepted results from this chat into the standard for later work of the same kind. Exemplars go to the knowledge base; the method is written down.',
        'mm.card.copy': 'Same steps as Tender process, different rules',
        'mm.card.copyBody': 'Still register → analyze → price → draft. Copy one and attach your scoring rules, rate tables, or letters. The stage bar stays four steps.',
        'mm.card.custom': 'The steps are different',
        'mm.card.customBody': 'For example qualification, then technical, then commercial — no pricing. Say the steps in plain language. The new tab and monitor bar follow those steps.',
        'mm.advanced': 'Advanced · Paste a module definition (developers)',
        'mm.installing': 'Installing…',
        'mm.install': 'Validate and install',
        'mm.copyTitle': 'Copy as a custom module',
        'mm.copyLead': 'Copy stages, skills, and summary-report gates from “{name}”. Built-in tender is not rewritten. The copy appears in the top bar as soon as it is saved, and you can keep editing stages.',
        'mm.labelZh': 'Chinese name',
        'mm.moduleId': 'Module id (lowercase English; cannot be tender, delivery, or investment)',
        'mm.cancel': 'Cancel',
        'mm.copying': 'Copying…',
        'mm.copyOpen': 'Copy and open editor',
        'mm.copyLive': 'Copy and go live',
        'mm.editTitle': 'Edit module · {name}',
        'mm.editLead': 'Add, remove, or edit stages, reorder them, and set summary-report gates. Saving overwrites this custom definition. Live projects do not migrate their boards.',
        'mm.labelEn': 'English name (optional)',
        'mm.setupStage': 'Kickoff stage',
        'mm.kbPack': 'Spec pack',
        'mm.kbPackLead': 'Attach your company specs, rate tables, and letter exemplars. Stage structure stays the same. When checked, stage drafts name only these knowledge entries and no longer carry factory exemplar disk paths.',
        'mm.kbOwnOnly': 'Use only the checked knowledge entries (no factory exemplars)',
        'mm.kbEmpty': 'The knowledge base is still empty. Import specs or exemplars on the Knowledge base page, then come back and check them.',
        'mm.area.analysis': 'Analysis / source stage',
        'mm.area.pricing': 'Pricing stage',
        'mm.area.planning': 'Planning / drafting stage',
        'mm.stageN': 'Stage {n}',
        'mm.moveUp': 'Move up',
        'mm.moveDown': 'Move down',
        'mm.deleteStage': 'Delete stage',
        'mm.stageId': 'Stage id (lowercase English)',
        'mm.stageZh': 'Stage Chinese name',
        'mm.stageHint': 'One-line hint',
        'mm.stagePrompt': 'Stage requirements (for the model)',
        'mm.skillSlugs': 'Skill slugs (comma-separated)',
        'mm.reviewSlugs': 'Review skill slugs (comma-separated, optional)',
        'mm.binding': 'Knowledge binding',
        'mm.bindNone': 'None',
        'mm.bindAnalysis': 'Analysis',
        'mm.bindPricing': 'Pricing',
        'mm.bindPlanning': 'Planning',
        'mm.listsSources': 'Pack tasks by volume / same name (pdf+docx count as one)',
        'mm.summaryFile': 'Summary report file name (empty = no gate)',
        'mm.summaryOutline': 'Summary outline (one item per line)',
        'mm.addStage': 'Add stage',
        'mm.saving': 'Saving…',
        'mm.saveLive': 'Save and go live',
        'mm.list': 'Modules ({n})',
        'mm.builtin': 'Built-in',
        'mm.custom': 'Custom',
        'mm.stageCount': '{n} stages',
        'mm.collapse': 'Hide stages',
        'mm.expand': 'View stages',
        'mm.copyThenEdit': 'Copy then edit',
        'mm.editStages': 'Edit stages',
        'mm.copyAsCustom': 'Copy as custom',
        'mm.defFile': 'Definition file',
        'mm.defFileTitle': 'Reveal the definition file in File Explorer',
        'mm.delete': 'Delete',
        'mm.enable': 'Enable',
        'mm.disable': 'Disable',
        'mm.noStages': 'This module has no stages',
        'mm.loadFailed': 'Definition files that failed to load',
        'mm.enabled': 'Enabled {name}',
        'mm.disabled': 'Disabled {name}',
        'mm.deleteConfirm': 'Delete custom module “{name}”? Existing projects under it lose the workflow definition. Data is kept.',
        'mm.deleted': 'Deleted {id}',
        'mm.jsonFail': 'JSON parse failed: {err}',
        'mm.installed': 'Installed module {id}',
        'mm.copySuffix': ' (copy)',
        'mm.copied': 'Copied as custom module {id}. It is now in the top bar.',
        'mm.builtinLocked': 'Built-in modules cannot be edited directly. Copy one as a custom module, then edit the copy. Live projects do not migrate automatically.',
        'mm.saveConfirm': 'Saving takes effect immediately. Changing a stage id does not migrate live project boards.',
        'mm.saved': 'Saved module {id}',
        'mm.markLists': 'Pack tasks by volume / same name',
        'mm.markSummary': 'Summary: {name}',
        'mm.markSkills': 'Skills {list}',
        'mm.markReview': 'Review {list}',
        'lang.zh': '中文',
        'lang.en': 'English',
        'lang.title': 'Language',
      },
    }
    const langState = { lang: 'zh', listeners: new Set() }
    function localeIdOf(value) {
      const id = String(value || '').toLowerCase()
      return id === 'en' || id.startsWith('en-') ? 'en' : 'zh'
    }
    function setApLang(lang) {
      const next = localeIdOf(lang)
      if (langState.lang === next) return
      langState.lang = next
      if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', next === 'en' ? 'en' : 'zh-CN')
      langState.listeners.forEach((fn) => fn(next))
    }
    function tAp(key, vars) {
      const dict = AP_I18N[langState.lang] || AP_I18N.zh
      let text = dict[key] || AP_I18N.zh[key] || key
      if (vars && typeof vars === 'object') {
        Object.keys(vars).forEach((name) => {
          text = text.split('{' + name + '}').join(String(vars[name]))
        })
      }
      return text
    }
    function useApLang() {
      const [lang, setLang] = React.useState(langState.lang)
      React.useEffect(() => {
        langState.listeners.add(setLang)
        return () => langState.listeners.delete(setLang)
      }, [])
      return lang
    }
    // Built-in fallback only: the live module list (built-ins + user-created domains)
    // comes from the workbench snapshot / GET /api/agent-pi/modules.
    const MODULES = {
      tender: { id: 'tender', labelZh: '投标工作台', icon: 'clipboardCheck', builtin: true, disabled: false },
      delivery: { id: 'delivery', labelZh: '项目实施控制', icon: 'clipboardList', builtin: true, disabled: false },
      investment: { id: 'investment', labelZh: '资源投资研究', icon: 'landmark', builtin: true, disabled: false },
    }

    function moduleLabel(info) {
      if (!info) return ''
      if (info.id && AP_I18N.zh['module.' + info.id]) return tAp('module.' + info.id)
      if (langState.lang === 'en' && info.labelEn) return info.labelEn
      return info.labelZh || info.label || info.id || ''
    }

    function moduleIconNode(info, size) {
      const name = info && info.icon
      if (name && ICONS[name]) return Icon(name, size)
      if (name && /[^\x00-\x7F]/.test(name)) {
        return h('span', { className: 'ap-mod-emoji', style: { fontSize: (size || 15) + 'px' } }, name)
      }
      return Icon('clipboardCheck', size)
    }

    function moduleList(data) {
      const rows = data && Array.isArray(data.modules) && data.modules.length
        ? data.modules
        : Object.values(MODULES)
      return rows.filter((item) => !item.disabled)
    }

    function normPath(value) {
      return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '')
    }

    function pathMatches(sessionCwd, rootPath) {
      const a = normPath(sessionCwd)
      const b = normPath(rootPath)
      if (!a || !b) return false
      return a === b || a.startsWith(b + '/') || b.startsWith(a + '/')
    }

    function sessionHint(props) {
      return (props && (props.sessionId || (props.session && props.session.sessionId))) || ''
    }

    const codexTurnControllers = window.__apCodexTurnControllers || (window.__apCodexTurnControllers = new Map())
    const codexTurnListeners = window.__apCodexTurnListeners || (window.__apCodexTurnListeners = new Set())
    function codexTurnKey(props) {
      return sessionHint(props) || runtime.sessionId || 'active'
    }
    function notifyCodexTurn() {
      codexTurnListeners.forEach((listener) => {
        try { listener() } catch { /* stale composer */ }
      })
    }
    function createCodexTurnController(latestProps) {
      return {
        phase: 'idle',
        latestProps: latestProps || null,
        attemptToken: null,
        originalDraft: '',
        framedDraft: '',
        capturedAttachmentIds: [],
        capturedAttachments: [],
        preSubmitUserNodeWatermark: -1,
        lastInputPhase: null,
        lastInputDraftRev: null,
        sawSubmitting: false,
        unsubscribeSession: null,
        unsubscribeInput: null,
      }
    }
    function codexTurnController(props, create) {
      const key = codexTurnKey(props)
      let controller = codexTurnControllers.get(key)
      if (!controller && create) {
        controller = createCodexTurnController(props)
        codexTurnControllers.set(key, controller)
      }
      return controller || null
    }
    function trackCodexTurnProps(props) {
      const controller = codexTurnControllers.get(codexTurnKey(props))
      if (controller && controller.phase !== 'disposed') controller.latestProps = props
    }
    function codexTurnPhase(props) {
      const controller = codexTurnController(props, false)
      return controller ? controller.phase : 'idle'
    }
    function codexTurnArmed(props) {
      const phase = codexTurnPhase(props)
      return phase === 'armed' || phase === 'preparing' || phase === 'submitting'
    }
    function setCodexTurnArmed(props, armed) {
      const key = codexTurnKey(props)
      const controller = codexTurnController(props, armed)
      if (!controller) return
      controller.latestProps = props
      if (armed && controller.phase === 'idle') {
        controller.phase = 'armed'
        watchCodexTurnSession(key, controller)
      }
      else if (!armed && controller.phase === 'armed') {
        resetCodexTurnAttempt(controller)
        disposeCodexTurnSessionSubscription(controller)
        controller.phase = 'idle'
      } else return
      notifyCodexTurn()
    }
    function disposeCodexTurnInputSubscription(controller) {
      const unsubscribeInput = controller.unsubscribeInput
      controller.unsubscribeInput = null
      if (typeof unsubscribeInput === 'function') {
        try { unsubscribeInput() } catch {}
      }
    }
    function disposeCodexTurnSessionSubscription(controller) {
      const unsubscribeSession = controller.unsubscribeSession
      controller.unsubscribeSession = null
      if (typeof unsubscribeSession === 'function') {
        try { unsubscribeSession() } catch {}
      }
    }
    function resetCodexTurnAttempt(controller) {
      disposeCodexTurnInputSubscription(controller)
      controller.attemptToken = null
      controller.originalDraft = ''
      controller.framedDraft = ''
      controller.capturedAttachmentIds = []
      controller.capturedAttachments = []
      controller.preSubmitUserNodeWatermark = -1
      controller.lastInputPhase = null
      controller.lastInputDraftRev = null
      controller.sawSubmitting = false
    }
    function rearmCodexTurn(key, controller) {
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
      resetCodexTurnAttempt(controller)
      controller.phase = 'armed'
      notifyCodexTurn()
    }
    function disposeCodexTurn(key, controller) {
      if (codexTurnControllers.get(key) !== controller) return
      resetCodexTurnAttempt(controller)
      disposeCodexTurnSessionSubscription(controller)
      controller.phase = 'disposed'
      codexTurnControllers.delete(key)
      notifyCodexTurn()
    }
    function codexTurnAuthorities(sessionId) {
      const sessions = runtime.sessions
      const conversation = runtime.conversation
      if (!sessions || !conversation || !conversation.input || typeof sessions.scope !== 'function' || typeof conversation.input.for !== 'function') throw new Error('Codex public stores unavailable')
      const scope = sessions.scope(sessionId)
      if (!scope) return null
      const binding = typeof sessions.binding === 'function' ? sessions.binding(sessionId) : null
      const session = typeof sessions.sessionOf === 'function' ? sessions.sessionOf(scope) : binding && binding.session
      const input = conversation.input.for(scope)
      return { scope, session, inputStore: input && input.state }
    }
    function watchCodexTurnSession(key, controller) {
      if (typeof controller.unsubscribeSession === 'function') return true
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        return false
      }
      const session = authorities && authorities.session
      if (!session || typeof session.getSnapshot !== 'function' || typeof session.subscribe !== 'function') return false
      const onSession = () => {
        if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
        let snapshot
        try {
          snapshot = session.getSnapshot()
        } catch {
          return
        }
        if (snapshot && snapshot.removed === true) {
          disposeCodexTurn(key, controller)
          return
        }
        const token = controller.attemptToken
        if (controller.phase !== 'submitting' || !token) return
        if (!token.settlementReady) token.settlementQueued = true
        else settleCodexTurn(key, token)
      }
      let unsubscribe
      try {
        unsubscribe = session.subscribe(onSession)
      } catch {
        return false
      }
      if (typeof unsubscribe !== 'function') return false
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') {
        try { unsubscribe() } catch {}
        return false
      }
      controller.unsubscribeSession = unsubscribe
      return true
    }
    function codexUserNode(snapshot, controller) {
      const nodes = snapshot && snapshot.nodes || []
      for (const node of nodes) {
        if (!node || node.kind !== 'user' || typeof node.seq !== 'number' || node.seq <= controller.preSubmitUserNodeWatermark) continue
        const text = (node.content || []).filter((part) => part && part.type === 'text').map((part) => part.text).join('')
        if (text === controller.framedDraft) return true
      }
      return false
    }
    function codexUserNodeWatermark(snapshot) {
      let watermark = -1
      for (const node of snapshot && snapshot.nodes || []) {
        if (node && node.kind === 'user' && typeof node.seq === 'number') watermark = Math.max(watermark, node.seq)
      }
      return watermark
    }
    function codexAttachmentIds(items) {
      return (items || []).map(codexAttachmentToken)
    }
    function sameCodexAttachmentIds(left, right) {
      if (left.length !== right.length) return false
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
      return true
    }
    function preparingCodexTurn(key, token) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return null
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        rearmCodexTurn(key, controller)
        return null
      }
      if (!authorities) {
        disposeCodexTurn(key, controller)
        return null
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      if (!session || typeof session.getSnapshot !== 'function' || !inputStore || typeof inputStore.getSnapshot !== 'function') {
        rearmCodexTurn(key, controller)
        return null
      }
      let sessionSnapshot
      let inputSnapshot
      try {
        sessionSnapshot = session.getSnapshot()
        inputSnapshot = inputStore.getSnapshot()
      } catch {
        rearmCodexTurn(key, controller)
        return null
      }
      if (sessionSnapshot && sessionSnapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return null
      }
      const live = controller.latestProps
      const attachmentIds = codexAttachmentIds(codexAttachItems(key))
      if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== 'plain' || typeof inputSnapshot.draft !== 'string'
        || inputSnapshot.draft !== controller.originalDraft || !live || codexTurnKey(live) !== key
        || !sameCodexAttachmentIds(attachmentIds, controller.capturedAttachmentIds)) {
        rearmCodexTurn(key, controller)
        return null
      }
      return { controller, live, session, sessionSnapshot, inputStore, inputSnapshot }
    }
    function failCodexTurn(key, controller, inputStore) {
      if (codexTurnControllers.get(key) !== controller || controller.phase === 'disposed') return
      let ownsFramedDraft = false
      try {
        const input = inputStore && inputStore.getSnapshot()
        ownsFramedDraft = Boolean(input && input.draft === controller.framedDraft)
      } catch {}
      const originalDraft = controller.originalDraft
      const live = controller.latestProps
      rearmCodexTurn(key, controller)
      if (ownsFramedDraft) {
        try { setComposerDraft(live, originalDraft) } catch {}
      }
    }
    function clearCodexTurnAfterSubmit(key, controller) {
      if (codexTurnControllers.get(key) !== controller || controller.phase !== 'submitting') return
      const capturedIds = controller.capturedAttachmentIds.slice()
      const remainingIds = capturedIds.slice()
      const remaining = codexAttachItems(key).filter((item) => {
        const index = remainingIds.indexOf(codexAttachmentToken(item))
        if (index < 0) return true
        remainingIds.splice(index, 1)
        return false
      })
      resetCodexTurnAttempt(controller)
      disposeCodexTurnSessionSubscription(controller)
      controller.phase = 'idle'
      if (capturedIds.length) setCodexAttachItems(key, remaining)
      notifyCodexTurn()
    }
    function settleCodexTurn(key, token) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'submitting' || controller.attemptToken !== token) return
      let authorities
      try {
        authorities = codexTurnAuthorities(key)
      } catch {
        failCodexTurn(key, controller, null)
        return
      }
      if (!authorities) {
        disposeCodexTurn(key, controller)
        return
      }
      const session = authorities.session
      const inputStore = authorities.inputStore
      let snapshot
      let inputSnapshot
      try {
        snapshot = session && typeof session.getSnapshot === 'function' ? session.getSnapshot() : null
        inputSnapshot = inputStore && typeof inputStore.getSnapshot === 'function' ? inputStore.getSnapshot() : null
      } catch {
        failCodexTurn(key, controller, inputStore)
        return
      }
      if (!snapshot || !inputSnapshot) {
        failCodexTurn(key, controller, inputStore)
        return
      }
      if (snapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return
      }
      if (codexUserNode(snapshot, controller)) {
        clearCodexTurnAfterSubmit(key, controller)
        return
      }
      const previousInputPhase = controller.lastInputPhase
      const previousInputDraftRev = controller.lastInputDraftRev
      const inputPhase = inputSnapshot.phase
      const inputDraftRev = typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
      if (inputPhase === 'submitting') controller.sawSubmitting = true
      controller.lastInputPhase = inputPhase
      controller.lastInputDraftRev = inputDraftRev
      if (inputPhase === 'submitting') return
      if (controller.sawSubmitting && previousInputPhase === 'submitting' && inputPhase === 'plain'
        && inputDraftRev !== null && previousInputDraftRev !== null) {
        if (inputDraftRev === previousInputDraftRev) failCodexTurn(key, controller, inputStore)
        return
      }
      if (snapshot.promptError && snapshot.promptError.op === 'send') {
        failCodexTurn(key, controller, inputStore)
      }
    }

    const composerPropsRef = { current: null }
    const composerFace = {
      sessionId: '',
      cwd: '',
      draft: '',
      inputActions: null,
      input: null,
      session: null,
    }

    function snapshotComposer() {
      return {
        sessionId: composerFace.sessionId || runtime.sessionId || '',
        cwd: composerFace.cwd || runtime.cwd || '',
        input: composerFace.input || { draft: composerFace.draft || '' },
        inputActions: composerFace.inputActions,
        session: composerFace.session,
      }
    }

    function cwdFromWorkspaceItems(items, sessionId) {
      if (!sessionId) return ''
      const list = items || []
      for (let i = 0; i < list.length; i++) {
        const item = list[i]
        const ids = item && item.sessionIds
        if (item && item.path && ids && ids.indexOf(sessionId) >= 0) return item.path
      }
      return ''
    }

    // Render-only: may call useSessions / useWorkspaces / useInput.
    // Event handlers must use snapshotComposer() / workspaceCwd() / resolveSessionId().
    function captureComposerFace(props) {
      if (!props) return runtime.cwd || composerFace.cwd || ''
      const hinted = sessionHint(props) || runtime.sessionId
      let sessionId = hinted
      let sessionCwd = ''
      if (typeof props.useSessions === 'function') {
        sessionId = props.useSessions((s) => hinted || (s && s.current) || '') || hinted
        sessionCwd = props.useSessions((s) => {
          const id = hinted || (s && s.current) || ''
          const row = id && s && s.byId ? s.byId[id] : null
          return row && row.cwd ? row.cwd : ''
        }) || ''
      }
      let workspacePath = ''
      if (typeof props.useWorkspaces === 'function') {
        workspacePath = props.useWorkspaces((w) => cwdFromWorkspaceItems(w && w.items, sessionId)) || ''
      }
      let draft = composerFace.draft || ''
      if (props.input && typeof props.input.draft === 'string') draft = props.input.draft
      else if (typeof props.useInput === 'function') {
        try { draft = props.useInput((s) => (s && s.draft) || '') || '' } catch {}
      }
      if (sessionId) {
        runtime.sessionId = sessionId
        composerFace.sessionId = sessionId
      }
      const cwd = sessionCwd || workspacePath || runtime.cwd || ''
      if (cwd) {
        runtime.cwd = cwd
        composerFace.cwd = cwd
      }
      if (typeof draft === 'string') {
        composerFace.draft = draft
        composerFace.input = props.input && typeof props.input.draft === 'string' ? props.input : { draft: draft }
      }
      if (props.inputActions) composerFace.inputActions = props.inputActions
      if (props.session) composerFace.session = props.session
      composerPropsRef.current = snapshotComposer()
      return cwd
    }

    function rememberComposerProps(props) {
      captureComposerFace(props)
    }

    function readWorkspaceCwd(props) {
      return captureComposerFace(props)
    }

    function workspaceCwd() {
      return runtime.cwd || composerFace.cwd || ''
    }

    function activeSessionId() {
      return runtime.sessionId || composerFace.sessionId || ''
    }

    function fillComposer(props, text) {
      if (!text) return
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        props.inputActions.setDraft(text)
        return
      }
      const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea, textarea')
      if (!ta) return
      const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      if (desc && desc.set) desc.set.call(ta, text)
      else ta.value = text
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      ta.dispatchEvent(new Event('change', { bubbles: true }))
    }

    function sessionFace(props) {
      return sessionFaceById(resolveSessionId(props))
    }

    function sessionFaceById(sid) {
      if (runtime.sessions && typeof runtime.sessions.binding === 'function' && sid) {
        try {
          const binding = runtime.sessions.binding(sid)
          if (binding && binding.session && typeof binding.session.prompt === 'function') return binding.session
        } catch {}
      }
      return null
    }

    function snapshotOf(sid) {
      const face = sessionFaceById(sid)
      if (!face || typeof face.getSnapshot !== 'function') return null
      try {
        return face.getSnapshot()
      } catch {
        return null
      }
    }

    function sessionIsBusy(props) {
      return snapshotIsBusy(snapshotOf(resolveSessionId(props)))
    }

    function snapshotIsRunning(snap) {
      return !!(snap && snap.running)
    }

    function queuedMessages(snap) {
      const queue = snap && Array.isArray(snap.queue) ? snap.queue : []
      const out = []
      for (const item of queue) {
        if (!item || !item.id) continue
        if (item.placement && item.placement !== 'queued') continue
        out.push(item)
      }
      return out
    }

    function snapshotIsBusy(snap) {
      return snapshotIsRunning(snap) || queuedMessages(snap).length > 0
    }

    function pinParentSessionId() {
      const sid = activeSessionId()
      return parentSessionTarget(sid, snapshotOf(sid), readSessionListSnap())
    }

    function parentSessionTarget(activeId, snap, list) {
      const byId = list && list.byId || {}
      let target = snap && snap.subagent && snap.subagent.address && snap.subagent.address.parentSessionId || activeId
      const seen = new Set()
      while (target && !seen.has(target)) {
        seen.add(target)
        const row = byId[target]
        if (!row || row.origin !== 'subagent' || !row.parentId) break
        target = row.parentId
      }
      return target
    }

    function sessionActivity(list, parentId) {
      const byId = list && list.byId || {}
      let childCount = 0
      let runningChildCount = 0
      if (parentId) {
        Object.values(byId).forEach((child) => {
          if (!child || child.origin !== 'subagent' || !child.id) return
          const seen = new Set()
          let cursor = child
          let belongs = false
          while (cursor && cursor.origin === 'subagent' && cursor.parentId && !seen.has(cursor.id || '')) {
            if (cursor.id) seen.add(cursor.id)
            if (cursor.parentId === parentId) {
              belongs = true
              break
            }
            cursor = byId[cursor.parentId]
          }
          if (!belongs) return
          childCount += 1
          if (child.running) runningChildCount += 1
        })
      }
      return {
        parentRunning: !!(parentId && byId[parentId] && byId[parentId].running),
        childCount,
        runningChildCount,
      }
    }

    function sessionExecutionActive(parentSnap, list, parentId) {
      const activity = sessionActivity(list, parentId)
      return snapshotIsRunning(parentSnap) || activity.parentRunning || activity.runningChildCount > 0
    }

    function assistantBlocksText(node) {
      return nodeText(node)
    }

    function nodeText(node) {
      if (!node) return ''
      const chunks = []
      const blocks = node.blocks || node.content || []
      if (Array.isArray(blocks)) {
        for (const block of blocks) {
          if (block && typeof block.text === 'string' && block.text) chunks.push(block.text)
        }
      }
      if (typeof node.text === 'string' && node.text) chunks.push(node.text)
      return chunks.join('\n')
    }

    function nodeLists(snap) {
      if (!snap) return []
      const lists = []
      if (Array.isArray(snap.nodes)) lists.push(snap.nodes)
      if (snap.chat && snap.chat.legacy && Array.isArray(snap.chat.legacy.nodes)) lists.push(snap.chat.legacy.nodes)
      return lists
    }

    function isChildReturnText(text) {
      return /(ACCEPT_AND_PROCEED|REVISE_AND_RETRY|\bDONE\b|Background subagent\s+\S+\s+(?:reported|finished|was stopped|ran out of room|declined the task|failed before it finished))/i.test(String(text || ''))
    }

    function isWorkbenchWakeText(text) {
      return /^(【子代理回推】|【主对话未接续】|【主对话插话】|【评审回推】)/.test(String(text || '').trim())
    }

    function lastReviewVerdict(snap) {
      return lastChildReturn(snap)
    }

    function lastChildReturn(snap) {
      for (const list of nodeLists(snap)) {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const node = list[i]
          const text = nodeText(node).trim()
          if (!text && node && node.kind === 'assistant') continue
          if (!text && !(node && node.kind)) continue
          return isChildReturnText(text) ? text : ''
        }
      }
      return ''
    }

    function inboundNeedsParentWake(snap) {
      for (const list of nodeLists(snap)) {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const node = list[i]
          if (!node) continue
          const text = nodeText(node).trim()
          if (node.kind === 'context' && text && isChildReturnText(text)) {
            return { kind: 'child-return', text }
          }
          if (node.kind === 'user' && text) {
            if (isWorkbenchWakeText(text)) return null
            return { kind: isChildReturnText(text) ? 'child-return' : 'user', text }
          }
          if (node.kind === 'assistant' && !text) continue
          if (node.kind && node.kind !== 'user') return null
        }
      }
      return null
    }

    function buildParentWakePrompt(hit) {
      const excerpt = hit.text.length > 1200 ? (hit.text.slice(0, 1200) + '\n…') : hit.text
      if (hit.kind === 'child-return') {
        return '【子代理回推】子智能体已 report/settled。请立刻核验磁盘成果并继续本阶段，不要再空等 DONE。\n\n' + excerpt
      }
      return '【主对话未接续】用户已在本主会话提交指令，但主会话没有继续。请立刻处理这条指令，不要空等。\n\n' + excerpt
    }

    function flushQueuedToParent(parentId) {
      const face = sessionFaceById(parentId)
      const items = queuedMessages(snapshotOf(parentId))
      if (!face || !items.length) return Promise.resolve(false)
      if (typeof face.updateQueue === 'function') {
        return items.reduce((prev, item) => prev.then(() => {
          return Promise.resolve(face.updateQueue(item.id, { kind: 'steer' })).then((result) => {
            if (result && result.ok === false) {
              const code = result.error && result.error.code
              if (code === 'steer-unavailable' || code === 'queue-item-not-found') return
              throw new Error((result.error && (result.error.message || result.error.code)) || 'updateQueue rejected')
            }
          })
        }), Promise.resolve()).then(() => true)
      }
      return dispatchToConversation({}, '【主对话插话】请立刻处理输入框已提交、但还没进入当前轮的指令，不要空等。', parentId)
    }

    function dispatchToConversation(props, text, sessionId) {
      if (!text) return Promise.resolve(false)
      const face = sessionId ? sessionFaceById(sessionId) : sessionFace(props)
      if (face && typeof face.prompt === 'function') {
        // Direct session write; do not touch the composer, or the draft would linger
        // there and invite an accidental duplicate send. A busy parent must be
        // steered — queue-only delivery waits out the current run_code and looks swallowed.
        const targetId = sessionId || resolveSessionId(props)
        const mode = snapshotIsRunning(snapshotOf(targetId)) ? 'steer' : 'queue'
        return face.prompt([{ type: 'text', text }], mode).then((result) => {
          if (result && result.ok === false) {
            throw new Error((result.error && (result.error.message || result.error.code)) || 'session.prompt rejected')
          }
          return true
        })
      }
      if (props && props.inputActions && typeof props.inputActions.submit === 'function') {
        fillComposer(props, text)
        props.inputActions.submit()
        return Promise.resolve(true)
      }
      return Promise.reject(new Error('当前没有可写入的主对话。请先打开或新建一个会话。'))
    }

    // Auto-advance engine at module scope: survives workbench mount/unmount, so the
    // continuation promise ("空闲自动接续，直到全部完成或暂停") holds after the overlay
    // closes. A tick steers a parked parent queue, forwards child DONE/settlement
    // when the parent did not continue, then resumes the stage draft. The host
    // dedupes drafts by slice fingerprint (mark_dispatched below).
    const AP_MONITOR_TICK_MS = 15000
    const monitorEngine = {
      state: { cwd: '', module: 'tender', projectId: '', parentSessionId: '', lastForwarded: '', monitoring: false, paused: false, lastCheck: 0, note: '', wasBusy: false, done: false, lastReality: null },
      sending: false,
      steeringQueue: false,
      timer: null,
      load() {
        try {
          const raw = sessionStorage.getItem('ap-wb-monitor')
          if (raw) {
            const saved = JSON.parse(raw)
            this.state.cwd = saved.cwd || ''
            this.state.module = saved.module || 'tender'
            this.state.projectId = saved.projectId || ''
            this.state.parentSessionId = saved.parentSessionId || ''
            this.state.lastForwarded = saved.lastForwarded || ''
            this.state.monitoring = !!saved.monitoring
            this.state.paused = !!saved.paused
            this.state.note = saved.note || ''
          }
        } catch {}
        this.ensureTimer()
      },
      save() {
        try {
          sessionStorage.setItem('ap-wb-monitor', JSON.stringify({
            cwd: this.state.cwd,
            module: this.state.module,
            projectId: this.state.projectId,
            parentSessionId: this.state.parentSessionId,
            lastForwarded: this.state.lastForwarded,
            monitoring: this.state.monitoring,
            paused: this.state.paused,
            note: this.state.note,
          }))
        } catch {}
      },
      emit() {
        this.save()
        window.dispatchEvent(new Event('agent-pi-monitor-changed'))
      },
      start(target) {
        if (target && target.cwd && target.projectId) {
          this.state.cwd = target.cwd
          this.state.module = target.module || 'tender'
          this.state.projectId = target.projectId
        }
        if (!this.state.cwd || !this.state.projectId) return
        this.state.monitoring = true
        this.state.paused = false
        this.state.done = false
        this.state.parentSessionId = pinParentSessionId()
        this.state.wasBusy = snapshotIsBusy(snapshotOf(this.state.parentSessionId))
        this.ensureTimer()
        this.emit()
      },
      pause() {
        this.state.paused = true
        this.emit()
      },
      unpause() {
        if (!this.state.monitoring) return
        this.state.paused = false
        if (!this.state.parentSessionId) this.state.parentSessionId = pinParentSessionId()
        this.state.wasBusy = snapshotIsBusy(snapshotOf(this.state.parentSessionId))
        this.emit()
      },
      stop(note) {
        this.state.monitoring = false
        if (note) this.state.note = note
        this.emit()
      },
      ensureTimer() {
        if (this.timer) return
        this.timer = setInterval(() => { this.tick() }, AP_MONITOR_TICK_MS)
      },
      tick() {
        const st = this.state
        if (!st.monitoring || st.paused || !st.cwd || !st.projectId) return
        if (!st.parentSessionId) st.parentSessionId = pinParentSessionId()
        const parentId = st.parentSessionId
        const parentSnap = snapshotOf(parentId)
        const parentRunning = snapshotIsRunning(parentSnap)
        const sessionList = readSessionListSnap()
        const executionActive = sessionExecutionActive(parentSnap, sessionList, parentId)
        const runningChildren = sessionActivity(sessionList, parentId).runningChildCount
        const queued = queuedMessages(parentSnap)
        const viewedId = activeSessionId()
        const viewedSnap = viewedId && viewedId !== parentId ? snapshotOf(viewedId) : null
        const viewedBusy = snapshotIsBusy(viewedSnap)
        st.wasBusy = executionActive || queued.length > 0
        st.lastCheck = Date.now()
        if (queued.length && !this.steeringQueue && !this.sending) {
          this.steeringQueue = true
          flushQueuedToParent(parentId).then((ok) => {
            if (!ok) return
            st.wasBusy = true
            st.note = '已把主对话排队指令插进当前轮。'
            this.emit()
          }).catch((e) => {
            st.note = String((e && e.message) || e)
            this.emit()
          }).finally(() => { this.steeringQueue = false })
          this.emit()
          return
        }
        if (!parentRunning && viewedId && viewedId !== parentId && !viewedBusy) {
          const verdict = lastChildReturn(viewedSnap)
          const token = verdict ? (viewedId + '\n' + verdict) : ''
          if (verdict && token !== st.lastForwarded) {
            st.lastForwarded = token
            const framed = buildParentWakePrompt({ kind: 'child-return', text: verdict })
            dispatchToConversation({}, framed, parentId).then((ok) => {
              if (!ok) return
              st.wasBusy = true
              st.note = '已把子智能体回推送进主对话。'
              this.emit()
            }).catch((e) => {
              st.note = String((e && e.message) || e)
              this.emit()
            })
            this.emit()
            return
          }
        }
        if (!parentRunning) {
          const hit = inboundNeedsParentWake(parentSnap)
          const token = hit ? ('parent\n' + hit.kind + '\n' + hit.text) : ''
          if (hit && token !== st.lastForwarded) {
            st.lastForwarded = token
            dispatchToConversation({}, buildParentWakePrompt(hit), parentId).then((ok) => {
              if (!ok) return
              st.wasBusy = true
              st.note = hit.kind === 'child-return' ? '子代理已回传，已叫醒主对话。' : '已把未接续的主对话指令重新推入。'
              this.emit()
            }).catch((e) => {
              st.note = String((e && e.message) || e)
              this.emit()
            })
            this.emit()
            return
          }
        }
        if (executionActive) {
          if (!parentRunning && runningChildren > 0) st.note = runningChildren + ' 个子智能体仍在执行，监控等待回推。'
          this.emit()
          return
        }
        if (this.sending) {
          this.emit()
          return
        }
        this.sending = true
        api('/api/agent-pi/stage', st.cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'check', module: st.module, projectId: st.projectId }),
        }).then((checked) => {
          if (checked && checked.reality) {
            st.lastReality = checked.reality
            this.emit()
          }
        }).catch(() => {}).then(() => api('/api/agent-pi/stage', st.cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'resume', module: st.module, projectId: st.projectId, sessionId: parentId }),
        })).then((result) => {
          if (result.done) {
            st.done = true
            this.stop(result.message || '流程已全部完成。')
            return
          }
          if (result.blocked) {
            st.note = result.message || result.blocked
            this.emit()
            return
          }
          if (result.alreadyDispatched || !result.draft) {
            st.note = result.message || ''
            this.emit()
            return
          }
          return dispatchToConversation({}, result.draft, parentId).then((ok) => {
            if (!ok) return
            st.wasBusy = true
            st.note = result.message || ''
            this.emit()
            if (result.dispatch) {
              return api('/api/agent-pi/stage', st.cwd, {
                method: 'POST',
                body: JSON.stringify({
                  action: 'mark_dispatched',
                  module: st.module,
                  projectId: st.projectId,
                  stageId: result.dispatch.stageId,
                  key: result.dispatch.key,
                }),
              }).catch(() => {})
            }
          }).catch((e) => {
            st.note = String((e && e.message) || e)
            this.emit()
          })
        }).catch((e) => {
          st.note = String((e && e.message) || e)
          this.emit()
        }).finally(() => { this.sending = false })
      },
    }
    monitorEngine.load()

    function snapshotHasHistory(snap) {
      if (!snap) return false
      if (Array.isArray(snap.nodes) && snap.nodes.length) return true
      if (snap.chat && snap.chat.legacy && Array.isArray(snap.chat.legacy.nodes) && snap.chat.legacy.nodes.length) return true
      return false
    }

    function buildCrashResumePrompt(restart) {
      const oom = restart && restart.reason === 'oom'
      return '【主机已自动重启 — 请在本会话继续】\n'
        + (oom ? '上次是内存不足退出，不要再一次派出大量并行工人。\n' : '宿主进程异常退出后已自动拉起。\n')
        + '不要盲目重跑已有 Official Output。\n'
        + 'TOOL_OUTCOME_UNKNOWN：只读/幂等可重做；写文件前先看目标在不在。\n'
        + '从中断处继续当前阶段。'
    }

    const crashResumeEngine = {
      sending: false,
      timer: null,
      load() {
        if (this.timer) return
        this.timer = setInterval(() => { this.tick() }, 4000)
        this.tick()
      },
      tick() {
        fetch('/api/agent-pi/host-status').then((res) => res.json().catch(() => ({}))).then((body) => {
          const restart = body && body.restart
          if (!restart || !restart.pending || this.sending) return
          const key = 'ap-crash-resume-' + restart.at
          try { if (sessionStorage.getItem(key)) return } catch {}
          const sid = pinParentSessionId() || activeSessionId()
          const snap = snapshotOf(sid)
          if (!sid || snapshotIsBusy(snap) || !snapshotHasHistory(snap)) return
          try { sessionStorage.setItem(key, '1') } catch {}
          this.sending = true
          dispatchToConversation({}, buildCrashResumePrompt(restart), sid).then((ok) => {
            if (!ok) return
            return fetch('/api/agent-pi/host-status', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'ack-restart', at: restart.at }),
            })
          }).catch(() => {}).finally(() => { this.sending = false })
        }).catch(() => {})
      },
    }
    crashResumeEngine.load()

    // Always-on parent wake: works even when the workbench monitor is not armed.
    // Steers a parked composer queue and re-prompts if a child return or user
    // message is last and the parent never replied.
    const parentWakeEngine = {
      sending: false,
      timer: null,
      lastForwarded: '',
      load() {
        if (this.timer) return
        this.timer = setInterval(() => { this.tick() }, 8000)
      },
      tick() {
        if (monitorEngine.state.monitoring && !monitorEngine.state.paused) return
        if (this.sending) return
        const parentId = pinParentSessionId()
        if (!parentId) return
        const snap = snapshotOf(parentId)
        if (!snap) return
        if (queuedMessages(snap).length) {
          this.sending = true
          flushQueuedToParent(parentId).catch(() => {}).finally(() => { this.sending = false })
          return
        }
        if (snapshotIsRunning(snap)) return
        const hit = inboundNeedsParentWake(snap)
        const token = hit ? (parentId + '\n' + hit.kind + '\n' + hit.text) : ''
        if (!hit || token === this.lastForwarded) return
        this.lastForwarded = token
        this.sending = true
        dispatchToConversation({}, buildParentWakePrompt(hit), parentId).catch(() => {
          this.lastForwarded = ''
        }).finally(() => { this.sending = false })
      },
    }

    function slugify(str) {
      return String(str || '')
        .toLowerCase()
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 128)
    }

    function formatClock(iso) {
      if (!iso) return '—'
      const value = Date.parse(iso)
      if (!Number.isFinite(value)) return '—'
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    function fileName(path) {
      const parts = String(path || '').split(/[\\/]/)
      return parts[parts.length - 1] || path
    }

    function sameFilePath(left, right) {
      return String(left || '').replace(/\\/g, '/').toLowerCase() === String(right || '').replace(/\\/g, '/').toLowerCase()
    }

    function findSetupRestore(restores, sourcePath) {
      const list = Array.isArray(restores) ? restores : []
      const name = fileName(sourcePath)
      return list.find((item) => (
        item && (sameFilePath(item.sourcePath, sourcePath) || item.originalName === name)
      )) || null
    }

    function restoreOpenPath(sourcePath, restores) {
      const hit = findSetupRestore(restores, sourcePath)
      return (hit && hit.manuscriptPath) || sourcePath
    }

    function desktopApi() {
      if (typeof window === 'undefined') return null
      const frames = [window]
      try { if (window.parent && window.parent !== window) frames.push(window.parent) } catch { /* cross-origin */ }
      try { if (window.top && window.top !== window && window.top !== window.parent) frames.push(window.top) } catch { /* cross-origin */ }
      for (let i = 0; i < frames.length; i++) {
        try {
          const api = frames[i] && frames[i].agentPiDesktop
          if (api) return api
        } catch { /* isolated frame */ }
      }
      return null
    }

    function normalizePickedPaths(value) {
      if (value == null) return []
      if (typeof value === 'string') {
        const path = value.trim()
        return path ? [path] : []
      }
      if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean)
      }
      if (typeof value === 'object' && Array.isArray(value.filePaths)) {
        return normalizePickedPaths(value.filePaths)
      }
      if (typeof value === 'object' && typeof value.length === 'number') {
        return Array.from(value).map((item) => String(item || '').trim()).filter(Boolean)
      }
      return []
    }

    function mergeKbEntries(server, local) {
      const serverList = Array.isArray(server) ? server.slice() : []
      const localList = Array.isArray(local) ? local : []
      const serverSlugs = new Set(serverList.map((entry) => entry && entry.slug).filter(Boolean))
      const serverNames = new Set(serverList.map((entry) => String((entry && (entry.name || entry.originalName)) || '')).filter(Boolean))
      const kept = localList.filter((entry) => {
        if (!entry || !entry.slug || serverSlugs.has(entry.slug)) return false
        if (String(entry.slug).indexOf('local:') === 0) {
          const name = String(entry.name || entry.originalName || entry.slug.slice('local:'.length))
          if (name && serverNames.has(name)) return false
        }
        return true
      })
      return kept.concat(serverList)
    }

    function kbLandingCardVisible(label, entries) {
      const shown = String(label || '').trim()
      if (!shown) return false
      return !(Array.isArray(entries) ? entries : []).some((entry) => {
        const name = String((entry && (entry.name || entry.originalName)) || '')
        if (!name || shown.indexOf(name) < 0) return false
        const status = entry && entry.parseStatus
        return status === 'ready' || status === 'staged' || status === 'parsing' || status === 'failed'
      })
    }

    function kbFidelityLabel(entry, lang) {
      const en = localeIdOf(lang || langState.lang) === 'en'
      const clauseCount = Number(entry && entry.clauseCount)
      const coverage = Number(entry && entry.coverage)
      const tableCount = Number(entry && entry.tableCount)
      if (Number.isFinite(clauseCount) && clauseCount > 0 && Number.isFinite(coverage)) {
        const tables = Number.isFinite(tableCount) && tableCount > 0
          ? (en ? ' · tables ' + tableCount : ' · 表 ' + tableCount)
          : ''
        return en
          ? 'Clauses ' + clauseCount + tables + ' · coverage ' + Math.round(coverage * 100) + '%'
          : '条款 ' + clauseCount + tables + ' · 覆盖 ' + Math.round(coverage * 100) + '%'
      }
      const chunkCount = Number(entry && entry.chunkCount)
      if (Number.isFinite(chunkCount) && chunkCount > 0) return en ? chunkCount + ' chunks' : chunkCount + ' 块'
      return ''
    }

    function kbIngestKind(entry) {
      if (!entry) return ''
      if (entry.ingest === 'pack') return 'pack'
      if (entry.ingest === 'mineru') return 'mineru'
      const name = String(entry.originalName || entry.name || '')
      if (/\.(pdf|docx?|pptx?|xlsx?|xls|png|jpe?g|jp2|webp|gif|bmp)$/i.test(name)) return 'local'
      return 'raw'
    }

    function kbIngestLabel(entry, lang) {
      const kind = kbIngestKind(entry)
      if (!kind) return ''
      const en = localeIdOf(lang || langState.lang) === 'en'
      if (kind === 'pack') return en ? 'Knowledge pack' : '知识包'
      if (kind === 'mineru') return en ? 'MinerU manuscript' : 'MinerU 解析稿'
      if (kind === 'local') return en ? 'Local text layer' : '本机文本层'
      return en ? 'Source ingest' : '原文入库'
    }

    function kbCategoryLabel(category, lang) {
      const name = String(category || '')
      const key = 'kb.cat.' + name
      const labeled = tAp(key)
      return labeled === key ? name : labeled
    }

    function apJoin(items) {
      return (items || []).join(langState.lang === 'en' ? ', ' : '、')
    }

    function kbProgressText(text) {
      const raw = String(text || '')
      if (raw === '正在落入原始文档区…' || raw === 'Saving to the staging area…') return tAp('kb.landingProgress')
      if (raw === '已落入原始文档区，等待解析入库' || raw === 'In the staging area, waiting to be parsed') return tAp('kb.stagedWait')
      if (raw === '已保存' || raw === 'Saved') return tAp('kb.mineruSavedHint')
      return raw
    }

    function looksLikeKbPackName(file) {
      const name = String((file && file.name) || '')
      const base = name.replace(/^.*[\\/]/, '').toLowerCase()
      if (base === 'pack.json' || base === 'manuscript.md') return true
      if ((file && file.type) === 'directory' && /(kb-pack|knowledge-pack|知识包)/i.test(name)) return true
      return false
    }

    function kbChatImportCopy() {
      return {
        title: tAp('kb.path2Title'),
        warn: tAp('kb.path2Warn'),
        say: '把这个 PDF 准确整理完整内容，做成知识包再入库。',
        after: tAp('kb.path2After'),
      }
    }

    const MODULE_CREATE_GUARD = '请先读 skill workbench-domain-builder。这是本应用专业化工作台的模块创造对话，不是 Agent 预设里的「创造模式」，不要写 cordis.yml 或改插件组装。生成的必须是完整工作台模块包：顶栏中文名、阶段监控条、开工资料登记、后续阶段的流程门槛（总报告 / 按册任务 / 评审）、配套方法 skill、能挂的知识库。用 workbench_module_save / workbench_module_copy / workbench_skill_save 直接装上，本应用按现有盘面画出来。不要发明新窗口或新界面。不要让我粘贴 JSON、id、slug。不要改内置投标。'
    const MODULE_CREATE_PROMPTS = {
      distill: MODULE_CREATE_GUARD + '我想把这次对话里已经做完、我认可的成果，整理成以后同类工作的标准。范文或用户模板进知识库，做法记成 skill，模块保存后用中文告诉我顶栏新标签叫什么、下次怎么开项目。最多确认一句中文名称和分几步。',
      'copy-pack': MODULE_CREATE_GUARD + '我们步骤和「投标全流程」一样（资料登记 → 解析 → 组价 → 出稿），但要用我们自己的规范、组价表或投标函。请拷贝内置投标为自建模块（workbench_module_copy），不要改四阶段 id。拷完用中文问我模块叫什么、规范或范文在哪（可以让我上传），挂到规范包。建好告诉我顶栏新标签和下次怎么用。',
      'custom-steps': MODULE_CREATE_GUARD + '我们这类工作和「投标全流程」步骤不一样。请用一条消息、用大白话问清：这个领域叫什么、实际工作分哪几步（3到6步）、开工有什么资料、最后交什么、有没有规范或范文。问完后建成完整模块包。保存后告诉我顶栏新标签叫什么、下次怎么开项目。',
    }
    function moduleCreateCopy() {
      return {
        title: tAp('mm.createTitle'),
        lead: tAp('mm.createLead'),
        warn: tAp('mm.createWarn'),
        advanced: tAp('mm.createAdvanced'),
        cards: [
          { id: 'distill', title: tAp('mm.card.distill'), body: tAp('mm.card.distillBody') },
          { id: 'copy-pack', title: tAp('mm.card.copy'), body: tAp('mm.card.copyBody') },
          { id: 'custom-steps', title: tAp('mm.card.custom'), body: tAp('mm.card.customBody') },
        ],
      }
    }

    function looksLikeUserTemplateName(name) {
      const base = String(name || '').replace(/^.*[\\/]/, '')
      if (!base) return false
      const stem = base.replace(/\.[^.]+$/, '')
      if (/(用户模板|用户模版)/.test(stem)) return true
      if (/(模板|模版)$/.test(stem)) return true
      if (/(^|[^a-z0-9])template([^a-z0-9]|$)/i.test(stem)) return true
      return false
    }

    function kbCategoryHint(category) {
      if (category === '用户模板' || category === '用户模版') return tAp('kb.hint.用户模板')
      return ''
    }

    const KB_PRESET_CATEGORIES = ['规范', '合同', '范文', '方法标准', '用户模板']

    function sortKbCategories(names) {
      return names.slice().sort((a, b) => {
        const ia = KB_PRESET_CATEGORIES.indexOf(a)
        const ib = KB_PRESET_CATEGORIES.indexOf(b)
        if (ia >= 0 && ib >= 0) return ia - ib
        if (ia >= 0) return -1
        if (ib >= 0) return 1
        return String(a).localeCompare(String(b), 'zh')
      })
    }

    function groupKbEntries(entries, folders, category) {
      const list = (Array.isArray(entries) ? entries : []).filter((entry) => !category || entry.category === category)
      const inCat = (Array.isArray(folders) ? folders : [])
        .filter((folder) => folder && folder.category === category)
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'))
      const buckets = new Map(inCat.map((folder) => [folder.id, []]))
      const loose = []
      for (const entry of list) {
        const bucket = entry.folderId ? buckets.get(entry.folderId) : undefined
        if (bucket) bucket.push(entry)
        else loose.push(entry)
      }
      return {
        folders: inCat.map((folder) => ({ folder, entries: buckets.get(folder.id) || [] })),
        loose,
      }
    }

    function diskPathOf(file) {
      const desktop = desktopApi()
      if (desktop && typeof desktop.pathForFile === 'function') {
        try {
          const path = String(desktop.pathForFile(file) || '').trim()
          if (isAbsolutePath(path)) return path
        } catch { /* preload too old for webUtils */ }
      }
      const fallback = String(file && file.path || '').trim()
      return isAbsolutePath(fallback) ? fallback : ''
    }

    function joinPath(base, child) {
      const sep = String(base).indexOf('\\') >= 0 || /^[a-zA-Z]:/.test(String(base)) ? '\\' : '/'
      return String(base).replace(/[\\/]+$/, '') + sep + String(child).replace(/^[\\/]+/, '')
    }

    function isAbsolutePath(value) {
      const path = String(value || '')
      return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')
    }

    function explorerTarget(cwd, targetPath, file) {
      let path = String(targetPath || (file && file.path) || '').trim()
      const rel = file && file.relativePath ? String(file.relativePath).trim() : ''
      if (!path && rel && cwd) path = joinPath(cwd, rel)
      if (path && !isAbsolutePath(path) && cwd) path = joinPath(cwd, path)
      if (!path) path = String(cwd || '').trim()
      return path.replace(/\//g, '\\')
    }

    function parentDir(path) {
      const value = String(path || '').replace(/[\\/]+$/, '')
      const idx = Math.max(value.lastIndexOf('\\'), value.lastIndexOf('/'))
      if (idx <= 0) return value
      if (idx === 2 && /^[a-zA-Z]:/.test(value)) return value
      return value.slice(0, idx)
    }

    function openInExplorer(cwd, targetPath, options) {
      const file = options && options.file
      const root = String(cwd || '').trim()
      const target = explorerTarget(root, targetPath, file)
      if (!target) return Promise.reject(new Error(tAp('files.noCwd')))
      const isDir = file ? file.type === 'directory' : true
      const reveal = options && Object.prototype.hasOwnProperty.call(options, 'reveal')
        ? Boolean(options.reveal)
        : !isDir
      showToast(tAp('files.opening'))
      const desktop = desktopApi()
      const viaDesktop = () => {
        if (!desktop) return Promise.resolve(false)
        const invoke = reveal && typeof desktop.revealPath === 'function'
          ? desktop.revealPath(target)
          : (typeof desktop.openPath === 'function'
            ? desktop.openPath(reveal ? (parentDir(target) || target) : target)
            : null)
        if (!invoke) return Promise.resolve(false)
        return Promise.resolve(invoke).then((msg) => !msg).catch(() => false)
      }
      return viaDesktop().then((ok) => {
        if (ok) return { ok: true, path: target }
        return api('/api/agent-pi/files/open', root || target, {
          method: 'POST',
          body: JSON.stringify({ path: target, reveal: reveal }),
        })
      })
    }

    function stageSlice(row, stageId) {
      if (!row) return null
      if (row.stages && row.stages[stageId]) return row.stages[stageId]
      if (row.stage && row.stage.stageId === stageId) return row.stage
      return null
    }

    function officialFolder(stageId) {
      return ({
        'tender-document-analysis': 'document-analysis',
        'boq-five-step-pricing': 'boq-pricing',
        'planning-and-submission': 'planning',
        'project-setup': 'setup',
        'delivery-setup': 'delivery',
        'delivery-controls': 'delivery',
        'investment-setup': 'investment',
        'investment-diligence': 'investment',
      })[stageId] || stageId
    }

    function officialStagePath(cwd, projectId, stageId) {
      return joinPath(joinPath(joinPath(cwd, 'Agent Pi Outputs'), projectId), officialFolder(stageId))
    }

    function stageRowDirty(slice, tasks, checkRow) {
      if (checkRow && typeof checkRow.needsQc === 'boolean') return checkRow.needsQc
      const done = tasks.filter((task) => task.status === 'done').length
      const failed = tasks.filter((task) => task.status === 'error').length
      if (failed > 0) return true
      if (slice && slice.status === 'done' && tasks.length > 0 && done < tasks.length) return true
      return false
    }

    function taskStatusLabel(status) {
      return ({ queued: '待处理', running: '进行中', done: '已完成', error: '失败' })[status] || status
    }

    function readWorkbenchOpen() {
      try { return sessionStorage.getItem('ap-wb-open') === '1' } catch { return false }
    }

    function setWorkbenchOpen(open) {
      try { sessionStorage.setItem('ap-wb-open', open ? '1' : '0') } catch {}
      document.documentElement.classList.toggle('ap-wb-open', !!open)
      window.dispatchEvent(new Event('agent-pi-wb-changed'))
    }

    function useWorkbenchOpen() {
      const [open, setOpen] = React.useState(() => (typeof document !== 'undefined' && document.documentElement.classList.contains('ap-wb-open')) || readWorkbenchOpen())
      React.useEffect(() => {
        const sync = () => setOpen(document.documentElement.classList.contains('ap-wb-open') || readWorkbenchOpen())
        sync()
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => window.removeEventListener('agent-pi-wb-changed', sync)
      }, [])
      return open
    }

    function useSidebarInset() {
      const [left, setLeft] = React.useState(260)
      React.useEffect(() => {
        const overlay = document.querySelector('[data-shell-overlay]')
        const side = overlay && overlay.parentElement ? overlay.parentElement.firstElementChild : null
        if (!side) return undefined
        const apply = () => setLeft(Math.round(side.getBoundingClientRect().width))
        apply()
        const ro = new ResizeObserver(apply)
        ro.observe(side)
        return () => ro.disconnect()
      }, [])
      return left
    }

    function api(path, cwd, init) {
      const opts = init || {}
      const timeoutMs = opts.timeoutMs
      const rest = Object.assign({}, opts)
      delete rest.timeoutMs
      const ctrl = rest.signal ? null : new AbortController()
      const url = `${path}${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd || '')}`
      const timer = timeoutMs ? setTimeout(() => { if (ctrl) ctrl.abort() }, timeoutMs) : null
      return fetch(url, Object.assign({
        headers: { 'content-type': 'application/json' },
      }, rest, {
        signal: rest.signal || (ctrl && ctrl.signal),
      })).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || res.statusText)
        return body
      }).catch((err) => {
        if (err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || err)))) {
          throw new Error(timeoutMs ? '打开文件超时，请改用资源管理器或稍后再试。' : '请求已取消')
        }
        throw err
      }).finally(() => { if (timer) clearTimeout(timer) })
    }

    function apiBlob(path, cwd, init) {
      const url = `${path}${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}`
      return fetch(url, { headers: { 'content-type': 'application/json' }, ...init }).then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || res.statusText)
        }
        const blob = await res.blob()
        const cd = res.headers.get('content-disposition') || ''
        const match = /filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i.exec(cd)
        const filename = decodeURIComponent((match && (match[1] || match[2])) || 'download')
        return { blob: blob, filename: filename }
      })
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1500)
    }

    function rawFileUrl(cwd, filePath) {
      return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(filePath)}`
    }

    const PREVIEW_TABLE_ROW_CAP = 80
    const PREVIEW_HEAD_CHARS = 60000
    const HEAVY_MD_CHARS = 80000
    const HEAVY_TABLE_ROWS = 150
    const PREVIEW_CACHE_MAX = 8
    const previewCache = new Map()
    const MARKUP_RE = /[`*!\[]/
    const HTML_SPECIAL_RE = /[&<>"]/

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

    function previewIsHeavy(markdown) {
      const text = String(markdown || '')
      if (text.length > HEAVY_MD_CHARS) return true
      let rows = 0
      for (const line of text.split('\n')) {
        if (isPipeTableRow(line)) {
          rows += 1
          if (rows > HEAVY_TABLE_ROWS) return true
        }
      }
      return false
    }

    function slicePreviewMarkdown(markdown, maxChars) {
      const limit = maxChars || PREVIEW_HEAD_CHARS
      const text = String(markdown || '')
      if (text.length <= limit) return { text: text, truncated: false, originalChars: text.length }
      let cut = text.lastIndexOf('\n', limit)
      if (cut < Math.floor(limit * 0.6)) cut = limit
      return { text: text.slice(0, cut), truncated: true, originalChars: text.length }
    }

    function collectPipeTables(markdown) {
      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
      const tables = []
      let i = 0
      while (i < lines.length) {
        if (isPipeTableRow(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
          const start = i
          i += 2
          while (i < lines.length && isPipeTableRow(lines[i])) i += 1
          tables.push(lines.slice(start, i).join('\n'))
          continue
        }
        i += 1
      }
      return tables
    }

    function restoreCappedTables(edited, original) {
      const fromOriginal = collectPipeTables(original)
      const fromEdited = collectPipeTables(edited)
      if (!fromOriginal.length || fromEdited.length !== fromOriginal.length) return edited
      let index = 0
      const lines = String(edited || '').replace(/\r\n/g, '\n').split('\n')
      const out = []
      let i = 0
      while (i < lines.length) {
        if (isPipeTableRow(lines[i]) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
          const start = i
          i += 2
          while (i < lines.length && isPipeTableRow(lines[i])) i += 1
          const next = fromEdited[index] || lines.slice(start, i).join('\n')
          const orig = fromOriginal[index] || next
          index += 1
          const nextRows = next.split('\n')
          const origRows = orig.split('\n')
          out.push(origRows.length > nextRows.length
            ? nextRows.concat(origRows.slice(nextRows.length)).join('\n')
            : next)
          continue
        }
        out.push(lines[i])
        i += 1
      }
      return out.join('\n')
    }

    function stitchMarkdown(edited, original) {
      const sliced = slicePreviewMarkdown(original)
      const restored = restoreCappedTables(edited, sliced.text)
      if (!sliced.truncated) return restored
      return restored.replace(/\s*$/, '') + original.slice(sliced.text.length)
    }

    function buildPreviewSelectionFollowup(input) {
      const filePath = String(input.filePath || '').trim()
      const instruction = String(input.instruction || '').trim()
      const selected = String(input.selectedText || '').trim()
      if (!filePath || !instruction || !selected) throw new Error('file path, selection, and instruction are required')
      const clipped = selected.length > 8000 ? selected.slice(0, 8000) + '\n…(选区已截断)' : selected
      return '【预览选区修改 — 请在本主会话继续，使用本项目记忆】\n\n文件: ' + filePath
        + '\n用户要求: ' + instruction + '\n\n<selected_text>\n' + clipped + '\n</selected_text>\n\n请直接改这个文件并保存。不要另开对话，不要只口头改一版。改完用一句话说明改了什么。'
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    }

    function citationChipLabel(token) {
      const raw = String(token || '')
      if (raw.startsWith('kb:')) {
        const rest = raw.slice(3)
        const sep = rest.lastIndexOf(':')
        return sep > 0 ? rest.slice(0, sep) : rest
      }
      if (raw.startsWith('src:')) {
        const rest = raw.slice(4)
        const hash = rest.lastIndexOf('#')
        const path = hash > 0 ? rest.slice(0, hash) : rest
        const loc = hash > 0 ? rest.slice(hash + 1) : ''
        const name = path.replace(/^.*[/\\]/, '')
        return loc ? name + ' · ' + loc : name
      }
      return raw.length > 42 ? raw.slice(0, 39) + '…' : raw
    }

    function citationChip(token) {
      // token is already HTML-escaped (runs after escapeHtml); keep it verbatim in the
      // data attribute so htmlToMarkdown can round-trip the literal [token] back out.
      return '<span class="ap-cite" data-cite="' + token + '" data-cite-token="[' + token + ']" title="点击查看出处">' + citationChipLabel(token) + '</span>'
    }

    function inlineMarkdown(value, ctx) {
      const raw = String(value)
      if (!MARKUP_RE.test(raw)) return HTML_SPECIAL_RE.test(raw) ? escapeHtml(raw) : raw
      let text = escapeHtml(raw)
      text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>')
      text = text.replace(/\[(kb:[a-z0-9][a-z0-9._-]*:[A-Za-z0-9._-]+)\]/g, (_, token) => citationChip(token))
      text = text.replace(/\[(src:[^\]\r\n]+?)\]/g, (_, token) => citationChip(token))
      text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, href) => {
        const image = resolvePreviewImage(href, ctx)
        return '<img alt="' + escapeHtml(alt) + '" src="' + escapeHtml(image.src) + '" data-md-src="' + escapeHtml(image.origin) + '">'
      })
      text = text.replace(/\[([^\]]+)\]\((https?:[^)]+|data:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
      return text
    }

    function resolvePreviewImage(href, ctx) {
      const raw = String(href || '').trim()
      const origin = raw.replace(/^</, '').replace(/>.*$/, '').split(/\s+["']/)[0]
      if (!origin || /^(https?:|data:|blob:|#|mailto:)/i.test(origin)) return { src: origin, origin: origin }
      if (!ctx || !ctx.cwd || !ctx.filePath) return { src: origin, origin: origin }
      const filePath = String(ctx.filePath).replace(/\\/g, '/')
      const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
      const rel = origin.replace(/\\/g, '/')
      let resolved
      if (/^[a-zA-Z]:\//.test(rel) || rel.startsWith('/')) resolved = rel
      else {
        const parts = (dir + '/' + rel).split('/')
        const out = []
        for (const part of parts) {
          if (part === '.' || part === '') continue
          if (part === '..') out.pop()
          else out.push(part)
        }
        resolved = out.join('/')
      }
      return { src: rawFileUrl(ctx.cwd, resolved.replace(/\//g, '\\')), origin: origin }
    }

    function isPipeTableRow(line) {
      return /^\s*\|.+\|\s*$/.test(line)
    }

    function isPipeSeparatorRow(line) {
      const trimmed = String(line).trim()
      if (!trimmed.includes('|') || !trimmed.includes('-')) return false
      const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
      const cells = inner.split('|')
      return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
    }

    function pipeCells(line) {
      return line.split('|').slice(1, -1).map((cell) => cell.trim())
    }

    function startsMdBlock(line) {
      return /^(#{1,6}\s|```|\s*\\?[-*+]\s|\s*\\?\d+\.\s|\s*>|---+$)/.test(line)
        || isPipeTableRow(line)
        || /^\s*<table\b/i.test(line)
    }

    var TABLE_TAGS = { table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, th: 1, td: 1, caption: 1, colgroup: 1, col: 1, br: 1 }

    function capHtmlTableRows(table, cap) {
      if (!Number.isFinite(cap) || cap === Infinity) return { html: table, hidden: 0 }
      let seen = 0
      let hidden = 0
      const html = table.replace(/<tr\b[\s\S]*?<\/tr>/gi, (row) => {
        seen += 1
        if (seen <= cap + 1) return row
        hidden += 1
        return ''
      })
      return { html: html, hidden: hidden }
    }

    function sanitizeMineruTable(html, cap) {
      const match = /<table\b[\s\S]*?<\/table>/i.exec(html)
      if (!match) return '<p>' + escapeHtml(html) + '</p>'
      const table = match[0]
        .replace(/<\/?(script|style|iframe|object|embed|link|meta|img|svg|video|audio)[^>]*>/gi, '')
        .replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (all, name, attrs) => {
          const tag = String(name).toLowerCase()
          if (tag === 'br') return '<br>'
          if (!TABLE_TAGS[tag]) return ''
          if (all.startsWith('</')) return '</' + tag + '>'
          const kept = []
          const attrRe = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g
          let attr
          while ((attr = attrRe.exec(attrs))) {
            if (/^(colspan|rowspan|scope)$/i.test(attr[1])) {
              const value = attr[3] != null ? attr[3] : (attr[4] != null ? attr[4] : (attr[5] || ''))
              kept.push(attr[1].toLowerCase() + '="' + escapeHtml(value) + '"')
            }
          }
          return '<' + tag + (kept.length ? ' ' + kept.join(' ') : '') + '>'
        })
      const capped = capHtmlTableRows(table, cap == null ? PREVIEW_TABLE_ROW_CAP : cap)
      const more = capped.hidden > 0
        ? '<p class="ap-doc-more">还有 ' + capped.hidden + ' 行未显示，切源码可看全文；保存时会拼回。</p>'
        : ''
      return '<div class="ap-doc-table-wrap">' + capped.html + '</div>' + more
    }

    function takeHtmlTable(lines, start) {
      const first = lines[start]
      if (!first || (!/^\s*<table\b/i.test(first) && !(/^\s*<html\b/i.test(first) && /<table/i.test(first)))) return null
      const buf = [first]
      let i = start + 1
      if (!/<\/table>/i.test(first)) {
        let chars = first.length
        while (i < lines.length && !/<\/table>/i.test(lines[i]) && chars < 400000) {
          buf.push(lines[i])
          chars += lines[i].length + 1
          i += 1
        }
        if (i < lines.length) {
          buf.push(lines[i])
          i += 1
        }
      }
      return { html: buf.join('\n'), next: i }
    }

    function tableRowCapOf(ctx) {
      const cap = ctx && ctx.tableRowCap
      if (cap === Infinity) return Infinity
      if (typeof cap === 'number' && cap > 0) return cap
      return PREVIEW_TABLE_ROW_CAP
    }

    function collectMdTableRows(markdown) {
      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
      const tables = []
      const sep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/
      let i = 0
      while (i < lines.length) {
        if (/^\s*\|.+\|\s*$/.test(lines[i]) && i + 1 < lines.length && sep.test(lines[i + 1])) {
          i += 2
          const rows = []
          while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
            rows.push(lines[i])
            i += 1
          }
          tables.push(rows)
          continue
        }
        i += 1
      }
      return tables
    }

    function mdTableRowHtml(line, ctx) {
      return '<tr>' + line.split('|').slice(1, -1).map((cell) => '<td>' + inlineMarkdown(cell.trim(), ctx) + '</td>').join('') + '</tr>'
    }

    function fillMdTables(root, markdown, ctx, options) {
      const opts = options || {}
      let cancelled = false
      const batch = opts.batch > 0 ? opts.batch : 80
      const only = typeof opts.tableIndex === 'number' ? opts.tableIndex : -1
      const tables = collectMdTableRows(markdown)
      const run = async () => {
        if (!root || !root.querySelectorAll) return
        const wraps = root.querySelectorAll('.ap-doc-table-wrap')
        for (let i = 0; i < wraps.length && i < tables.length; i++) {
          if (only >= 0 && i !== only) continue
          const wrap = wraps[i]
          const tbody = wrap.querySelector('tbody')
          if (!tbody) continue
          const rows = tables[i]
          while (!cancelled && tbody.rows.length < rows.length) {
            const start = tbody.rows.length
            const end = Math.min(rows.length, start + batch)
            tbody.insertAdjacentHTML('beforeend', rows.slice(start, end).map((line) => mdTableRowHtml(line, ctx)).join(''))
            const more = wrap.nextElementSibling
            if (more && more.classList && more.classList.contains('ap-doc-more')) {
              const left = rows.length - tbody.rows.length
              if (left <= 0) more.remove()
              else {
                const btn = more.querySelector('[data-md-expand]')
                if (btn) btn.textContent = '还有 ' + left + ' 行未显示，点击立即展开'
              }
            }
            await new Promise((resolve) => requestAnimationFrame(resolve))
          }
          if (cancelled) return
        }
      }
      return { cancel: () => { cancelled = true }, done: run() }
    }

    function mdToHtml(markdown, ctx) {
      const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
      const out = []
      const cap = tableRowCapOf(ctx)
      let i = 0
      let tableIndex = 0
      let listType = null
      let listItems = []
      const flushList = () => {
        if (!listType) return
        out.push('<' + listType + '>' + listItems.map((item) => '<li>' + item + '</li>').join('') + '</' + listType + '>')
        listType = null
        listItems = []
      }
      while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```')) {
          flushList()
          const code = []
          i += 1
          while (i < lines.length && !lines[i].startsWith('```')) {
            code.push(lines[i])
            i += 1
          }
          if (i < lines.length) i += 1
          out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>')
          continue
        }
        const htmlTable = takeHtmlTable(lines, i)
        if (htmlTable) {
          flushList()
          out.push(sanitizeMineruTable(htmlTable.html, cap))
          i = htmlTable.next
          continue
        }
        if (isPipeTableRow(line) && i + 1 < lines.length && isPipeSeparatorRow(lines[i + 1])) {
          flushList()
          const header = pipeCells(line).map((cell) => '<th>' + inlineMarkdown(cell, ctx) + '</th>').join('')
          i += 2
          const rows = []
          let hidden = 0
          while (i < lines.length && isPipeTableRow(lines[i])) {
            if (rows.length >= cap) {
              hidden += 1
              i += 1
              continue
            }
            rows.push('<tr>' + pipeCells(lines[i]).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr>')
            i += 1
          }
      out.push('<div class="ap-doc-table-wrap" data-md-table="' + tableIndex + '"><table><thead><tr>' + header + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>')
      tableIndex += 1
      if (hidden > 0) {
        out.push('<p class="ap-doc-more"><button type="button" class="ap-doc-btn" data-md-expand="table">还有 ' + hidden + ' 行未显示，点击立即展开</button></p>')
      }
          continue
        }
        if (isPipeTableRow(line)) {
          flushList()
          out.push('<div class="ap-doc-table-wrap"><table><tbody><tr>' + pipeCells(line).map((cell) => '<td>' + inlineMarkdown(cell, ctx) + '</td>').join('') + '</tr></tbody></table></div>')
          i += 1
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          flushList()
          const level = heading[1].length
          out.push('<h' + level + '>' + inlineMarkdown(heading[2], ctx) + '</h' + level + '>')
          i += 1
          continue
        }
        if (/^---+$/.test(line.trim())) {
          flushList()
          out.push('<hr/>')
          i += 1
          continue
        }
        const ul = /^\s*\\?[-*+]\s+(.*)$/.exec(line)
        if (ul) {
          if (listType && listType !== 'ul') flushList()
          listType = 'ul'
          listItems.push(inlineMarkdown(ul[1], ctx))
          i += 1
          continue
        }
        const ol = /^\s*\\?\d+\.\s+(.*)$/.exec(line)
        if (ol) {
          if (listType && listType !== 'ol') flushList()
          listType = 'ol'
          listItems.push(inlineMarkdown(ol[1], ctx))
          i += 1
          continue
        }
        if (/^\s*>\s?/.test(line)) {
          flushList()
          const quote = []
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            quote.push(lines[i].replace(/^\s*>\s?/, ''))
            i += 1
          }
          out.push('<blockquote><p>' + inlineMarkdown(quote.join(' '), ctx) + '</p></blockquote>')
          continue
        }
        if (!line.trim()) {
          flushList()
          i += 1
          continue
        }
        flushList()
        const para = []
        while (i < lines.length && lines[i].trim() && !startsMdBlock(lines[i])) {
          para.push(lines[i])
          i += 1
        }
        if (!para.length) {
          out.push('<p>' + inlineMarkdown(line, ctx) + '</p>')
          i += 1
          continue
        }
        const joined = para.join(' ').trim()
        const embedded = /<table\b[\s\S]*?<\/table>/i.exec(joined)
        if (embedded) {
          const before = joined.slice(0, embedded.index).trim()
          if (before) out.push('<p>' + inlineMarkdown(before, ctx) + '</p>')
          out.push(sanitizeMineruTable(embedded[0], cap))
          const after = joined.slice(embedded.index + embedded[0].length).trim()
          if (after) out.push('<p>' + inlineMarkdown(after, ctx) + '</p>')
          continue
        }
        out.push('<p>' + inlineMarkdown(joined, ctx) + '</p>')
      }
      flushList()
      return out.join('\n')
    }

    function htmlToMarkdown(root) {
      const blocks = []
      const inline = (node) => {
        if (!node) return ''
        if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\u00a0/g, ' ')
        if (node.nodeType !== 1) return ''
        const tag = node.tagName.toLowerCase()
        if (node.getAttribute && node.getAttribute('data-cite-token')) return node.getAttribute('data-cite-token')
        const children = Array.from(node.childNodes).map(inline).join('')
        if (tag === 'br') return '\n'
        if (tag === 'strong' || tag === 'b') return children ? '**' + children + '**' : ''
        if (tag === 'em' || tag === 'i') return children ? '*' + children + '*' : ''
        if (tag === 'code') return children ? '`' + children + '`' : ''
        if (tag === 'a') {
          const href = node.getAttribute('href') || ''
          return href ? '[' + children + '](' + href + ')' : children
        }
        if (tag === 'img') {
          const origin = node.getAttribute('data-md-src') || node.getAttribute('src') || ''
          const alt = node.getAttribute('alt') || ''
          return origin ? '![' + alt + '](' + origin + ')' : ''
        }
        return children
      }
      const pushList = (line) => {
        const last = blocks[blocks.length - 1]
        if (last && /^(\s*[-*+]\s|\s*\d+\.\s)/.test(last.split('\n').pop())) blocks[blocks.length - 1] = last + '\n' + line
        else blocks.push(line)
      }
      const block = (node) => {
        if (node.nodeType === 3) {
          const text = String(node.nodeValue || '').trim()
          if (text) blocks.push(text)
          return
        }
        if (node.nodeType !== 1) return
        const tag = node.tagName.toLowerCase()
        if (/^h[1-6]$/.test(tag)) {
          blocks.push('#'.repeat(Number(tag[1])) + ' ' + inline(node).trim())
          return
        }
        if (tag === 'p') {
          const text = inline(node).trim()
          if (text) blocks.push(text)
          return
        }
        if (tag === 'blockquote') {
          const text = inline(node).trim()
          if (text) blocks.push(text.split('\n').map((line) => '> ' + line).join('\n'))
          return
        }
        if (tag === 'pre') {
          blocks.push('```\n' + String(node.textContent || '').replace(/\n$/, '') + '\n```')
          return
        }
        if (tag === 'ul' || tag === 'ol') {
          Array.from(node.children).filter((child) => child.tagName && child.tagName.toLowerCase() === 'li').forEach((li, index) => {
            pushList((tag === 'ol' ? (index + 1) + '. ' : '- ') + inline(li).trim())
          })
          return
        }
        if (tag === 'table') {
          const rows = Array.from(node.querySelectorAll('tr')).map((tr) => Array.from(tr.children).map((cell) => inline(cell).trim()))
          if (!rows.length) return
          const header = rows[0]
          blocks.push([
            '| ' + header.join(' | ') + ' |',
            '| ' + header.map(() => '---').join(' | ') + ' |',
            ...rows.slice(1).map((row) => '| ' + row.join(' | ') + ' |'),
          ].join('\n'))
          return
        }
        if (tag === 'hr') {
          blocks.push('---')
          return
        }
        if (tag === 'div' || tag === 'span' || tag === 'section') {
          if (node.childElementCount === 0) {
            const text = inline(node).trim()
            if (text) blocks.push(text)
            return
          }
          Array.from(node.childNodes).forEach(block)
          return
        }
        const text = inline(node).trim()
        if (text) blocks.push(text)
      }
      Array.from(root.childNodes).forEach(block)
      return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
    }

    function DocBtn(title, onClick, children, disabled) {
      return h('button', {
        type: 'button',
        className: 'ap-doc-btn',
        title: title,
        disabled: !!disabled,
        onClick: onClick,
      }, children)
    }

    function uploadBytes(cwd, relativePath, file) {
      const url = `/api/agent-pi/files/upload?cwd=${encodeURIComponent(cwd)}&relativePath=${encodeURIComponent(relativePath)}`
      return file.arrayBuffer().then((buf) => fetch(url, { method: 'POST', body: buf })).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || res.statusText)
        return body
      })
    }

    function uploadKbBytes(cwd, file, meta) {
      const qs = new URLSearchParams()
      qs.set('cwd', cwd || '')
      qs.set('fileName', file.name || 'document.bin')
      if (meta && meta.sessionId) qs.set('sessionId', meta.sessionId)
      if (meta && meta.category) qs.set('category', meta.category)
      if (meta && meta.name) qs.set('name', meta.name)
      if (meta && meta.stage) qs.set('stage', '1')
      const url = '/api/agent-pi/kb/bytes?' + qs.toString()
      return file.arrayBuffer().then((buf) => fetch(url, { method: 'POST', body: buf })).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || res.statusText)
        return body
      })
    }

    const FILE_SOURCE = 'workspace-file'
    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i
    const TEXT_EXT = /\.(md|txt|json|jsonl|csv|tsv|xml|ya?ml|html|css|js|ts|tsx|py|go|rs|java|c|h|cpp|log|ini|toml|svg)$/i
    const ATTACH_MARK = '<!--agent-pi-attachments-->'
    const ATTACH_MARK_END = '<!--/agent-pi-attachments-->'
    const runtime = {
      sessions: null,
      workspaces: null,
      locale: null,
      sessionId: '',
      cwd: '',
      files: [],
      conversation: null,
    }
    parentWakeEngine.load()
    const attachState = window.__apAttachState || (window.__apAttachState = { bySession: new Map(), listeners: new Set(), last: [], items: [] })
    if (!Array.isArray(attachState.items)) attachState.items = Array.isArray(attachState.last) ? attachState.last : []
    if (!attachState.listeners || typeof attachState.listeners.forEach !== 'function') attachState.listeners = new Set()
    const kbPickState = window.__apKbPick || (window.__apKbPick = {
      entries: [],
      pickedLabel: '',
      notice: '',
      error: '',
      listeners: new Set(),
      addManyPaths: null,
      addBrowserFiles: null,
    })
    if (!Array.isArray(kbPickState.entries)) kbPickState.entries = []
    if (!kbPickState.listeners || typeof kbPickState.listeners.forEach !== 'function') kbPickState.listeners = new Set()

    function kbPickNotify() {
      kbPickState.listeners.forEach((fn) => {
        try { fn() } catch { /* panel already gone */ }
      })
    }

    function kbPickPatch(patch) {
      Object.assign(kbPickState, patch)
      kbPickNotify()
    }

    function kbPickUpsert(entry) {
      if (!entry || !entry.slug) return
      const localName = 'local:' + (entry.name || entry.originalName || '')
      kbPickState.entries = [entry].concat(kbPickState.entries.filter((item) => item && item.slug !== entry.slug && item.slug !== localName))
      kbPickNotify()
    }

    function kbPickerHome() {
      if (typeof document === 'undefined') return null
      let home = document.getElementById('ap-kb-picker-home')
      if (home) return home
      home = document.createElement('div')
      home.id = 'ap-kb-picker-home'
      home.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none'
      document.body.appendChild(home)
      return home
    }

    function ensureKbFileInput() {
      if (typeof document === 'undefined') return null
      let el = document.getElementById('ap-kb-file-input')
      if (el) return el
      el = document.createElement('input')
      el.id = 'ap-kb-file-input'
      el.type = 'file'
      el.multiple = true
      el.className = 'ap-kb-native'
      el.accept = '.md,.markdown,.txt,.json,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp'
      el.addEventListener('change', () => {
        const files = el.files
        const names = Array.from(files || []).map((file) => file.name).join('、')
        if (names) kbPickPatch({ pickedLabel: names, error: '', notice: names })
        const picked = Array.from(files || [])
        kbPickState.pendingFiles = picked
        if (typeof kbPickState.addBrowserFiles === 'function') {
          kbPickState.pendingFiles = []
          kbPickState.addBrowserFiles(picked)
        } else {
          picked.forEach((file) => kbPickUpsert({
            slug: 'local:' + (file.name || 'file'),
            name: file.name || 'file',
            parseStatus: 'staged',
            parseProgress: '已选中，等待界面接手…',
            sizeBytes: file.size || 0,
          }))
        }
        el.value = ''
      })
      const home = kbPickerHome()
      if (home) home.appendChild(el)
      return el
    }

    function parkKbFileInput() {
      const el = ensureKbFileInput()
      const home = kbPickerHome()
      if (el && home && el.parentNode !== home) home.appendChild(el)
      return el
    }

    function pickKbDiskPaths() {
      const desktop = desktopApi()
      kbPickPatch({ error: '', notice: '正在打开文件选择器…' })
      if (desktop && typeof desktop.pickFiles === 'function') {
        return Promise.resolve(desktop.pickFiles()).then((raw) => {
          const paths = normalizePickedPaths(raw)
          if (!paths.length) {
            kbPickPatch({ error: '没有收到文件。请改用下方系统文件框，或把文件拖进本区。', notice: '' })
            return []
          }
          kbPickPatch({ pickedLabel: paths.map(fileName).join('、'), error: '', notice: '本次选择：' + paths.map(fileName).join('、') })
          kbPickState.pendingPaths = paths
          paths.forEach((path) => kbPickUpsert({
            slug: 'local:' + fileName(path),
            name: fileName(path),
            parseStatus: 'staged',
            parseProgress: '正在落入原始文档区…',
            sizeBytes: 0,
          }))
          if (typeof kbPickState.addManyPaths === 'function') {
            kbPickState.pendingPaths = []
            return kbPickState.addManyPaths(paths)
          }
          return paths
        }).catch((err) => {
          kbPickPatch({ error: '选择文件失败：' + String(err && err.message || err), notice: '' })
          return []
        })
      }
      const input = ensureKbFileInput()
      if (input) input.click()
      else kbPickPatch({ error: '无法打开文件选择器。请把文件拖进本区，或粘贴路径。', notice: '' })
      return Promise.resolve([])
    }

    function attachSessionId(props) {
      return resolveSessionId(props) || runtime.sessionId || ''
    }

    function notifyAttach() {
      try {
        window.dispatchEvent(new CustomEvent('agent-pi-attach-changed', { detail: { items: attachState.items || [] } }))
      } catch { /* ignore dispatch in detached windows */ }
      attachState.listeners.forEach((fn) => {
        try { fn() } catch { /* a stale subscriber must not block the rail */ }
      })
    }

    function attachItemsOf(sessionId) {
      if (attachState.items && attachState.items.length) return attachState.items
      if (sessionId && attachState.bySession.has(sessionId)) {
        const owned = attachState.bySession.get(sessionId) || []
        if (owned.length) return owned
      }
      return attachState.last || []
    }

    function codexAttachItems(sessionId) {
      if (!sessionId || !attachState.bySession || !attachState.bySession.has(sessionId)) return []
      return attachState.bySession.get(sessionId) || []
    }

    function codexAttachmentToken(item) {
      return item && item.id ? 'id:' + item.id : item
    }

    function setCodexAttachItems(sessionId, items) {
      if (!sessionId) return
      const next = Array.isArray(items) ? items : []
      attachState.bySession.set(sessionId, next)
      if (activeSessionId() !== sessionId) return
      attachState.items = next
      attachState.last = next
      notifyAttach()
    }

    function setAttachItemsFor(sessionId, items) {
      const next = Array.isArray(items) ? items : []
      attachState.items = next
      attachState.last = next
      if (sessionId) attachState.bySession.set(sessionId, next)
      notifyAttach()
    }

    function setAttachItems(items, props) {
      setAttachItemsFor(attachSessionId(props), items)
    }

    function useAttachItems() {
      const [items, setItems] = React.useState(() => (attachState.items || attachState.last || []).slice())
      React.useEffect(() => {
        const sync = (event) => {
          const next = (event && event.detail && event.detail.items) || attachState.items || attachState.last || []
          setItems(next.slice())
        }
        attachState.listeners.add(sync)
        window.addEventListener('agent-pi-attach-changed', sync)
        sync()
        return () => {
          attachState.listeners.delete(sync)
          window.removeEventListener('agent-pi-attach-changed', sync)
        }
      }, [])
      return [items, (next) => {
        const current = attachState.items || []
        setAttachItemsFor(runtime.sessionId || 'pending', typeof next === 'function' ? next(current) : next)
      }]
    }

    function flattenFiles(nodes, out) {
      for (const node of nodes || []) {
        if (node.type !== 'directory') {
          out.push({
            name: node.name,
            relativePath: (node.relativePath || node.path || '').replace(/\\/g, '/'),
            path: node.path,
          })
        }
        flattenFiles(node.children, out)
      }
      return out
    }

    function fileKind(name, mime) {
      const type = String(mime || '').toLowerCase()
      if (type.startsWith('image/') || IMAGE_EXT.test(String(name || ''))) return 'image'
      const ext = String(name || '').split('.').pop().toLowerCase()
      if (ext === 'pdf') return 'pdf'
      if (TEXT_EXT.test(String(name || '')) || ext === 'md' || ext === 'txt' || ext === 'json' || ext === 'csv') return 'text'
      return 'file'
    }

    function fileTypeLabel(kind, name, loaded) {
      if (kind === 'folder') return '文件夹'
      if (kind === 'image') return '图片'
      if (loaded === false) return '读取中'
      const ext = String(name || '').split('.').pop().toUpperCase()
      return ext || '文件'
    }

    function folderNameOf(dir) {
      return String(dir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(dir || '')
    }

    function showToast(text) {
      if (!text) return
      window.dispatchEvent(new CustomEvent('agent-pi-toast', { detail: { text } }))
    }

    function resolveSessionId(props) {
      return sessionHint(props) || runtime.sessionId || composerFace.sessionId || ''
    }

    function revealComposerAfterAttach() {
      window.dispatchEvent(new Event('agent-pi-close-preview'))
      window.requestAnimationFrame(() => {
        const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
        if (!ta) return
        try { ta.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) } catch {}
        try { ta.focus() } catch {}
      })
    }

    function readDraft() {
      return composerFace.draft || ''
    }

    function currentDraft(props) {
      if (props && props.input && typeof props.input.draft === 'string') return props.input.draft
      const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
      if (ta && typeof ta.value === 'string') return ta.value
      return composerFace.draft || ''
    }

    function setComposerDraft(props, text) {
      if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
        props.inputActions.setDraft(text)
        return
      }
      fillComposer(props, text)
    }

    function stripMentionArtifacts(draft) {
      return String(draft || '')
        .replace(/\uFFFC\s*/g, '')
        .replace(/请读取并依据此文件：[`'“”‘'][^`'“”‘']*[`'“”‘']/g, '')
        .replace(/<!--agent-pi-attachments-->[\s\S]*?<!--\/agent-pi-attachments-->/g, '')
        .replace(/<!--agent-pi-kb-task-->[\s\S]*?<!--\/agent-pi-kb-task-->/g, '')
        .replace(/<attached-image\b[^>]*>[\s\S]*?<\/attached-image>/g, '')
        .replace(/The user attached an image\. The following is a faithful visual reading[\s\S]*$/g, '')
        .replace(/The user attached \d+ images\. The following are faithful visual readings[\s\S]*$/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    function cleanComposerDraft(props) {
      const draft = currentDraft(props)
      const next = stripMentionArtifacts(draft)
      if (next !== draft) setComposerDraft(props, next)
    }

    function filePreviewUrl(props, file) {
      if (fileKind(file.name || file.relativePath) !== 'image') return ''
      const cwd = workspaceCwd(props)
      if (!cwd || !file.path) return ''
      return `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}`
    }

    function attachKey(item) {
      return String(item.path || item.relativePath || item.ref || item.name || '').replace(/\\/g, '/')
    }

    async function loadAttachmentContent(cwd, item) {
      const name = item.name || String(item.path || item.relativePath || '').split(/[\\/]/).pop()
      const kind = item.kind || fileKind(name)
      return Object.assign({}, item, {
        loaded: true,
        kind,
        previewUrl: item.previewUrl || (kind === 'image' ? filePreviewUrl({ }, Object.assign({}, item, { name })) : item.previewUrl),
      })
    }

    function workspaceRel(file) {
      let rel = String((file && (file.relativePath || file.ref || file.path || file.name)) || '').replace(/\\/g, '/')
      const cwd = String(workspaceCwd() || '').replace(/\\/g, '/').replace(/\/+$/, '')
      if (cwd && rel.length > cwd.length && rel.slice(0, cwd.length).toLowerCase() === cwd.toLowerCase() && rel.charAt(cwd.length) === '/') {
        rel = rel.slice(cwd.length + 1)
      }
      return rel
    }

    function mentionToken(file) {
      const rel = workspaceRel(file)
      if (!rel) return ''
      return /[\s"'`]/.test(rel) ? '@"' + rel + '"' : '@' + rel
    }

    function formatAttachVisible(items) {
      const tokens = []
      for (const item of items || []) {
        if (!item || item.kind === 'image') continue
        const token = mentionToken(item)
        if (token && tokens.indexOf(token) < 0) tokens.push(token)
      }
      return tokens.join(' ')
    }

    function stripComposerMentions(files) {
      if (attachSubmitLock) return
      const live = composerPropsRef.current
      const codexPhase = codexTurnPhase(live)
      if (codexPhase === 'preparing' || codexPhase === 'submitting') return
      let draft = currentDraft(live)
      if (!draft) {
        const ta = document.querySelector('[data-composer-card] textarea, [data-phase] textarea')
        draft = ta && typeof ta.value === 'string' ? ta.value : ''
      }
      if (!draft) return
      let next = draft
      for (const file of files || []) {
        const token = mentionToken(file)
        if (token) next = next.split(token).join('')
        const rel = String((file && (file.relativePath || file.ref || file.path || '')) || '').replace(/\\/g, '/')
        if (rel) {
          next = next.split('@"' + rel + '"').join('')
          next = next.split('@' + rel).join('')
        }
      }
      next = next
        .replace(/@"(?:Agent Pi Outputs|Official Outputs|工作成果)\/[^"\n]+"/g, '')
        .replace(/[ \t]*\n{2,}/g, '\n')
        .replace(/^[ \t\n]+|[ \t\n]+$/g, '')
      if (next !== draft) setComposerDraft(live, next)
    }

    function attachItemsToComposer(props, items, source) {
      const list = (items || []).filter((item) => item && (item.relativePath || item.ref || item.path || item.name))
      if (!list.length) return
      try {
      const live = snapshotComposer()
      const sid = sessionHint(live) || sessionHint(props) || runtime.sessionId || 'pending'
      const cwd = runtime.cwd
      stripComposerMentions(list)
      cleanComposerDraft(live)
      const incoming = list.map((item) => ({
        id: item.id || attachKey(item) + ':' + Date.now(),
        relativePath: String(item.relativePath || item.ref || item.path || item.name || '').replace(/\\/g, '/'),
        path: item.path || '',
        name: item.name || String(item.relativePath || item.path || item.name || '').split(/[\\/]/).pop(),
        kind: item.kind || fileKind(item.name),
        previewUrl: item.previewUrl || '',
        uploaded: !!item.uploaded,
        loaded: true,
        text: item.text || '',
        size: item.size,
        cwd: item.cwd || cwd || '',
        sessionId: sid,
        file: item.file,
      }))
      const visual = incoming.filter((item) => item.kind === 'image')
      const docs = incoming.filter((item) => item.kind !== 'image')
      if (visual.length) {
        Promise.all(visual.map(async (item) => {
          if (item.file) return item.file
          const url = item.previewUrl || (cwd && item.path
            ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(item.path)}`
            : '')
          if (!url) return null
          const blob = await fetch(url).then((res) => {
            if (!res.ok) throw new Error(res.statusText)
            return res.blob()
          })
          return new File([blob], item.name, { type: blob.type || 'image/png' })
        })).then((files) => attachNativeImages(live, files.filter(Boolean)))
          .catch((err) => showToast(String(err && err.message || err)))
          .finally(() => revealComposerAfterAttach())
      }
      if (!docs.length) {
        if (!visual.length) showToast('该文件已在对话栏中')
        if (!visual.length) revealComposerAfterAttach()
        return
      }
      const merged = (attachState.items || attachItemsOf(sid) || []).slice()
      const added = []
      for (const item of docs) {
        const key = attachKey(item)
        if (key && merged.some((row) => attachKey(row) === key || (row.name && row.name === item.name && row.kind === item.kind))) continue
        merged.push(item)
        added.push(item)
      }
      if (!added.length) {
        if (!visual.length) showToast('该文件已在对话栏中')
        revealComposerAfterAttach()
        return
      }
      setAttachItemsFor(sid, merged)
      if (runtime.sessionId && runtime.sessionId !== sid) {
        attachState.bySession.set(runtime.sessionId, merged)
      }
      stripComposerMentions(merged)
      if (source === 'folder') {
        showToast(added.length === 1 ? '已加入文件夹：' + added[0].name : '已加入 ' + added.length + ' 个文件夹')
      } else if (source === 'upload') {
        showToast(added.length === 1 ? '已加入对话：' + added[0].name : '已加入对话 ' + added.length + ' 个文件')
      } else {
        showToast(added.length === 1 ? '已注入对话：' + added[0].name : '已注入对话 ' + added.length + ' 个文件')
      }
      revealComposerAfterAttach()
      } catch (err) {
        const msg = String(err && err.message || err)
        showToast(/#321|Invalid hook call/i.test(msg)
          ? '加入对话失败，请先点菜单「视图 → 刷新」再试'
          : msg)
      }
    }

    function restoreCleanDraft(props) {
      const draft = stripMentionArtifacts(currentDraft(props))
      if (draft !== currentDraft(props)) setComposerDraft(props, draft)
      return draft
    }

    let foldBusy = false
    let attachSubmitLock = false
    function isLiveSessionId(sid) {
      return Boolean(sid) && sid !== 'pending' && sid !== 'active'
    }
    async function foldAttachmentsIntoDraft(props, capturedItems) {
      const sid = attachSessionId(props) || runtime.sessionId || ''
      const cwd = workspaceCwd(props)
      const items = (capturedItems || (attachState.items || attachItemsOf(sid))).filter((item) => !item.cwd || !cwd || normPath(item.cwd) === normPath(cwd))
      if (!items.length || foldBusy) return false
      foldBusy = true
      restoreCleanDraft(props)
      try {
        const files = items.filter((item) => item.kind !== 'image' && item.kind !== 'folder' && (item.path || item.relativePath || item.name))
        const folders = items.filter((item) => item.kind === 'folder' && (item.path || item.relativePath))
        if (!files.length && !folders.length) return true
        if (!isLiveSessionId(sid) || !cwd) {
          showToast('当前会话没有工作区，无法把附件交给模型')
          throw new Error('session workspace required')
        }
        await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(sid), cwd, {
          method: 'POST',
          body: JSON.stringify({
            sessionId: sid,
            cwd,
            files: files.map((item) => ({
              name: item.name,
              path: item.path || item.relativePath,
              relativePath: item.relativePath || item.path,
              kind: 'file',
            })),
            folders: folders.map((item) => ({
              name: item.name,
              path: item.path || item.relativePath,
            })),
            images: [],
          }),
        })
        return true
      } catch (err) {
        showToast(String(err && err.message || err))
        throw err
      } finally {
        foldBusy = false
      }
    }

    function buildCodexTurnDelegation(task) {
      const original = String(task || '').trim()
      if (!original) throw new Error('Codex delegation requires a non-empty task')
      return `【Codex 执行模式】
你是 DSH 主智能体。必须立即调用 subagent_codex，将 run_in_background=false；不要先自行完成任务。请把下方用户任务、明确文件路径、必要上下文和验收目标整理成独立委派，等待 Codex 完成，核验实际结果后再向用户汇报。

【用户原始任务】
${original}`
    }

    function submitAfterFold(props, submit) {
      const sid = sessionHint(props) || runtime.sessionId || 'active'
      const clean = stripMentionArtifacts(currentDraft(props))
      const items = attachItemsOf(attachSessionId(props))
      const attachLine = formatAttachVisible(items)
      const block = formatKbTaskBlock(sid)
      const fallback = items.length ? '请结合附件作答。' : ''
      const body = [clean, attachLine].filter(Boolean).join('\n\n')
      const text = block
        ? (body ? block + '\n\n' + body : block + (fallback ? '\n\n' + fallback : ''))
        : (body || fallback)
      attachSubmitLock = true
      if (!text) {
        const send = typeof submit === 'function'
          ? submit
          : (props && props.inputActions && props.inputActions.__apOrigSubmit)
        if (typeof send === 'function') send()
        attachSubmitLock = false
        setAttachItems([], props)
        return
      }
      setComposerDraft(props, text)
      requestAnimationFrame(() => {
        const send = typeof submit === 'function'
          ? submit
          : (props && props.inputActions && props.inputActions.__apOrigSubmit)
        if (typeof send === 'function') send()
        window.setTimeout(() => {
          attachSubmitLock = false
          setAttachItems([], props)
        }, 280)
      })
    }

    function foldAndSubmit(props) {
      foldAttachmentsIntoDraft(props).then((folded) => {
        if (folded) submitAfterFold(props)
      }).catch(() => {})
    }

    function failCodexPreparation(key, token, message) {
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'preparing' || controller.attemptToken !== token) return
      rearmCodexTurn(key, controller)
      if (message) showToast(message)
    }

    function codexPreparedDraft(key, controller) {
      const clean = stripMentionArtifacts(controller.originalDraft)
      const items = controller.capturedAttachments
      const attachLine = formatAttachVisible(items)
      const block = formatKbTaskBlock(key)
      const fallback = items.length ? '请结合附件作答。' : ''
      const body = [clean, attachLine].filter(Boolean).join('\n\n')
      const text = block
        ? (body ? block + '\n\n' + body : block + (fallback ? '\n\n' + fallback : ''))
        : (body || fallback)
      return buildCodexTurnDelegation(text)
    }

    async function prepareCodexTurn(key, token) {
      const desktop = window.agentPiDesktop
      try {
        const status = !desktop || typeof desktop.codexAuthStatus !== 'function'
          ? null
          : await desktop.codexAuthStatus()
        if (!status || status.available !== true || status.state !== 'logged-in') throw new Error('Codex unavailable')
      } catch {
        failCodexPreparation(key, token, 'Codex 尚未登录或运行时不可用，请到设置 → Codex 智能体完成登录。')
        return
      }
      let prepared = preparingCodexTurn(key, token)
      if (!prepared) return
      const items = prepared.controller.capturedAttachments
      const cwd = prepared.live && prepared.live.cwd || workspaceCwd(prepared.live)
      const files = items.filter((item) => item.kind !== 'image' && item.kind !== 'folder' && (item.path || item.relativePath || item.name))
      const folders = items.filter((item) => item.kind === 'folder' && (item.path || item.relativePath))
      if (files.length || folders.length) {
        if (!isLiveSessionId(key) || !cwd) {
          failCodexPreparation(key, token, '当前会话没有工作区，无法把附件交给模型')
          return
        }
        try {
          await api('/api/agent-pi/llm/vision/read?sessionId=' + encodeURIComponent(key), cwd, {
            method: 'POST',
            body: JSON.stringify({
              sessionId: key,
              cwd,
              files: files.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
                relativePath: item.relativePath || item.path,
                kind: 'file',
              })),
              folders: folders.map((item) => ({
                name: item.name,
                path: item.path || item.relativePath,
              })),
              images: [],
            }),
          })
        } catch (err) {
          failCodexPreparation(key, token, String(err && err.message || err))
          return
        }
        prepared = preparingCodexTurn(key, token)
        if (!prepared) return
      }
      try {
        prepared.controller.framedDraft = codexPreparedDraft(key, prepared.controller)
        requestAnimationFrame(() => commitCodexTurn(key, token))
      } catch {
        failCodexPreparation(key, token)
      }
    }

    function commitCodexTurn(key, token) {
      const prepared = preparingCodexTurn(key, token)
      if (!prepared) return
      const controller = prepared.controller
      const inputStore = prepared.inputStore
      try {
        if (typeof inputStore.subscribe !== 'function' || !watchCodexTurnSession(key, controller)) throw new Error('Codex settlement subscriptions unavailable')
        const actions = prepared.live && prepared.live.inputActions
        const submit = actions && actions.__apOrigSubmit
        if (typeof submit !== 'function') throw new Error('Codex original submit unavailable')
        controller.preSubmitUserNodeWatermark = codexUserNodeWatermark(prepared.sessionSnapshot)
        controller.phase = 'submitting'
        setComposerDraft(prepared.live, controller.framedDraft)
        const inputSnapshot = inputStore.getSnapshot()
        controller.lastInputPhase = inputSnapshot && inputSnapshot.phase
        controller.lastInputDraftRev = inputSnapshot && typeof inputSnapshot.draftRev === 'number' ? inputSnapshot.draftRev : null
        controller.sawSubmitting = controller.lastInputPhase === 'submitting'
        notifyCodexTurn()
        token.settlementReady = false
        token.settlementQueued = false
        const onSettlement = () => {
          if (!token.settlementReady) {
            token.settlementQueued = true
            return
          }
          settleCodexTurn(key, token)
        }
        const unsubscribeInput = inputStore.subscribe(onSettlement)
        if (typeof unsubscribeInput !== 'function') throw new Error('Codex input settlement subscription unavailable')
        controller.unsubscribeInput = unsubscribeInput
        token.settlementReady = true
        submit()
        if (token.settlementQueued) settleCodexTurn(key, token)
      } catch {
        failCodexTurn(key, controller, inputStore)
      }
    }

    function submitCodexTurn(props) {
      const key = codexTurnKey(props)
      const controller = codexTurnControllers.get(key)
      if (!controller || controller.phase !== 'armed') return
      controller.latestProps = props
      let authorities
      let sessionSnapshot
      let inputSnapshot
      try {
        authorities = codexTurnAuthorities(key)
        if (!authorities) {
          disposeCodexTurn(key, controller)
          return
        }
        if (!authorities.session || typeof authorities.session.getSnapshot !== 'function'
          || !authorities.inputStore || typeof authorities.inputStore.getSnapshot !== 'function') return
        sessionSnapshot = authorities.session.getSnapshot()
        inputSnapshot = authorities.inputStore.getSnapshot()
      } catch {
        return
      }
      if (sessionSnapshot && sessionSnapshot.removed === true) {
        disposeCodexTurn(key, controller)
        return
      }
      if (!sessionSnapshot || !inputSnapshot || inputSnapshot.phase !== 'plain' || typeof inputSnapshot.draft !== 'string') return
      const attachments = codexAttachItems(key).slice()
      const token = {}
      controller.phase = 'preparing'
      controller.attemptToken = token
      controller.originalDraft = inputSnapshot.draft
      controller.framedDraft = ''
      controller.capturedAttachments = attachments
      controller.capturedAttachmentIds = codexAttachmentIds(attachments)
      controller.preSubmitUserNodeWatermark = -1
      notifyCodexTurn()
      void prepareCodexTurn(key, token)
    }

    function wrapComposerSubmit(props) {
      const actions = props && props.inputActions
      if (!actions || typeof actions.submit !== 'function') return
      actions.__apLatestProps = props
      trackCodexTurnProps(props)
      if (actions.__apFoldWrapped) return
      const orig = actions.submit.bind(actions)
      actions.__apOrigSubmit = orig
      actions.submit = () => {
        const live = actions.__apLatestProps || props
        if (codexTurnArmed(live)) {
          submitCodexTurn(live)
          return
        }
        const before = currentDraft(live)
        restoreCleanDraft(live)
        const sid = sessionHint(live) || runtime.sessionId || 'active'
        const hasAttach = attachItemsOf(attachSessionId(live)).length > 0
        const hasKb = kbTaskOf(sid).slugs.length > 0
        if (hasAttach) {
          foldAttachmentsIntoDraft(live).then((folded) => {
            if (folded) submitAfterFold(live, orig)
          }).catch(() => {})
          return
        }
        if (hasKb && stripMentionArtifacts(currentDraft(live))) {
          submitAfterFold(live, orig)
          return
        }
        if (stripMentionArtifacts(before) !== before) {
          requestAnimationFrame(() => orig())
          return
        }
        orig()
      }
      actions.__apFoldWrapped = true
    }

    function dropNativeImages(files) {
      try {
        const dt = new DataTransfer()
        files.forEach((file) => dt.items.add(file))
        document.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
        return true
      } catch {
        return false
      }
    }

    function nativeImageMime(file) {
      const type = String(file && file.type || '').toLowerCase()
      if (type === 'image/png' || type === 'image/jpeg' || type === 'image/webp' || type === 'image/gif') return type
      const ext = String(file && file.name || '').split('.').pop().toLowerCase()
      if (ext === 'png') return 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
      if (ext === 'webp') return 'image/webp'
      if (ext === 'gif') return 'image/gif'
      return ''
    }

    async function asNativeImageFile(file) {
      if (!file) return null
      const mime = nativeImageMime(file)
      if (mime) {
        if (mime === file.type) return file
        const ext = mime === 'image/jpeg' ? '.jpg' : '.' + mime.slice('image/'.length)
        return new File([file], String(file.name || 'image').replace(/\.[^.]+$/, ext), { type: mime })
      }
      try {
        const bitmap = await createImageBitmap(file)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap.close()
        const blob = await new Promise((resolveBlob) => canvas.toBlob(resolveBlob, 'image/jpeg', 0.86))
        if (!blob) return null
        return new File([blob], String(file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
      } catch {
        return null
      }
    }

    function addNativeImageFiles(props, files) {
      const list = (files || []).filter(Boolean)
      if (!list.length) return false
      const conversation = runtime.conversation
      const actions = props && props.inputActions
      if (conversation && typeof conversation.createDraftImages === 'function' && actions && typeof actions.addImages === 'function') {
        try {
          const images = conversation.createDraftImages(list)
          if (!actions.addImages(images.map((row) => row.id))) {
            if (typeof conversation.releaseDraftImages === 'function') conversation.releaseDraftImages(images)
            showToast('无法加入图片（可能超出张数或大小限制）')
            return false
          }
          showToast(list.length === 1 ? '已加入图片 ' + list[0].name : '已加入 ' + list.length + ' 张图片')
          return true
        } catch (err) {
          showToast(String(err && err.message || err))
        }
      }
      if (dropNativeImages(list)) {
        showToast(list.length === 1 ? '已加入图片 ' + list[0].name : '已加入 ' + list.length + ' 张图片')
        return true
      }
      showToast('图片未能加入输入框，请把图片直接拖到输入框重试。')
      return false
    }

    async function attachNativeImages(props, imageFiles) {
      const native = []
      for (const file of imageFiles || []) {
        const converted = await asNativeImageFile(file)
        if (converted) native.push(converted)
        else showToast('不支持的图片格式：' + (file && file.name || 'image'))
      }
      if (native.length) addNativeImageFiles(props, native)
      return native.length
    }

    function snapshotFileList(fileList) {
      return Array.from(fileList || [])
    }

    function attachUploadedItems(props, items, imageFiles) {
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      const live = snapshotComposer()
      const dockItems = (items || []).filter((item) => item.kind !== 'image')
      if (imageFiles && imageFiles.length) {
        attachNativeImages(live, imageFiles).catch((err) => {
          showToast(String(err && err.message || err))
        })
      }
      if (!dockItems.length) return
      attachItemsToComposer(live, dockItems, 'upload')
    }

    function attachDiskPaths(props, paths, source) {
      const items = (paths || []).filter(Boolean).map((path) => {
        const name = folderNameOf(path)
        return {
          id: path + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
          relativePath: String(path).replace(/\\/g, '/'),
          path: path,
          name: name,
          kind: fileKind(name),
          loaded: true,
        }
      })
      attachItemsToComposer(snapshotComposer(), items, source || 'upload')
    }

    function mergeImportedItems(props, imported) {
      const sid = resolveSessionId(props) || resolveSessionId(composerPropsRef.current) || runtime.sessionId || 'pending'
      const current = (attachState.items || []).slice()
      for (const item of imported || []) {
        const idx = current.findIndex((row) => row.name === item.name && row.kind === item.kind)
        if (idx >= 0) current[idx] = Object.assign({}, current[idx], item)
        else if (!current.some((row) => attachKey(row) === attachKey(item))) current.push(item)
      }
      setAttachItemsFor(sid, current)
    }

    async function uploadFileList(cwd, fileList, props) {
      const files = snapshotFileList(fileList)
      if (!files.length) {
        showToast('没有选中文件')
        return 0
      }
      attachItemsToComposer(snapshotComposer(), files.map((file) => ({
        id: (file.webkitRelativePath || file.name) + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
        relativePath: String(file.webkitRelativePath || file.name).replace(/\\/g, '/'),
        path: '',
        name: file.name,
        kind: fileKind(file.name, file.type),
        previewUrl: fileKind(file.name, file.type) === 'image' ? URL.createObjectURL(file) : '',
        uploaded: false,
        loaded: true,
        size: file.size,
        file: file,
      })), 'upload')
      if (!cwd) return files.length
      const items = []
      const imageFiles = []
      for (const file of files) {
        const rel = file.webkitRelativePath || file.name
        try {
          const saved = await uploadBytes(cwd, rel, file)
          const relativePath = ((saved && saved.relativePath) || ('Agent Pi Uploads/' + String(rel).replace(/\\/g, '/'))).replace(/\\/g, '/')
          const kind = fileKind(file.name, file.type)
          items.push({
            id: relativePath + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
            relativePath: relativePath,
            path: saved && saved.path,
            name: file.name,
            kind: kind,
            previewUrl: kind === 'image' ? URL.createObjectURL(file) : '',
            uploaded: true,
            loaded: true,
            size: file.size,
            cwd,
            sessionId: resolveSessionId(props),
          })
          if (kind === 'image') imageFiles.push(file)
        } catch (err) {
          showToast('已加入对话，但未能写入工作区：' + String(err && err.message || err))
        }
      }
      if (items.length) mergeImportedItems(snapshotComposer(), items)
      if (imageFiles.length) attachNativeImages(snapshotComposer(), imageFiles).catch((err) => showToast(String(err && err.message || err)))
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      return files.length
    }

    async function importDiskPaths(cwd, paths, props) {
      if (!cwd) return 0
      const list = (paths || []).filter(Boolean)
      if (!list.length) return 0
      const body = await api('/api/agent-pi/files/import', cwd, {
        method: 'POST',
        body: JSON.stringify({ paths: list }),
      })
      const files = body.files || []
      if (!files.length) return 0
      const items = files.map((file) => {
        const name = file.name || String(file.relativePath || '').split(/[\\/]/).pop()
        const kind = fileKind(name)
        return {
          id: (file.relativePath || name) + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7),
          relativePath: String(file.relativePath || '').replace(/\\/g, '/'),
          path: file.path,
          name: name,
          kind: kind,
          cwd,
          sessionId: resolveSessionId(props),
          previewUrl: kind === 'image' && file.path
            ? `/api/agent-pi/files/raw?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(file.path)}`
            : '',
          uploaded: true,
          loaded: true,
          size: file.size,
        }
      })
      mergeImportedItems(props, items)
      window.dispatchEvent(new Event('agent-pi-files-changed'))
      return files.length
    }

    async function chooseAndUpload(cwd, props, mode, inputs) {
      const live = snapshotComposer()
      if (mode === 'folder') {
        await chooseFolderForChat(cwd, live)
        return
      }
      const desktop = desktopApi()
      try {
        if (desktop && typeof desktop.pickFiles === 'function') {
          const paths = normalizePickedPaths(await desktop.pickFiles())
          if (!paths.length) return
          attachDiskPaths(live, paths, 'upload')
          if (cwd) {
            importDiskPaths(cwd, paths, live).catch((err) => {
              showToast('文件已加入对话，但未能拷进工作区：' + String(err && err.message || err))
            })
          }
          return
        }
      } catch (err) {
        showToast('选择文件失败：' + String(err && err.message || err))
        return
      }
      const input = inputs && inputs.fileInput
      if (input && input.current) input.current.click()
      else showToast('无法打开系统文件选择框，请改用右侧资源文件的「注入对话」')
    }

    function attachFolderPath(props, dir) {
      const path = String(dir || '').trim()
      if (!path) return
      const name = folderNameOf(path)
      attachItemsToComposer(snapshotComposer(), [{
        id: 'folder:' + path + ':' + Date.now(),
        relativePath: path,
        path: path,
        name: name,
        kind: 'folder',
      }], 'folder')
    }

    async function chooseFolderForChat(_cwd, props) {
      const live = snapshotComposer()
      const desktop = desktopApi()
      if (desktop && typeof desktop.pickFolder === 'function') {
        try {
          const dir = await desktop.pickFolder()
          if (dir) attachFolderPath(live, dir)
          return
        } catch (err) {
          showToast('选择文件夹失败：' + String(err && err.message || err))
        }
      }
      const input = document.createElement('input')
      input.type = 'file'
      input.setAttribute('webkitdirectory', '')
      input.setAttribute('directory', '')
      input.multiple = true
      input.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none'
      input.addEventListener('change', () => {
        const files = snapshotFileList(input.files)
        input.remove()
        if (!files.length) return
        const rel = String(files[0].webkitRelativePath || files[0].name)
        attachFolderPath(live, rel.split(/[\\/]/)[0] || 'folder')
      })
      document.body.appendChild(input)
      input.click()
    }

    function mentionInChat(props, file) {
      if (file && file.type === 'directory') {
        attachFolderPath(props, file.path || file.relativePath)
        return
      }
      const rel = (file.relativePath || file.path || '').replace(/\\/g, '/')
      const name = file.name || rel.split(/[\\/]/).pop() || rel
      const items = [{
        id: rel + ':' + Date.now(),
        relativePath: rel,
        path: file.path,
        name: name,
        kind: fileKind(name),
        previewUrl: filePreviewUrl(props, file),
        size: file.size,
      }]
      stripComposerMentions([{ relativePath: rel, path: file.path, name: name }])
      attachItemsToComposer(snapshotComposer(), items, 'mention')
    }

    function FileContextMenu(props) {
      const menu = props.menu
      React.useEffect(() => {
        if (!menu) return undefined
        let armed = false
        const arm = window.setTimeout(() => { armed = true }, 280)
        const close = (event) => {
          if (!armed || (event && event.button === 2)) return
          const node = event && event.target
          if (node && node.closest && node.closest('.ap-menu')) return
          props.onClose()
        }
        window.addEventListener('pointerdown', close, true)
        return () => {
          window.clearTimeout(arm)
          window.removeEventListener('pointerdown', close, true)
        }
      }, [menu && menu.x, menu && menu.y, menu && menu.file])
      if (!menu) return null
      const node = h('div', {
        className: 'ap-menu',
        style: { left: menu.x + 'px', top: menu.y + 'px' },
        onClick: (e) => e.stopPropagation(),
        onContextMenu: (e) => e.stopPropagation(),
      }, props.children)
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function readReasoningEffort() {
      const label = readComposerModelLabel()
      if (/\bmax\b/i.test(label)) return 'max'
      if (/\bhigh\b/i.test(label)) return 'high'
      if (/\bmedium\b/i.test(label)) return 'medium'
      if (/\blow\b/i.test(label)) return 'low'
      return undefined
    }

    function readComposerModelLabel() {
      const seat = document.querySelector('[data-slot="conversation.input.model"]')
      return seat ? String(seat.textContent || '').replace(/\s+/g, ' ').trim() : ''
    }

    function sourceLabel(source) {
      if (source === 'official-output') return langState.lang === 'en' ? 'Official' : '正式'
      if (source === 'attachment') return langState.lang === 'en' ? 'Upload' : '上传'
      if (source === 'tender-workspace') return langState.lang === 'en' ? 'Project' : '项目'
      return null
    }

    function displayFileName(file) {
      if (file.source === 'official-output' && (file.name === 'Official Outputs' || file.name === '工作成果')) return tAp('files.officialName')
      if (file.source === 'attachment' && (file.name === '上传资料' || file.name === 'Agent Pi Uploads')) return tAp('files.uploads')
      return file.name
    }

    function fileIconMeta(file) {
      if (file.type === 'directory') return { name: 'folder', klass: 'ap-fico-folder' }
      const raw = String(file.name || file.path || '')
      const base = raw.split(/[\\/]/).pop() || raw
      const dot = base.lastIndexOf('.')
      const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
      if (ext === 'md' || ext === 'markdown') return { name: 'fileMd', klass: 'ap-fico-md' }
      if (ext === 'txt' || ext === 'log') return { name: 'fileText', klass: 'ap-fico-txt' }
      if (ext === 'json' || ext === 'jsonl') return { name: 'fileJson', klass: 'ap-fico-json' }
      if (ext === 'xls' || ext === 'xlsx' || ext === 'csv' || ext === 'tsv' || ext === 'univer') return { name: 'fileSheet', klass: 'ap-fico-sheet' }
      if (ext === 'doc' || ext === 'docx') return { name: 'fileWord', klass: 'ap-fico-word' }
      if (ext === 'ppt' || ext === 'pptx') return { name: 'filePpt', klass: 'ap-fico-ppt' }
      if (ext === 'pdf') return { name: 'filePdf', klass: 'ap-fico-pdf' }
      if (ext === 'html' || ext === 'htm') return { name: 'fileHtml', klass: 'ap-fico-html' }
      if (/^(png|jpe?g|gif|webp|bmp|svg|ico)$/.test(ext)) return { name: 'image', klass: 'ap-fico-img' }
      return { name: 'file', klass: 'ap-fico-file' }
    }

    function fileIconName(file) {
      return fileIconMeta(file).name
    }

    function fileIconClass(file) {
      return fileIconMeta(file).klass
    }

    function formatKbBytes(n) {
      const value = Number(n) || 0
      if (value < 1024) return value + ' B'
      if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
      return (value / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function importWorkspaceFileToKb(cwd, file, props) {
      const packLike = looksLikeKbPackName(file)
      if (!file || (file.type === 'directory' && !packLike)) {
        showToast('请选文件，或选含 pack.json 的知识包文件夹')
        return Promise.resolve()
      }
      const path = String(file.path || '').trim()
      if (!path) {
        showToast('这个文件没有磁盘路径')
        return Promise.resolve()
      }
      const sessionId = resolveSessionId(props) || runtime.sessionId || 'active'
      const action = packLike ? 'import-pack' : 'stage'
      return api('/api/agent-pi/kb', cwd, {
        method: 'POST',
        body: JSON.stringify({
          action,
          path,
          sessionId,
          category: looksLikeUserTemplateName(file.name || path) ? '用户模板' : '规范',
        }),
      }).then((staged) => {
        const slug = staged && staged.entry && staged.entry.slug
        if (!slug) throw new Error('落入知识库失败')
        if (staged.entry && staged.entry.parseStatus === 'ready') {
          const asTemplate = staged.entry.category === '用户模板' || staged.entry.category === '用户模版'
          showToast((packLike ? '知识包已入库：' : (asTemplate ? '已加入知识库（用户模板）：' : '已加入知识库：')) + (file.name || slug))
          window.dispatchEvent(new CustomEvent('agent-pi-kb-changed'))
          return
        }
        return api('/api/agent-pi/kb', cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'parse', slug, sessionId }),
        }).then(() => {
          showToast('已加入知识库并开始解析：' + (file.name || slug))
          window.dispatchEvent(new CustomEvent('agent-pi-kb-changed'))
        })
      }).catch((err) => {
        showToast('导入知识库失败：' + String(err && err.message || err))
      })
    }

    function kbTitle(entry) {
      const raw = String((entry && (entry.title || entry.originalName || entry.name)) || '')
      const base = raw.replace(/^.*[\\/]/, '')
      if (!base || /^full\.md$/i.test(base)) return base || (entry && entry.slug) || '文档'
      return base.replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '') || base
    }

    function statusChip(status) {
      if (status === 'blocked') return h('span', { className: 'ap-chip warn' }, '门禁未过')
      if (status === 'done') return h('span', { className: 'ap-chip ok' }, '已完成')
      if (status === 'running') return h('span', { className: 'ap-chip live' }, '进行中')
      return null
    }

    function FilePickPanel(props) {
      const cwd = props.cwd
      const selected = props.selected || []
      const [nodes, setNodes] = React.useState([])
      const [extra, setExtra] = React.useState('')
      const selectedSet = React.useMemo(() => new Set(selected), [selected])

      React.useEffect(() => {
        if (!cwd) return
        api('/api/agent-pi/files', cwd, { method: 'GET' })
          .then((body) => setNodes(body.files || []))
          .catch(() => setNodes([]))
      }, [cwd])

      const expand = (node) => {
        if (node.type !== 'directory') return
        api('/api/agent-pi/files?parentPath=' + encodeURIComponent(node.path), cwd, { method: 'GET' })
          .then((body) => setNodes((current) => replaceChildren(current, node.path, body.files || [])))
          .catch(() => {})
      }

      const renderNode = (node, depth) => {
        const on = selectedSet.has(node.path)
        return h('div', { key: node.path },
          h('button', {
            type: 'button',
            className: 'ap-tree-btn' + (on ? ' on' : ''),
            style: { paddingLeft: 6 + depth * 10 },
            onClick: () => {
              if (node.type === 'directory') expand(node)
              else props.onToggle(node.path, node.name)
            },
          },
            Icon(node.type === 'directory' ? 'folder' : 'file', 13),
            h('span', { className: 'ap-tree-name', title: node.path }, node.name),
            node.type !== 'directory' && on ? h('span', { className: 'ap-chip ok' }, '已选') : null,
          ),
          node.children && node.children.length
            ? h('div', { className: 'ap-tree-kids' }, node.children.map((child) => renderNode(child, depth + 1)))
            : null,
        )
      }

      const desktop = desktopApi()
      return h('div', null,
        h('p', { className: 'ap-sub' }, '只登记本次明确选择的文件。系统不会把项目工作目录自动当作资料库扫描。'),
        h('p', { className: 'ap-sub' }, '可同时附企业工效表（文件名含「工效 / productivity / 日产」）。有企业工效时优先于网络调研；组价稿里改过的工效和关键资源价，保存确认后落成该项目人工复核准确数并全局重算数量。'),
        h('div', { className: 'ap-row', style: { margin: '8px 0' } },
          desktop && typeof desktop.pickFiles === 'function'
            ? h('button', {
              type: 'button',
              className: 'ap-btn',
              onClick: () => {
                desktop.pickFiles().then((paths) => {
                  normalizePickedPaths(paths).forEach((path) => props.onToggle(path, fileName(path), true))
                })
              },
            }, Icon('filePlus', 14), '添加依据和待分析文件')
            : null,
        ),
        h('div', { className: 'ap-tree-pick' },
          nodes.length ? nodes.map((node) => renderNode(node, 0)) : h('div', { className: 'ap-files-empty' }, '工作区内暂无可选文件'),
        ),
        h('label', null, '或粘贴绝对路径（每行一个）'),
        h('input', {
          value: extra,
          placeholder: 'C:\\\\path\\\\to\\\\file.pdf',
          onChange: (e) => setExtra(e.target.value),
          onKeyDown: (e) => {
            if (e.key === 'Enter' && extra.trim()) {
              extra.split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((path) => props.onToggle(path, fileName(path), true))
              setExtra('')
            }
          },
        }),
        selected.length
          ? h('div', { style: { marginTop: 8 } }, selected.map((path) => h('div', { className: 'ap-file-item', key: path },
            h('span', { title: path }, fileName(path)),
            h('button', { type: 'button', className: 'ap-btn ghost', onClick: () => props.onToggle(path) }, '移除'),
          )))
          : h('p', { className: 'ap-sub' }, '可暂不添加，进入项目后继续上传。'),
      )
    }

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

    function joinSlugs(value) {
      return Array.isArray(value) ? value.filter(Boolean).join(', ') : ''
    }
    function splitSlugs(value) {
      return String(value || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean)
    }
    function blankStage(index) {
      return {
        id: 'stage-' + String(index + 1),
        label: '',
        labelZh: '新阶段',
        hintZh: '',
        prompt: '写明这一步要完成什么、交出什么成果。',
        skillSlugs: '',
        reviewSkillSlugs: '',
        listsSources: false,
        binding: '',
        summaryFile: '',
        summaryOutline: '',
      }
    }
    function workflowToDraft(row) {
      const workflow = (row && row.workflow) || {}
      const binding = workflow.bindingAreaByStage || {}
      const stages = Array.isArray(workflow.stages) ? workflow.stages : []
      return {
        id: row.id,
        label: workflow.label || row.label || '',
        labelZh: workflow.labelZh || row.labelZh || moduleLabel(row),
        icon: row.icon || '',
        setupStageId: workflow.setupStageId || (stages[0] && stages[0].id) || '',
        kbPack: {
          analysis: ((workflow.kbPack && workflow.kbPack.analysis) || []).slice(),
          pricing: ((workflow.kbPack && workflow.kbPack.pricing) || []).slice(),
          planning: ((workflow.kbPack && workflow.kbPack.planning) || []).slice(),
        },
        useOwnKbPack: Boolean(workflow.kbPack),
        stages: stages.map((stage, index) => ({
          id: stage.id || ('stage-' + (index + 1)),
          label: stage.label || '',
          labelZh: stage.labelZh || stage.label || '',
          hintZh: stage.hintZh || '',
          prompt: stage.prompt || '',
          skillSlugs: joinSlugs(stage.skillSlugs),
          reviewSkillSlugs: joinSlugs(stage.reviewSkillSlugs),
          listsSources: !!stage.listsSources,
          binding: binding[stage.id] || '',
          summaryFile: (stage.summaryDeliverable && stage.summaryDeliverable.fileName) || '',
          summaryOutline: ((stage.summaryDeliverable && stage.summaryDeliverable.outlineZh) || []).join('\n'),
        })),
      }
    }
    function draftToDefinition(draft) {
      const bindingAreaByStage = {}
      const stages = (draft.stages || []).map((stage) => {
        const id = String(stage.id || '').trim()
        if (stage.binding === 'analysis' || stage.binding === 'pricing' || stage.binding === 'planning') {
          bindingAreaByStage[id] = stage.binding
        }
        const outline = String(stage.summaryOutline || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        const fileName = String(stage.summaryFile || '').trim()
        return {
          id,
          label: String(stage.label || '').trim() || undefined,
          labelZh: String(stage.labelZh || '').trim(),
          hintZh: String(stage.hintZh || '').trim() || undefined,
          prompt: String(stage.prompt || '').trim(),
          skillSlugs: splitSlugs(stage.skillSlugs),
          reviewSkillSlugs: splitSlugs(stage.reviewSkillSlugs),
          listsSources: stage.listsSources ? true : undefined,
          summaryDeliverable: fileName
            ? { fileName, outlineZh: outline.length ? outline : ['待补大纲'] }
            : undefined,
        }
      })
      return {
        schemaVersion: 1,
        id: draft.id,
        label: String(draft.label || '').trim() || undefined,
        labelZh: String(draft.labelZh || '').trim(),
        icon: String(draft.icon || '').trim() || undefined,
        setupStageId: draft.setupStageId || (stages[0] && stages[0].id),
        bindingAreaByStage: Object.keys(bindingAreaByStage).length ? bindingAreaByStage : undefined,
        kbPack: (function pack() {
          const next = {
            analysis: (draft.kbPack && draft.kbPack.analysis) || [],
            pricing: (draft.kbPack && draft.kbPack.pricing) || [],
            planning: (draft.kbPack && draft.kbPack.planning) || [],
          }
          const any = next.analysis.length + next.pricing.length + next.planning.length
          if (draft.useOwnKbPack || any > 0) return next
          return undefined
        }()),
        stages,
      }
    }

    function ModuleManagerPanel(props) {
      useApLang()
      const cwd = props.cwd || ''
      const [rows, setRows] = React.useState([])
      const [errors, setErrors] = React.useState([])
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [importText, setImportText] = React.useState('')
      const [viewingId, setViewingId] = React.useState('')
      const [copying, setCopying] = React.useState(null)
      const [copyId, setCopyId] = React.useState('')
      const [copyLabel, setCopyLabel] = React.useState('')
      const [copyThenEdit, setCopyThenEdit] = React.useState(false)
      const [editing, setEditing] = React.useState(null)
      const [kbEntries, setKbEntries] = React.useState([])
      const createCopy = moduleCreateCopy()

      const load = React.useCallback(() => {
        return api('/api/agent-pi/modules', cwd, { method: 'GET' })
          .then((body) => { setRows(body.modules || []); setErrors(body.errors || []); setError('') })
          .catch((e) => setError(String(e.message || e)))
      }, [cwd])
      React.useEffect(() => { load() }, [load])
      React.useEffect(() => {
        if (!editing) return
        api('/api/agent-pi/kb', cwd, { method: 'GET' })
          .then((body) => setKbEntries((body && body.entries) || []))
          .catch(() => setKbEntries([]))
      }, [editing ? editing.id : '', cwd])

      const act = (busyKey, body, done) => {
        setBusy(busyKey)
        setError('')
        setNotice('')
        return api('/api/agent-pi/modules', cwd, { method: 'POST', body: JSON.stringify(body) })
          .then((result) => {
            if (done) done(result)
            return load()
          })
          .then(() => { if (props.onChanged) props.onChanged() })
          .catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const toggle = (row) => act('sw:' + row.id, { action: 'set_enabled', id: row.id, disabled: !row.disabled },
        () => setNotice(tAp(row.disabled ? 'mm.enabled' : 'mm.disabled', { name: moduleLabel(row) })))
      const remove = (row) => {
        if (!window.confirm(tAp('mm.deleteConfirm', { name: moduleLabel(row) }))) return
        act('rm:' + row.id, { action: 'remove', id: row.id }, () => setNotice(tAp('mm.deleted', { id: row.id })))
      }
      const importSave = () => {
        let parsed
        try {
          parsed = JSON.parse(importText)
        } catch (e) {
          setError(tAp('mm.jsonFail', { err: String(e.message || e) }))
          return
        }
        act('import', { action: 'save', definition: parsed }, (saved) => {
          setNotice(tAp('mm.installed', { id: saved && saved.id ? saved.id : '' }))
          setImportText('')
          if (saved && saved.id && props.onOpened) props.onOpened(saved.id)
        })
      }
      const suggestCopyId = (sourceId) => {
        const taken = new Set(rows.map((item) => item.id))
        const root = String(sourceId || '').slice(0, 24)
        const first = root + '-copy'
        if (!taken.has(first)) return first
        for (let n = 2; n < 40; n++) {
          const id = root + '-copy-' + n
          if (!taken.has(id)) return id
        }
        return first
      }
      const beginCopy = (row, thenEdit) => {
        setCopyThenEdit(!!thenEdit)
        setCopying(row)
        setCopyId(suggestCopyId(row.id))
        setCopyLabel(moduleLabel(row) + tAp('mm.copySuffix'))
        setEditing(null)
      }
      const submitCopy = () => {
        if (!copying) return
        const openEditor = copyThenEdit
        act('copy', { action: 'copy', id: copying.id, newId: copyId.trim(), labelZh: copyLabel.trim() }, (saved) => {
          setNotice(tAp('mm.copied', { id: saved && saved.id ? saved.id : '' }))
          setCopying(null)
          setCopyThenEdit(false)
          if (openEditor && saved) {
            setEditing(workflowToDraft(saved))
            setViewingId('')
          } else if (saved && saved.id && props.onOpened) {
            props.onOpened(saved.id)
          } else {
            setViewingId(saved && saved.id ? saved.id : '')
          }
        })
      }
      const patchDraft = (patch) => setEditing((current) => current ? Object.assign({}, current, patch) : current)
      const patchStage = (index, patch) => setEditing((current) => {
        if (!current) return current
        const stages = current.stages.slice()
        stages[index] = Object.assign({}, stages[index], patch)
        const next = Object.assign({}, current, { stages })
        if (patch.id && current.setupStageId === current.stages[index].id) next.setupStageId = patch.id
        return next
      })
      const moveStage = (index, delta) => setEditing((current) => {
        if (!current) return current
        const dest = index + delta
        if (dest < 0 || dest >= current.stages.length) return current
        const stages = current.stages.slice()
        const [item] = stages.splice(index, 1)
        stages.splice(dest, 0, item)
        return Object.assign({}, current, { stages })
      })
      const addStage = () => setEditing((current) => {
        if (!current || current.stages.length >= 12) return current
        return Object.assign({}, current, { stages: current.stages.concat([blankStage(current.stages.length)]) })
      })
      const removeStage = (index) => setEditing((current) => {
        if (!current || current.stages.length <= 1) return current
        const stages = current.stages.filter((_, i) => i !== index)
        const removed = current.stages[index]
        const setupStageId = current.setupStageId === removed.id ? (stages[0] && stages[0].id) : current.setupStageId
        return Object.assign({}, current, { stages, setupStageId })
      })
      const beginEdit = (row) => {
        if (row.builtin) {
          setNotice(tAp('mm.builtinLocked'))
          beginCopy(row, true)
          return
        }
        setEditing(workflowToDraft(row))
        setCopying(null)
        setViewingId('')
      }
      const toggleKb = (area, slug, on) => setEditing((current) => {
        if (!current) return current
        const pack = Object.assign({ analysis: [], pricing: [], planning: [] }, current.kbPack)
        const list = (pack[area] || []).filter((item) => item !== slug)
        if (on) list.push(slug)
        pack[area] = list
        return Object.assign({}, current, { kbPack: pack, useOwnKbPack: true })
      })
      const saveEdit = () => {
        if (!editing) return
        if (!window.confirm(tAp('mm.saveConfirm'))) return
        act('edit', { action: 'save', definition: draftToDefinition(editing) }, (saved) => {
          setNotice(tAp('mm.saved', { id: saved && saved.id ? saved.id : '' }))
          setEditing(null)
          if (saved && saved.id && props.onOpened) props.onOpened(saved.id)
          else setViewingId(saved && saved.id ? saved.id : '')
        })
      }
      const stageMarks = (stage) => {
        const marks = []
        if (stage.listsSources) marks.push(tAp('mm.markLists'))
        if (stage.summaryDeliverable && stage.summaryDeliverable.fileName) marks.push(tAp('mm.markSummary', { name: stage.summaryDeliverable.fileName }))
        if (stage.skillSlugs && stage.skillSlugs.length) marks.push(tAp('mm.markSkills', { list: apJoin(stage.skillSlugs) }))
        if (stage.reviewSkillSlugs && stage.reviewSkillSlugs.length) marks.push(tAp('mm.markReview', { list: apJoin(stage.reviewSkillSlugs) }))
        return marks.join(' · ')
      }

      return h('div', { className: 'ap-ov', style: { display: 'block', overflow: 'auto' } },
        h('div', { className: 'ap-ov-main', style: { maxWidth: 1080, margin: '0 auto' } },
          h('header', { className: 'ap-ov-hd' },
            h('div', { style: { minWidth: 0 } },
              h('h1', null, tAp('mm.title')),
              h('div', { className: 'ap-sub' }, tAp('mm.lead')),
              h('div', { className: 'ap-sub', style: { marginTop: 4 } }, tAp('mm.lead2')),
            ),
            h('div', { className: 'ap-actions' },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => load() }, Icon('refresh', 14), tAp('kb.refresh')),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                title: tAp('mm.designTitle'),
                onClick: () => props.onDesign && props.onDesign('custom-steps'),
              }, Icon('sparkles', 14), tAp('mm.design')),
            ),
          ),
          error ? h('div', { className: 'ap-err' }, error) : null,
          notice ? h('div', { className: 'ap-sub', style: { padding: '6px 0' } }, notice) : null,
          h('section', { className: 'ap-sec' },
            h('h2', null, createCopy.title),
            h('div', { className: 'ap-create-lead' },
              h('strong', null, tAp('mm.packNotJson')),
              h('p', { className: 'ap-sub', style: { margin: 0 } }, createCopy.lead),
              h('p', { className: 'ap-sub', style: { margin: '6px 0 0' } }, createCopy.warn),
            ),
            h('p', { className: 'ap-sub', style: { marginTop: 10 } }, tAp('mm.pickKind')),
            h('div', { className: 'ap-create-picks' },
              createCopy.cards.map((card) => h('button', {
                key: card.id,
                type: 'button',
                className: 'ap-create-pick',
                onClick: () => props.onDesign && props.onDesign(card.id),
              },
                h('strong', null, card.title),
                h('span', null, card.body),
              )),
            ),
            h('details', { style: { marginTop: 14 } },
              h('summary', { className: 'ap-sub', style: { cursor: 'pointer' } }, tAp('mm.advanced')),
              h('p', { className: 'ap-sub', style: { marginTop: 8 } }, createCopy.advanced),
              h('textarea', {
                value: importText,
                spellCheck: false,
                onChange: (e) => setImportText(e.target.value),
                style: { width: '100%', minHeight: 140, marginTop: 8, padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit', font: 'var(--dsw-font-markdown-code-block-small)' },
              }),
              h('div', { className: 'ap-row', style: { justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
                h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'import' || !importText.trim(), onClick: importSave }, busy === 'import' ? tAp('mm.installing') : tAp('mm.install')),
              ),
            ),
          ),
          copying ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.copyTitle')),
            h('p', { className: 'ap-sub' }, tAp('mm.copyLead', { name: moduleLabel(copying) })),
            h('label', { className: 'ap-sub', style: { display: 'block', marginTop: 10 } }, tAp('mm.labelZh')),
            h('input', {
              value: copyLabel,
              onChange: (e) => setCopyLabel(e.target.value),
              style: { width: '100%', marginTop: 4, padding: '8px 10px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit' },
            }),
            h('label', { className: 'ap-sub', style: { display: 'block', marginTop: 10 } }, tAp('mm.moduleId')),
            h('input', {
              value: copyId,
              onChange: (e) => setCopyId(e.target.value),
              style: { width: '100%', marginTop: 4, padding: '8px 10px', boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--dsw-border, rgba(127,127,127,.35))', background: 'transparent', color: 'inherit' },
            }),
            h('div', { className: 'ap-row', style: { justifyContent: 'flex-end', gap: 8, marginTop: 8 } },
              h('button', { type: 'button', className: 'ap-btn', onClick: () => setCopying(null) }, tAp('mm.cancel')),
              h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'copy' || !copyId.trim() || !copyLabel.trim(), onClick: submitCopy }, busy === 'copy' ? tAp('mm.copying') : (copyThenEdit ? tAp('mm.copyOpen') : tAp('mm.copyLive'))),
            ),
          ) : null,
          editing ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.editTitle', { name: editing.labelZh || editing.id })),
            h('p', { className: 'ap-sub' }, tAp('mm.editLead')),
            h('label', { className: 'ap-mm-field' }, tAp('mm.labelZh'),
              h('input', { value: editing.labelZh, onChange: (e) => patchDraft({ labelZh: e.target.value }) }),
            ),
            h('label', { className: 'ap-mm-field' }, tAp('mm.labelEn'),
              h('input', { value: editing.label, onChange: (e) => patchDraft({ label: e.target.value }) }),
            ),
            h('label', { className: 'ap-mm-field' }, tAp('mm.setupStage'),
              h('select', { value: editing.setupStageId, onChange: (e) => patchDraft({ setupStageId: e.target.value }) },
                editing.stages.map((stage) => h('option', { key: stage.id, value: stage.id }, (stage.labelZh || stage.id) + ' · ' + stage.id)),
              ),
            ),
            h('div', { className: 'ap-mm-ed-stage' },
              h('strong', null, tAp('mm.kbPack')),
              h('p', { className: 'ap-sub' }, tAp('mm.kbPackLead')),
              h('div', { className: 'ap-mm-checks' },
                h('label', null,
                  h('input', {
                    type: 'checkbox',
                    checked: !!editing.useOwnKbPack,
                    onChange: (e) => patchDraft({ useOwnKbPack: e.target.checked }),
                  }),
                  ' ' + tAp('mm.kbOwnOnly'),
                ),
              ),
              kbEntries.length === 0
                ? h('p', { className: 'ap-sub' }, tAp('mm.kbEmpty'))
                : ['analysis', 'pricing', 'planning'].map((area) => {
                  const selected = (editing.kbPack && editing.kbPack[area]) || []
                  return h('div', { key: area, style: { marginTop: 10 } },
                    h('div', { className: 'ap-sub' }, tAp('mm.area.' + area)),
                    kbEntries.map((entry) => h('label', {
                      key: area + ':' + entry.slug,
                      className: 'ap-mm-checks',
                      style: { marginTop: 4 },
                    },
                      h('input', {
                        type: 'checkbox',
                        checked: selected.indexOf(entry.slug) >= 0,
                        onChange: (e) => toggleKb(area, entry.slug, e.target.checked),
                      }),
                      ' ' + (typeof kbTitle === 'function' ? kbTitle(entry) : entry.name) + (entry.category ? ' · ' + kbCategoryLabel(entry.category) : ''),
                    )),
                  )
                }),
            ),
            editing.stages.map((stage, index) => h('div', { key: stage.id + ':' + index, className: 'ap-mm-ed-stage' },
              h('div', { className: 'ap-row', style: { gap: 8, justifyContent: 'space-between' } },
                h('strong', null, tAp('mm.stageN', { n: index + 1 })),
                h('span', { className: 'ap-row', style: { gap: 6 } },
                  h('button', { type: 'button', className: 'ap-btn link', disabled: index === 0, onClick: () => moveStage(index, -1) }, tAp('mm.moveUp')),
                  h('button', { type: 'button', className: 'ap-btn link', disabled: index === editing.stages.length - 1, onClick: () => moveStage(index, 1) }, tAp('mm.moveDown')),
                  h('button', { type: 'button', className: 'ap-btn link', disabled: editing.stages.length <= 1, onClick: () => removeStage(index) }, tAp('mm.deleteStage')),
                ),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageId'),
                h('input', { value: stage.id, onChange: (e) => patchStage(index, { id: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageZh'),
                h('input', { value: stage.labelZh, onChange: (e) => patchStage(index, { labelZh: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.stageHint'),
                h('input', { value: stage.hintZh, onChange: (e) => patchStage(index, { hintZh: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field tall' }, tAp('mm.stagePrompt'),
                h('textarea', { value: stage.prompt, spellCheck: false, onChange: (e) => patchStage(index, { prompt: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.skillSlugs'),
                h('input', { value: stage.skillSlugs, onChange: (e) => patchStage(index, { skillSlugs: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.reviewSlugs'),
                h('input', { value: stage.reviewSkillSlugs, onChange: (e) => patchStage(index, { reviewSkillSlugs: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.binding'),
                h('select', { value: stage.binding, onChange: (e) => patchStage(index, { binding: e.target.value }) },
                  h('option', { value: '' }, tAp('mm.bindNone')),
                  h('option', { value: 'analysis' }, tAp('mm.bindAnalysis')),
                  h('option', { value: 'pricing' }, tAp('mm.bindPricing')),
                  h('option', { value: 'planning' }, tAp('mm.bindPlanning')),
                ),
              ),
              h('div', { className: 'ap-mm-checks' },
                h('label', null,
                  h('input', { type: 'checkbox', checked: !!stage.listsSources, onChange: (e) => patchStage(index, { listsSources: e.target.checked }) }),
                  ' ' + tAp('mm.listsSources'),
                ),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.summaryFile'),
                h('input', { value: stage.summaryFile, onChange: (e) => patchStage(index, { summaryFile: e.target.value }) }),
              ),
              h('label', { className: 'ap-mm-field' }, tAp('mm.summaryOutline'),
                h('textarea', { value: stage.summaryOutline, spellCheck: false, onChange: (e) => patchStage(index, { summaryOutline: e.target.value }) }),
              ),
            )),
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between', gap: 8, marginTop: 8 } },
              h('button', { type: 'button', className: 'ap-btn', disabled: editing.stages.length >= 12, onClick: addStage }, tAp('mm.addStage')),
              h('span', { className: 'ap-row', style: { gap: 8 } },
                h('button', { type: 'button', className: 'ap-btn', onClick: () => setEditing(null) }, tAp('mm.cancel')),
                h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'edit' || !editing.labelZh.trim() || !editing.stages.length, onClick: saveEdit }, busy === 'edit' ? tAp('mm.saving') : tAp('mm.saveLive')),
              ),
            ),
          ) : null,
          h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.list', { n: rows.length })),
            rows.map((row) => {
              const stages = row.workflow && Array.isArray(row.workflow.stages) ? row.workflow.stages : []
              const open = viewingId === row.id
              return h('div', { key: row.id, className: 'ap-mm-card' + (row.disabled ? ' off' : '') },
                h('div', { className: 'ap-mm-row' },
                  moduleIconNode(row, 18),
                  h('div', { className: 'grow' },
                    h('div', { className: 'ap-row', style: { gap: 8 } },
                      h('strong', null, moduleLabel(row)),
                      h('span', { className: 'ap-chip' }, row.id),
                      row.builtin ? h('span', { className: 'ap-chip' }, tAp('mm.builtin')) : h('span', { className: 'ap-chip' }, tAp('mm.custom')),
                    ),
                    h('div', { className: 'ap-sub' },
                      tAp('mm.stageCount', { n: row.stageCount }) + (row.sourcePath ? ' · ' + row.sourcePath : '')),
                  ),
                  h('span', { className: 'ap-row', style: { gap: 6, flexShrink: 0 } },
                    h('button', {
                      type: 'button',
                      className: 'ap-btn link',
                      disabled: !!busy,
                      onClick: () => setViewingId(open ? '' : row.id),
                    }, open ? tAp('mm.collapse') : tAp('mm.expand')),
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => beginEdit(row) }, row.builtin ? tAp('mm.copyThenEdit') : tAp('mm.editStages')),
                    h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => beginCopy(row, false) }, tAp('mm.copyAsCustom')),
                    row.sourcePath
                      ? h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, title: tAp('mm.defFileTitle'), onClick: () => openInExplorer(cwd, row.sourcePath, { reveal: true }).catch(() => {}) }, tAp('mm.defFile'))
                      : null,
                    !row.builtin
                      ? h('button', { type: 'button', className: 'ap-btn link', disabled: !!busy, onClick: () => remove(row) }, tAp('mm.delete'))
                      : null,
                    h('button', {
                      type: 'button',
                      className: 'ap-switch' + (row.disabled ? '' : ' on'),
                      role: 'switch',
                      'aria-checked': !row.disabled,
                      title: row.disabled ? tAp('mm.enable') : tAp('mm.disable'),
                      disabled: !!busy,
                      onClick: () => toggle(row),
                    }, h('span', { className: 'ap-switch-knob' })),
                  ),
                ),
                open ? h('div', { className: 'ap-mm-stages' },
                  stages.length === 0
                    ? h('div', { className: 'ap-sub' }, tAp('mm.noStages'))
                    : stages.map((stage, index) => h('div', { key: stage.id || index, className: 'ap-mm-stage' },
                      h('span', { className: 'ap-chip' }, String(index + 1)),
                      h('div', { className: 'grow' },
                        h('strong', null, stage.labelZh || stage.label || stage.id),
                        h('div', { className: 'ap-sub' }, stage.hintZh || ''),
                        stageMarks(stage) ? h('div', { className: 'ap-sub' }, stageMarks(stage)) : null,
                      ),
                    )),
                ) : null,
              )
            }),
          ),
          errors.length ? h('section', { className: 'ap-sec' },
            h('h2', null, tAp('mm.loadFailed')),
            errors.map((item, index) => h('div', { key: index, className: 'ap-err', style: { marginTop: 6 } },
              item.file + ' — ' + item.error)),
          ) : null,
        ),
      )
    }

    function Workbench(props) {
      useApLang()
      const LIVE_POLL_MS = 45000
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [module, setModule] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') || 'tender' } catch { return 'tender' }
      })
      const [draft, setDraft] = React.useState('')
      const [refreshing, setRefreshing] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [selectedId, setSelectedId] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-project') || '' } catch { return '' }
      })
      const [monitorState, setMonitorState] = React.useState(() => Object.assign({}, monitorEngine.state))
      const [, setSessionPulse] = React.useState(0)
      const [notice, setNotice] = React.useState('')
      const [lastCheck, setLastCheck] = React.useState(null)
      const [picking, setPicking] = React.useState(false)
      const [pickSelected, setPickSelected] = React.useState([])
      const cwd = readWorkspaceCwd(props)
      const catalog = moduleList(data)
      const current = catalog.find((item) => item.id === module) || MODULES[module] || { id: module, labelZh: module, icon: 'clipboardCheck' }

      const selectModule = (id) => {
        setModule(id)
        if (id !== 'kb' && id !== 'modules' && id !== 'archive') setSelectedId('')
        try {
          sessionStorage.setItem('ap-wb-module', id)
          sessionStorage.removeItem('ap-wb-await-module')
        } catch {}
        window.dispatchEvent(new Event('agent-pi-wb-module-sync'))
      }

      React.useEffect(() => {
        const onModule = (event) => {
          const id = event && event.detail
          if (!id || typeof id !== 'string') return
          selectModule(id)
          setWorkbenchOpen(true)
        }
        window.addEventListener('agent-pi-wb-module', onModule)
        return () => window.removeEventListener('agent-pi-wb-module', onModule)
      }, [])

      React.useEffect(() => {
        if (!data || !data.modules) return
        let waiting = false
        let known = []
        try {
          waiting = sessionStorage.getItem('ap-wb-await-module') === '1'
          known = JSON.parse(sessionStorage.getItem('ap-wb-known-modules') || '[]')
        } catch { return }
        if (!waiting || !known.length) return
        const added = data.modules.filter((item) => item && item.id && !item.builtin && known.indexOf(item.id) < 0)
        if (!added.length) return
        try { sessionStorage.removeItem('ap-wb-await-module') } catch {}
        selectModule(added[added.length - 1].id)
      }, [data])

      const refresh = React.useCallback((silent) => {
        if (!cwd) {
          setError('先选择一个工作区')
          return Promise.resolve()
        }
        if (!silent) setError('')
        setRefreshing(true)
        return api('/api/agent-pi/workbench', cwd, { method: 'GET' })
          .then((body) => {
            setData(body)
            setLastCheck(Date.now())
          })
          .catch((e) => { if (!silent) setError(String(e.message || e)) })
          .finally(() => setRefreshing(false))
      }, [cwd])

      React.useEffect(() => {
        if (module === 'archive') {
          setError('')
          return
        }
        refresh()
      }, [refresh, module])
      React.useEffect(() => {
        const onCreated = (event) => {
          const id = event && event.detail && event.detail.projectId
          const nextModule = event && event.detail && event.detail.module
          if (nextModule) selectModule(nextModule)
          if (id) {
            setSelectedId(id)
            try { sessionStorage.setItem('ap-wb-project', id) } catch {}
          }
          refresh()
        }
        window.addEventListener('agent-pi-created', onCreated)
        return () => window.removeEventListener('agent-pi-created', onCreated)
      }, [refresh])

      const projects = (data && data.projects ? data.projects : []).filter((row) => row.project.module === module)
      React.useEffect(() => {
        if (!projects.length) return
        if (!selectedId || !projects.some((row) => row.project.projectId === selectedId)) {
          setSelectedId(projects[0].project.projectId)
        }
      }, [projects, selectedId])
      // A disabled/removed module falls back to the first visible one.
      React.useEffect(() => {
        if (module === 'kb' || module === 'modules' || module === 'archive') return
        if (!data || !catalog.length) return
        if (!catalog.some((item) => item.id === module)) {
          selectModule(catalog[0].id)
        }
      }, [data, module, catalog.map((item) => item.id).join(',')])

      const row = projects.find((item) => item.project.projectId === selectedId) || null

      // Disk-verified project health check shown under the monitor header; filled
      // by the 检查 button or the live monitor, cleared when switching projects.
      const [reality, setReality] = React.useState(null)
      React.useEffect(() => { setReality(null) }, [selectedId])

      // Keep the dashboard in sync with the module-level engine and poll the board
      // while the workbench is open. Opening the workbench never dispatches anything.
      React.useEffect(() => {
        const onMonitor = () => {
          setMonitorState(Object.assign({}, monitorEngine.state))
          if (monitorEngine.state.lastReality) setReality(monitorEngine.state.lastReality)
          refresh(true)
        }
        window.addEventListener('agent-pi-monitor-changed', onMonitor)
        return () => window.removeEventListener('agent-pi-monitor-changed', onMonitor)
      }, [refresh])
      React.useEffect(() => {
        const list = runtime.sessions && runtime.sessions.list
        if (!list || typeof list.subscribe !== 'function') return undefined
        return list.subscribe(() => setSessionPulse((value) => value + 1))
      }, [])
      React.useEffect(() => {
        if (module === 'archive' || module === 'kb' || module === 'modules') return
        const id = setInterval(() => { refresh(true) }, LIVE_POLL_MS)
        return () => clearInterval(id)
      }, [refresh, module])

      const runCheck = (project) => {
        setBusy('check:')
        setError('')
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({ action: 'check', module: project.module, projectId: project.projectId }),
        }).then((result) => {
          setReality(result.reality || null)
          monitorEngine.state.lastReality = result.reality || null
          return refresh(true)
        }).catch((e) => setError(String(e.message || e))).finally(() => setBusy(''))
      }

      const runStage = (project, stageId, action, submit, closeWorkbench) => {
        const parentId = pinParentSessionId()
        setBusy(action + ':' + (stageId || ''))
        setError('')
        setNotice('')
        return api('/api/agent-pi/stage', cwd, {
          method: 'POST',
          body: JSON.stringify({
            action: action || 'prepare',
            module: project.module,
            projectId: project.projectId,
            stageId,
            sessionId: parentId || resolveSessionId(props) || runtime.sessionId || 'active',
          }),
        }).then((result) => {
          if (result.blocked) {
            // Blocked drafts are preview-only: never write them into the conversation
            // and never leave them armed in the composer.
            setError(result.blocked)
            if (result.draft) setDraft(result.draft)
            return refresh()
          }
          if (result.done) {
            setNotice(result.message || '流程已全部完成。')
            return refresh()
          }
          if (result.alreadyDispatched) {
            setNotice(result.message || '阶段稿已写入主对话，等待执行。')
            return refresh()
          }
          if (result.closed && result.message) setNotice(result.message)
          if (!result.draft) {
            if (result.message) setNotice(result.message)
            return refresh()
          }
          setDraft(result.draft)
          if (!submit) {
            const activeId = resolveSessionId(props) || runtime.sessionId || ''
            if (!result.closed && parentId && activeId && parentId !== activeId) {
              return dispatchToConversation({}, result.draft, parentId).then((ok) => {
                if (ok) setNotice('已把待处理稿直接送回主对话。')
                return refresh()
              })
            }
            if (!result.closed) fillComposer(props, result.draft)
            return refresh()
          }
          return dispatchToConversation(props, result.draft, parentId).then((ok) => {
            if (ok && result.dispatch) {
              api('/api/agent-pi/stage', cwd, {
                method: 'POST',
                body: JSON.stringify({
                  action: 'mark_dispatched',
                  module: project.module,
                  projectId: project.projectId,
                  stageId: result.dispatch.stageId,
                  key: result.dispatch.key,
                }),
              }).catch(() => {})
            }
            if (ok) {
              monitorEngine.start({ cwd, module: project.module, projectId: project.projectId })
              if (closeWorkbench !== false) setWorkbenchOpen(false)
            }
            return refresh()
          }).catch((e) => {
            setError(String(e.message || e))
            return refresh()
          })
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const openCreate = () => {
        window.dispatchEvent(new CustomEvent('agent-pi-open-create', { detail: { cwd, module } }))
      }

      const openAdopt = () => {
        window.dispatchEvent(new CustomEvent('agent-pi-open-create', { detail: { cwd, module, mode: 'adopt' } }))
      }

      const selectProject = (id) => {
        setSelectedId(id)
        try { sessionStorage.setItem('ap-wb-project', id) } catch {}
      }

      const startLiveMonitor = () => {
        if (!row || !row.project) return
        monitorEngine.start({ cwd, module: row.project.module, projectId: row.project.projectId })
      }

      const monitoringHere = monitorState.monitoring
        && row && row.project
        && monitorState.projectId === row.project.projectId
        && monitorState.cwd === cwd
      const liveActivity = sessionActivity(readSessionListSnap(), monitorState.parentSessionId)
      const liveActivityText = liveActivity.runningChildCount > 0
        ? (liveActivity.runningChildCount + ' 个子智能体执行中')
        : liveActivity.parentRunning ? '主对话执行中' : ''

      const addFiles = () => {
        if (!row) return
        setPickSelected(row.project.inputPaths || [])
        setPicking(true)
      }

      const restoreSources = (project, extra) => {
        setBusy('restore')
        setError('')
        setNotice(extra && extra.preferMineru ? '正在用 MinerU 对齐原稿…' : '正在按知识库逻辑对齐原稿…')
        return api('/api/agent-pi/projects/restore', cwd, {
          method: 'POST',
          body: JSON.stringify({
            module: project.module,
            projectId: project.projectId,
            force: !!(extra && extra.force),
            preferMineru: !!(extra && extra.preferMineru),
          }),
        }).then((batch) => {
          const ok = (batch.restored || []).length
          const skipped = (batch.skipped || []).filter((item) => item.reason !== 'unsupported')
          setNotice(ok
            ? ('已对齐 ' + ok + ' 份原稿' + (skipped.length ? '；' + skipped.length + ' 份未对齐' : '') + '。点文件名可预览改稿，保存会同步 JSON。')
            : (skipped.length ? ('原稿对齐未完成：' + skipped.map((item) => item.reason).join('；')) : '没有需要对齐的原稿。'))
          return refresh()
        })
      }

      const saveFiles = () => {
        if (!row) return
        setBusy('files')
        api('/api/agent-pi/projects', cwd, {
          method: 'PATCH',
          body: JSON.stringify({ module: row.project.module, projectId: row.project.projectId, inputPaths: pickSelected }),
        }).then(() => {
          setPicking(false)
          return restoreSources(row.project)
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const removeProject = () => {
        if (!row) return
        if (!window.confirm('从工作台移除项目「' + row.project.name + '」？磁盘上的项目文件会保留。')) return
        setBusy('remove')
        api('/api/agent-pi/projects', cwd, {
          method: 'DELETE',
          body: JSON.stringify({ module: row.project.module, projectId: row.project.projectId }),
        }).then(() => {
          setSelectedId('')
          refresh()
        }).catch((e) => setError(String(e.message || e)))
          .finally(() => setBusy(''))
      }

      const togglePick = (path, _name, forceAdd) => {
        setPickSelected((current) => {
          const has = current.indexOf(path) >= 0
          if (forceAdd && has) return current
          if (has) return current.filter((item) => item !== path)
          return current.concat([path])
        })
      }

      const renderOverview = (item) => {
        const project = item.project
        const wf = item.workflow
        const stages = wf.stages || []
        const setupId = wf.setupStageId || ''
        const evidence = item.evidence
        const forceTarget = stages.find((stage) => {
          if (setupId && stage.id === setupId) return false
          const slice = stageSlice(item, stage.id)
          return slice && (slice.status === 'blocked' || (evidence && evidence.blocking))
        })
        const setup = setupId ? stageSlice(item, setupId) : null
        return h('div', { className: 'ap-ov-main' },
          h('header', { className: 'ap-ov-hd' },
            h('div', { style: { minWidth: 0 } },
              h('h1', null, project.name),
              h('div', { className: 'ap-path' }, Icon('folder', 14), h('span', { title: project.rootPath }, project.rootPath || cwd)),
            ),
            h('div', { className: 'ap-actions' },
              h('button', { type: 'button', className: 'ap-btn', onClick: addFiles }, Icon('filePlus', 14), '添加资料'),
              h('button', {
                type: 'button',
                className: 'ap-btn primary',
                title: '同一条推进口：未齐套先确认资料，否则恢复未完阶段。已写入的阶段稿不会再灌一遍。',
                onClick: () => {
                  const next = stages.find((stage) => {
                    const slice = stageSlice(item, stage.id)
                    return !slice || slice.status !== 'done'
                  })
                  if (!next) {
                    setNotice('所有阶段均已完成；如需重跑，请对相应阶段「重置编排」。')
                    return
                  }
                  if (setupId && next.id === setupId) {
                    startLiveMonitor()
                    restoreSources(project).then(() => runStage(project, setupId, 'complete', true)).catch((e) => setError(String(e.message || e)))
                    return
                  }
                  startLiveMonitor()
                  runStage(project, '', 'resume', true)
                },
              }, Icon('play', 14), '继续推进'),
              h('button', { type: 'button', className: 'ap-btn ghost', onClick: removeProject }, Icon('trash', 14), '移除项目'),
            ),
          ),
          h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-mon-hd' },
              h('div', { style: { minWidth: 0 } },
                h('h2', null, '流程监控'),
                h('p', { className: 'ap-sub' }, '点「继续推进」后，空闲会自动走下一步。分析阶段盯五份深度稿：只催补齐列出的缺口，不整单重扫。同一阶段稿不重写。'),
              ),
              h('div', { className: 'ap-mon-tools' },
                h('span', { className: 'ap-row' },
                  h('i', { className: 'ap-dot' + ((monitoringHere && !monitorState.paused) || liveActivityText ? ' on' : '') }),
                  !monitoringHere
                    ? (liveActivityText || (monitorState.monitoring ? '自动下一步在另一项目' : '点继续推进后会自动下一步'))
                    : (monitorState.paused ? '已暂停自动下一步' : '空闲自动下一步') + (liveActivityText ? ' · ' + liveActivityText : ''),
                ),
                h('span', null, '检查于 ' + (monitorState.lastCheck ? formatClock(new Date(monitorState.lastCheck).toISOString()) : (lastCheck ? formatClock(new Date(lastCheck).toISOString()) : '—'))),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: busy === 'check:',
                  title: '对每个阶段做盘面对账：任务与产物、总报告、分析深度套件、实际工程量清单、测算表、引用孤儿、门禁',
                  onClick: () => runCheck(project),
                }, Icon('search', 14), busy === 'check:' ? '体检中…' : '检查'),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !forceTarget && !(evidence && evidence.blocking),
                  title: forceTarget || (evidence && evidence.blocking) ? '解除缺件门槛：缺口保持为缺口，不授权联网尽调。' : '当前没有缺件门槛可放行',
                  onClick: () => {
                    if (!window.confirm('解除缺件门槛：缺口保持为缺口、继续使用已有资料，不授权联网尽调（联网需在对话中授权）。不会删除已完成批次。')) return
                    runStage(project, (forceTarget && forceTarget.id) || item.currentStageId || (stages[0] && stages[0].id) || '', 'force_pass', false)
                  },
                }, Icon('unlock', 14), '强制放行'),
                monitoringHere && !monitorState.paused
                  ? h('button', { type: 'button', className: 'ap-btn ghost', title: '暂停空闲后的自动下一步，不中断当前对话', onClick: () => monitorEngine.pause() }, Icon('square', 14), '暂停自动下一步')
                  : monitoringHere && monitorState.paused
                    ? h('button', {
                      type: 'button',
                      className: 'ap-btn ghost',
                      onClick: () => { monitorEngine.unpause(); refresh(true) },
                    }, Icon('play', 14), '恢复自动下一步')
                    : null,
              ),
            ),
            reality && reality.stages ? h('div', { className: 'ap-check' },
              h('div', { className: 'ap-check-hd' },
                '全面体检',
                h('span', { className: 'ap-sub' },
                  formatClock(reality.generatedAt)
                  + (reality.stages[0] && reality.stages[0].quietMinutes != null ? ' · 最近产出 ' + reality.stages[0].quietMinutes + ' 分钟前' : '')),
                h('button', { type: 'button', className: 'ap-btn ghost', onClick: () => setReality(null) }, '收起'),
              ),
              reality.stages.map((st, index) => {
                const parts = []
                if (st.tasks && st.tasks.total > 0) {
                  parts.push('任务 ' + st.tasks.done + '/' + st.tasks.total + (st.tasks.error ? '（' + st.tasks.error + ' 个 error）' : ''))
                }
                const missing = (st.artifacts ? st.artifacts.missingMarkdown.length + st.artifacts.missingReport.length : 0)
                if (missing > 0) parts.push('缺产物 ' + missing + ' 份')
                if (st.summary) parts.push(st.summary.exists ? '总报告已就位' : '缺《' + st.summary.fileName + '》')
                if (st.suite) {
                  if (st.suite.ok) parts.push('深度套件已齐')
                  else if (st.suite.shortGaps) parts.push(st.suite.shortGaps)
                  else parts.push('深度套件未齐')
                }
                if (st.boqInventory) {
                  if (st.boqInventory.ok) parts.push('工程量清单已抽出 ' + (st.boqInventory.touchedCount || st.boqInventory.itemCount || 0) + ' 行')
                  else if (st.boqInventory.shortGaps) parts.push(st.boqInventory.shortGaps)
                  else parts.push('未摸到工程量清单')
                }
                if (st.workbook) parts.push(st.workbook.exists ? '测算表已就位' : '缺《' + st.workbook.fileName + '》')
                if (st.stageId === item.currentStageId && st.citations && st.citations.total > 0) {
                  parts.push('引用 ' + st.citations.total + ' 令牌 / ' + st.citations.orphans + ' 孤儿')
                }
                if (st.evidence && st.evidence.blocking) parts.push('门禁阻塞（' + st.evidence.gapCount + ' 缺口）')
                else if (st.evidence && st.evidence.waived) parts.push('门禁已放行')
                const unfinishedTasks = st.tasks ? st.tasks.total - st.tasks.done : 0
                const bad = typeof st.needsQc === 'boolean'
                  ? st.needsQc
                  : (missing > 0
                    || (st.summary && !st.summary.exists && st.stageStatus !== 'idle')
                    || (st.suite && !st.suite.ok && st.stageStatus !== 'idle')
                    || (st.boqInventory && !st.boqInventory.ok && st.stageStatus !== 'idle')
                    || (st.workbook && !st.workbook.exists && st.stageStatus !== 'idle')
                    || (st.evidence && st.evidence.blocking)
                    || (st.stageId === item.currentStageId && st.citations && st.citations.orphans > 0)
                    || (st.stageStatus === 'done' && unfinishedTasks > 0))
                const idleText = st.stageStatus === 'idle' ? '未开始'
                  : (st.stageStatus === 'done' && !bad ? '阶段已收口（商务待办不挡完成）' : '无异常')
                return h('div', { className: 'ap-check-row' + (bad ? ' bad' : ''), key: st.stageId },
                  h('span', { className: 'ap-check-num' }, index + 1),
                  h('strong', null, st.stageLabel),
                  statusChip(st.stageStatus),
                  h('span', { className: 'ap-sub' }, parts.length ? parts.join(' · ') : idleText),
                )
              }),
            ) : null,
            stages.map((stage, index) => {
              const slice = stageSlice(item, stage.id)
              const tasks = (slice && slice.tasks) || []
              const done = tasks.filter((task) => task.status === 'done').length
              const failed = tasks.filter((task) => task.status === 'error').length
              const percent = tasks.length ? Math.round((done / tasks.length) * 100) : (slice && slice.status === 'done' ? 100 : 0)
              const setupDone = slice && slice.status === 'done'
              const checkRow = reality && reality.stages ? reality.stages.find((st) => st.stageId === stage.id) : null
              const closedClean = setupDone && !stageRowDirty(slice, tasks, checkRow)
              const outFolder = (checkRow && checkRow.outputFolder) || officialFolder(stage.id)
              const stageHint = closedClean
                ? ('阶段已收口。成果在 Agent Pi Outputs/' + project.projectId + '/' + outFolder + '/。询价、开工确认、submission_audit 未通过是投标可提交门禁，不表示本阶段没做完。')
                : (stage.hintZh || stage.prompt)
              return h('div', { className: 'ap-stage-row', key: stage.id },
                h('span', { className: 'ap-stage-num' }, index + 1),
                h('div', { className: 'ap-stage-body' },
                  h('div', { className: 'ap-row' },
                    h('strong', null, stage.labelZh),
                    statusChip(slice && slice.status),
                    slice && slice.forcePassedAt ? h('span', { className: 'ap-chip' }, '已强制放行') : null,
                  ),
                  h('p', { className: 'ap-stage-hint' }, stageHint),
                  slice && slice.blockedReason ? h('div', { className: 'ap-err' }, slice.blockedReason) : null,
                  evidence && stage.id !== setupId && evidence.gaps && evidence.gaps.length
                    && (stage.id === item.currentStageId || (slice && slice.status === 'blocked') || stage.id === 'tender-document-analysis')
                    ? evidence.gaps.slice(0, 4).map((gap) => h('div', { className: 'ap-gap', key: stage.id + gap.chapterId },
                      h('span', { className: 'ap-chip warn' }, '缺口'),
                      gap.title + ' — ' + gap.suggestedUpload,
                    ))
                    : null,
                  tasks.length
                    ? h('div', { style: { marginTop: 8 } },
                      h('div', { className: 'ap-bar' + (failed ? ' fail' : '') }, h('i', { style: { width: percent + '%' } })),
                      h('div', { className: 'ap-sub' }, '清单 ' + done + '/' + tasks.length + (failed ? ' · 失败 ' + failed : '')),
                      tasks.slice(0, 8).map((task) => {
                        const restore = findSetupRestore(item.restores, task.sourcePath || task.markdownPath)
                        const setupFile = !!(setupId && stage.id === setupId && (task.sourcePath || task.markdownPath))
                        const alignable = setupFile && /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(task.sourcePath || '')
                        return h('div', { className: 'ap-task', key: task.id },
                          h('button', {
                            type: 'button',
                            className: 'ap-task-open',
                            title: (restore && restore.manuscriptPath) || task.markdownPath || task.sourcePath,
                            onClick: () => window.dispatchEvent(new CustomEvent('agent-pi-open-file', {
                              detail: { cwd, path: task.markdownPath || restoreOpenPath(task.sourcePath, item.restores) || task.sourcePath },
                            })),
                          }, task.title),
                          setupFile && restore
                            ? h('span', { className: 'ap-chip ok', title: restore.manuscriptPath }, '已对齐')
                            : alignable
                              ? h('span', { className: 'ap-chip' }, '待对齐')
                              : h('span', { className: 'ap-chip' + (task.status === 'done' ? ' ok' : task.status === 'error' ? ' warn' : '') }, taskStatusLabel(task.status)),
                        )
                      }),
                    )
                    : null,
                ),
                h('div', { className: 'ap-stage-acts' },
                  setupId && stage.id === setupId
                    ? h(React.Fragment, null,
                      h('button', {
                        type: 'button',
                        className: 'ap-btn primary',
                        disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
                        title: '按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿',
                        onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy('')),
                      }, busy === 'restore' ? '对齐中…' : '对齐原稿'),
                      setupDone
                      ? h('button', { type: 'button', className: 'ap-btn', onClick: () => setWorkbenchOpen(false) }, '资料已齐套')
                      : h('button', {
                        type: 'button',
                        className: 'ap-btn',
                        disabled: !!busy,
                        onClick: () => {
                          startLiveMonitor()
                          restoreSources(project).then(() => runStage(project, setupId, 'complete', true)).catch((e) => setError(String(e.message || e)))
                        },
                      }, busy === 'complete:' + setupId || busy === 'restore' ? '对齐并确认中…' : '资料齐套，进入下一阶段'),
                    )
                    : h(React.Fragment, null,
                      closedClean
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn primary',
                          title: '打开本阶段正式成果目录',
                          onClick: () => {
                            openInExplorer(cwd, officialStagePath(cwd, project.projectId, stage.id), {
                              file: { type: 'directory', path: officialStagePath(cwd, project.projectId, stage.id) },
                              reveal: false,
                            }).catch((e) => setError(String(e.message || e)))
                          },
                        }, '打开成果')
                        : h('button', {
                          type: 'button',
                          className: 'ap-btn',
                          disabled: !!busy,
                          title: '同步成果到正式输出，并核验全部引用令牌（孤儿引用逐条列出）',
                          onClick: () => runStage(project, stage.id, 'organize', false),
                        }, '成果质检并整理'),
                      closedClean
                        ? h('button', {
                          type: 'button',
                          className: 'ap-btn link',
                          disabled: !!busy,
                          title: '再核一次盘面。已收口且无差异时不会要求再 complete_stage，也不会把商务待办写成阶段未完成。',
                          onClick: () => runStage(project, stage.id, 'organize', false),
                        }, busy === 'organize:' + stage.id ? '核对中…' : '再次核对盘面')
                        : h('button', {
                          type: 'button',
                          className: 'ap-btn link',
                          disabled: !!busy,
                          title: '跳到这一阶段。若它已是当前未完阶段，走恢复稿而不是再灌全文。',
                          onClick: () => {
                            startLiveMonitor()
                            const currentUnfinished = item.currentStageId === stage.id && slice && slice.status !== 'done' && tasks.length > 0
                            runStage(project, currentUnfinished ? '' : stage.id, currentUnfinished ? 'resume' : 'prepare', true)
                          },
                        }, '进入此阶段'),
                      h('button', {
                        type: 'button',
                        className: 'ap-btn link',
                        disabled: !!busy,
                        onClick: () => {
                          if (!window.confirm('重置「' + stage.labelZh + '」编排？任务清单会清空，磁盘成果保留。')) return
                          runStage(project, stage.id, 'reset', false)
                        },
                      }, '重置编排'),
                    ),
                ),
              )
            }),
          ),
          h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
              h('h2', null, '项目资料'),
              h('div', { className: 'ap-row' },
                h('span', { className: 'ap-sub' }, '对齐原稿后点名称预览改稿；保存同步 JSON'),
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !!busy || !(project.inputPaths && project.inputPaths.length),
                  title: '按知识库同一套逻辑把已登记 PDF / Word / Excel 对齐成 setup/ 解析稿',
                  onClick: () => restoreSources(project, { force: true }).catch((e) => setError(String(e.message || e))).finally(() => setBusy('')),
                }, busy === 'restore' ? '对齐中…' : '对齐原稿'),
              ),
            ),
            h('div', { className: 'ap-files-list' },
              !(project.inputPaths && project.inputPaths.length)
                ? h('p', { className: 'ap-sub', style: { padding: '18px 0' } }, '尚未登记资料。')
                : project.inputPaths.map((path) => {
                  const restore = findSetupRestore(item.restores, path)
                  return h('div', { className: 'ap-file-row', key: path },
                    h('button', {
                      type: 'button',
                      className: 'ap-file-link',
                      title: restore ? restore.manuscriptPath : path,
                      onClick: () => window.dispatchEvent(new CustomEvent('agent-pi-open-file', {
                        detail: { cwd, path: restoreOpenPath(path, item.restores) },
                      })),
                    }, fileName(path)),
                    restore
                      ? h('span', { className: 'ap-chip ok', title: restore.manuscriptPath }, '已对齐')
                      : (/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|png|jpe?g|jp2|webp|gif|bmp)$/i.test(path) ? h('span', { className: 'ap-chip' }, '待对齐') : null),
                  )
                }),
            ),
          ),
          row.citationAudit ? h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
              h('h2', null, '引用核验'),
              h('span', { className: 'ap-sub' }, '成果中的 [kb:…]/[src:…] 令牌逐一对回知识库分块与项目文件'),
            ),
            h('div', { className: 'ap-audit' + (row.citationAudit.orphans.length ? ' bad' : '') },
              h('div', { className: 'ap-row', style: { justifyContent: 'space-between' } },
                h('span', null,
                  row.citationAudit.orphans.length
                    ? '未通过：' + row.citationAudit.orphans.length + ' 个孤儿引用 / 共 ' + row.citationAudit.totalCitations + ' 个令牌'
                    : (row.citationAudit.totalCitations
                      ? '通过：' + row.citationAudit.totalCitations + ' 个令牌全部可解析（kb ' + row.citationAudit.kbCitations + ' / src ' + row.citationAudit.srcCitations + '）'
                      : '尚无引用令牌（' + row.citationAudit.checkedFiles + ' 个成果文件）')),
                h('span', { className: 'ap-sub' }, String(row.citationAudit.generatedAt || '').slice(0, 16).replace('T', ' ')),
              ),
              row.citationAudit.orphans.length
                ? h('ul', null, row.citationAudit.orphans.slice(0, 8).map((orphan, index) => h('li', { key: index },
                  orphan.file + ':' + orphan.line + ' ' + orphan.token + ' — ' + orphan.reason)))
                : null,
              row.citationAudit.orphans.length > 8
                ? h('p', { className: 'ap-sub', style: { margin: '6px 0 0' } }, '…其余 ' + (row.citationAudit.orphans.length - 8) + ' 条见 orchestration/citation-audit.json')
                : null,
            ),
          ) : null,
          notice ? h('div', { className: 'ap-sub', style: { padding: '10px 0 0' } }, notice) : null,
          monitorState.note && monitoringHere ? h('div', { className: 'ap-sub', style: { padding: '4px 0 0' } }, '监控：' + monitorState.note) : null,
          draft ? h('section', { className: 'ap-sec' },
            h('div', { className: 'ap-sub' }, '阶段稿（最近一次准备的内容；提交后由 dsh 原生 subagent / workflow 执行）'),
            h('div', { className: 'ap-draft' }, draft),
          ) : null,
        )
      }

      return h('div', { className: 'ap-wb' },
        h('header', { className: 'ap-hdr' },
          h('h1', null, tAp('workbench.title')),
          h('div', { className: 'ap-path', title: cwd },
            Icon('folder', 14),
            h('span', null, cwd || tAp('wb.noCwd')),
          ),
          props.onClose
            ? h('div', { className: 'ap-actions', style: { marginTop: 10 } },
              h('button', { type: 'button', className: 'ap-btn', onClick: props.onClose }, tAp('wb.back')),
            )
            : null,
        ),
        h('div', { className: 'ap-toolbar' },
          h('div', { className: 'ap-mods' },
            catalog.map((item) => h('button', {
              key: item.id,
              type: 'button',
              className: 'ap-mod' + (module === item.id ? ' on' : ''),
              onClick: () => selectModule(item.id),
            }, moduleIconNode(item, 15), moduleLabel(item))),
            h('button', {
              type: 'button',
              className: 'ap-mod' + (module === 'kb' ? ' on' : ''),
              title: tAp('wb.kbTitle'),
              onClick: () => selectModule('kb'),
            }, Icon('book', 15), tAp('wb.kb')),
            h('button', {
              type: 'button',
              className: 'ap-mod' + (module === 'modules' ? ' on' : ''),
              title: tAp('wb.modulesTitle'),
              onClick: () => selectModule('modules'),
            }, Icon('settings', 15), tAp('wb.modules')),
            h('button', {
              type: 'button',
              className: 'ap-mod' + (module === 'archive' ? ' on' : ''),
              title: tAp('archive.lead'),
              onClick: () => selectModule('archive'),
            }, Icon('archive', 15), tAp('archive.title')),
          ),
          module === 'kb' || module === 'modules' || module === 'archive' ? null : h('div', { className: 'ap-actions' },
            h('button', { type: 'button', className: 'ap-btn', onClick: () => refresh() },
              Icon('refresh', 14, refreshing ? 'ap-spin' : ''), tAp('wb.refresh')),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              disabled: !cwd,
              title: tAp('wb.adoptTitle'),
              onClick: openAdopt,
            }, Icon('layout', 14), tAp('wb.adopt')),
            h('button', { type: 'button', className: 'ap-btn primary', onClick: openCreate },
              Icon('plus', 14), tAp('wb.create')),
          ),
        ),
        data && data.moduleErrors && data.moduleErrors.length
          ? h('div', { className: 'ap-err', style: { padding: '8px 24px 0' } },
            tAp('wb.moduleErrors', { n: data.moduleErrors.length }))
          : null,
        error ? h('div', { className: 'ap-err', style: { padding: '8px 24px 0' } }, error) : null,
        module === 'kb'
          ? h(KnowledgeBasePanel, { cwd, sessionId: pinParentSessionId() || resolveSessionId(props) || runtime.sessionId || '' })
          : module === 'archive'
          ? h(ArchivePanel, { onClose: props.onClose })
          : module === 'modules'
          ? h(ModuleManagerPanel, {
            cwd,
            onChanged: () => refresh(true),
            onOpened: (id) => {
              refresh(true).then(() => selectModule(id))
            },
            onDesign: (kind) => {
              const known = (data && data.modules ? data.modules : catalog).map((item) => item.id)
              try {
                sessionStorage.setItem('ap-wb-known-modules', JSON.stringify(known))
                sessionStorage.setItem('ap-wb-await-module', '1')
              } catch {}
              fillComposer(props, MODULE_CREATE_PROMPTS[kind] || MODULE_CREATE_PROMPTS['custom-steps'])
              if (props.onClose) props.onClose()
            },
          })
          : projects.length === 0 && !error
          ? h('div', { className: 'ap-landing' },
            h('div', { className: 'ap-landing-inner' },
              moduleIconNode(current, 32),
              h('h1', null, current ? moduleLabel(current) : tAp('workbench.title')),
              h('p', null, tAp('wb.landing')),
              h('div', { className: 'ap-landing-actions' },
                h('button', {
                  type: 'button',
                  className: 'ap-btn',
                  disabled: !cwd,
                  onClick: openAdopt,
                }, Icon('layout', 16), tAp('wb.upgrade')),
                h('button', { type: 'button', className: 'ap-btn primary', onClick: openCreate },
                  Icon('plus', 16), tAp('wb.create')),
              ),
            ),
          )
          : h('div', { className: 'ap-ov' },
            h('aside', { className: 'ap-col' },
              h('div', { className: 'ap-col-hd' }, tAp('wb.projects')),
              projects.map((item) => h('button', {
                key: item.project.projectId,
                type: 'button',
                className: 'ap-proj' + (item.project.projectId === selectedId ? ' on' : ''),
                onClick: () => selectProject(item.project.projectId),
              },
                h('strong', null, item.project.name),
                h('em', null, item.project.projectId),
              )),
            ),
            row ? renderOverview(row) : h('div', { className: 'ap-landing' }, h('p', { className: 'ap-sub' }, tAp('wb.pickProject'))),
          ),
        picking
          ? h('div', { className: 'ap-overlay', onClick: (e) => { if (e.target === e.currentTarget) setPicking(false) } },
            h('div', { className: 'ap-modal wide' },
              h('h1', null, Icon('filePlus', 18), '添加资料'),
              h('p', { className: 'hint' }, '仅限用户明确登记的文件。企业工效表可一起登记，有则优先于网络调研。'),
              h(FilePickPanel, {
                cwd,
                selected: pickSelected,
                onToggle: togglePick,
              }),
              h('div', { className: 'ap-foot' },
                h('button', { type: 'button', className: 'ap-btn', onClick: () => setPicking(false) }, '取消'),
                h('button', { type: 'button', className: 'ap-btn primary', disabled: busy === 'files', onClick: saveFiles }, '保存登记'),
              ),
            ),
          )
          : null,
      )
    }

    function CreateOverlay(props) {
      useApLang()
      const sessionCwd = readWorkspaceCwd(props)
      const [open, setOpen] = React.useState(false)
      const [mode, setMode] = React.useState('create')
      const [step, setStep] = React.useState(0)
      const [module, setModule] = React.useState('tender')
      const [name, setName] = React.useState('')
      const [projectId, setProjectId] = React.useState('')
      const [idEdited, setIdEdited] = React.useState(false)
      const [folderMode, setFolderMode] = React.useState('create')
      const [selectedPath, setSelectedPath] = React.useState('')
      const [attachments, setAttachments] = React.useState([])
      const [error, setError] = React.useState('')
      const [saving, setSaving] = React.useState(false)
      const [cwd, setCwd] = React.useState('')
      const [catalog, setCatalog] = React.useState(null)
      const [preview, setPreview] = React.useState(null)

      const reset = () => {
        setStep(0)
        setName('')
        setProjectId('')
        setIdEdited(false)
        setFolderMode('create')
        setSelectedPath('')
        setAttachments([])
        setError('')
        setSaving(false)
        setPreview(null)
      }

      React.useEffect(() => {
        const onOpen = (event) => {
          const fromEvent = event && event.detail && event.detail.cwd
          const nextMode = event && event.detail && event.detail.mode === 'adopt' ? 'adopt' : 'create'
          const nextModule = event && event.detail && event.detail.module
          if (nextModule) setModule(nextModule)
          const nextCwd = fromEvent || sessionCwd || ''
          setMode(nextMode)
          setCwd(nextCwd)
          reset()
          setOpen(true)
          api('/api/agent-pi/modules', nextCwd, { method: 'GET' })
            .then((body) => setCatalog(body.modules || null))
            .catch(() => setCatalog(null))
          if (nextMode !== 'adopt' || !nextCwd) return
          setFolderMode('existing')
          setSelectedPath(nextCwd)
          const folder = fileName(nextCwd)
          setName(folder)
          setProjectId(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(folder) ? folder : (slugify(folder) || folder))
          setIdEdited(true)
          const previewUrl = '/api/agent-pi/projects/adopt-preview' + (nextModule ? ('?module=' + encodeURIComponent(nextModule)) : '')
          api(previewUrl, nextCwd, { method: 'GET' })
            .then((body) => {
              setPreview(body)
              if (body.name) setName(body.name)
              if (body.projectId) setProjectId(body.projectId)
              if (Array.isArray(body.suggestedInputs)) setAttachments(body.suggestedInputs)
            })
            .catch(() => {})
        }
        window.addEventListener('agent-pi-open-create', onOpen)
        return () => window.removeEventListener('agent-pi-open-create', onOpen)
      }, [sessionCwd])

      if (!open) return h('span', { style: { pointerEvents: 'none' } })
      const desktop = desktopApi()
      const catalogRows = catalog || Object.values(MODULES)
      const catalogRow = catalogRows.find((item) => item.id === module) || null
      const current = catalogRow || MODULES[module] || { id: module, labelZh: module }
      const workflow = catalogRow && catalogRow.workflow ? catalogRow.workflow : null
      const normalizedId = projectId.trim() || (slugify(name) || (module + '-' + Date.now().toString(36)))
      const adopt = mode === 'adopt'
      const existingHere = ((preview && preview.existing) || []).find((item) => item.module === module)
      const rootPath = adopt
        ? cwd
        : selectedPath
          ? (folderMode === 'create' ? joinPath(selectedPath, normalizedId) : selectedPath)
          : ''
      const canContinue = adopt
        ? (step === 0 ? Boolean(module) : step === 1 ? Boolean(name.trim() && normalizedId && cwd) : true)
        : (step === 0
          ? Boolean(name.trim() && normalizedId)
          : step === 1
            ? Boolean(selectedPath)
            : true)
      const close = () => { if (!saving) { setOpen(false); reset() } }

      const finishCreated = (createdId) => {
        setOpen(false)
        reset()
        window.dispatchEvent(new CustomEvent('agent-pi-created', {
          detail: { projectId: createdId, module },
        }))
      }

      const handleCreate = () => {
        if (!rootPath || saving) return
        if (adopt && existingHere) {
          finishCreated(existingHere.projectId)
          return
        }
        setSaving(true)
        setError('')
        const body = adopt
          ? { action: 'adopt', module, name: name.trim(), projectId: normalizedId, inputPaths: attachments }
          : {
            module,
            name: name.trim(),
            projectId: normalizedId,
            rootPath,
            createDirectory: folderMode === 'create',
            inputPaths: attachments,
          }
        api('/api/agent-pi/projects', cwd, {
          method: 'POST',
          body: JSON.stringify(body),
        }).then((created) => {
          const createdId = created && created.project ? created.project.projectId : normalizedId
          finishCreated(createdId)
          if (adopt) return
          // Initialize the first stage slice so the dashboard shows the board, but do
          // not touch the conversation: material registration is a human step, and
          // model stages start from explicit buttons (继续推进 / 进入此阶段).
          const firstStage = workflow
            ? (workflow.setupStageId || (workflow.stages[0] && workflow.stages[0].id))
            : (module === 'tender' ? 'project-setup' : module === 'delivery' ? 'delivery-setup' : module === 'investment' ? 'investment-setup' : '')
          if (!firstStage) return
          api('/api/agent-pi/stage', cwd, {
            method: 'POST',
            body: JSON.stringify({ action: 'prepare', module, projectId: createdId, stageId: firstStage }),
          }).catch(() => {})
        }).catch((e) => {
          setError(String(e.message || e))
          setSaving(false)
        })
      }

      const toggleAttach = (path, _name, forceAdd) => {
        setAttachments((currentPaths) => {
          const has = currentPaths.indexOf(path) >= 0
          if (forceAdd && has) return currentPaths
          if (has) return currentPaths.filter((item) => item !== path)
          return currentPaths.concat([path])
        })
      }

      const steps = adopt
        ? [tAp('create.step.module'), tAp('create.step.info'), tAp('create.step.files'), tAp('create.step.confirmAdopt')]
        : [tAp('create.step.info'), tAp('create.step.folder'), tAp('create.step.files'), tAp('create.step.confirmNew')]
      const FALLBACK_STAGE_LABELS = {
        tender: ['项目资料登记', '招标文件解析', 'BOQ 逐页组价与资源汇总', '施工策划、进度、成本与出稿'],
        delivery: ['实施工作区建立', '合同范围 / 进度 / 成本 / 风险'],
        investment: ['授权与工作区', '尽调与决策包'],
      }
      const stageLabels = {}
      stageLabels[module] = workflow
        ? workflow.stages.map((stage) => stage.labelZh)
        : (FALLBACK_STAGE_LABELS[module] || [])
      const showName = adopt ? step === 1 : step === 0
      const showFolder = !adopt && step === 1
      const showFiles = step === 2
      const showConfirm = step === 3

      return h('div', { className: 'ap-overlay', onClick: (e) => { if (e.target === e.currentTarget) close() } },
        h('div', { className: 'ap-modal wide' },
          h('button', { type: 'button', className: 'ap-close', onClick: close, 'aria-label': tAp('create.close') }, Icon('x', 16)),
          h('h1', null, adopt ? tAp('create.titleAdopt') : tAp('create.titleNew', { name: moduleLabel(current) })),
          h('p', { className: 'hint' }, adopt ? tAp('create.hintAdopt') : tAp('create.hintNew')),
          h('div', { className: 'ap-steps' },
            steps.map((label, index) => h('span', { key: label, className: index === step ? 'on' : '' }, (index + 1) + '. ' + label)),
          ),
          adopt && step === 0 ? h('div', null,
            h('p', { className: 'ap-sub' }, tAp('create.whichModule')),
            h('div', { className: 'ap-mods', style: { flexWrap: 'wrap', marginTop: 10 } },
              catalogRows.filter((item) => !item.disabled).map((item) => h('button', {
                key: item.id,
                type: 'button',
                className: 'ap-mod' + (module === item.id ? ' on' : ''),
                onClick: () => setModule(item.id),
              }, moduleIconNode(item, 15), moduleLabel(item))),
            ),
            existingHere
              ? h('p', { className: 'ap-sub', style: { marginTop: 12 } }, '当前工作区已是本模块项目「' + existingHere.name + '」，确认后直接打开。')
              : null,
          ) : null,
          showName ? h('div', null,
            h('label', null, '项目名称'),
            h('input', {
              value: name,
              autoFocus: true,
              placeholder: '例如：N3 公路升级投标',
              onChange: (e) => {
                const value = e.target.value
                setName(value)
                if (!idEdited) setProjectId(slugify(value))
              },
            }),
            h('label', null, '项目标识'),
            h('input', {
              value: projectId,
              placeholder: 'n3-upgrade',
              onChange: (e) => {
                setIdEdited(true)
                setProjectId(e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128))
              },
            }),
            h('p', { className: 'ap-sub' }, adopt
              ? '默认用当前工作区文件夹名。与正式成果目录对齐后，已有 Official Outputs 会挂到本项目。'
              : '用于项目状态目录和会话归类，不改变实际文件名。'),
          ) : null,
          showFolder ? h('div', null,
            h('div', { className: 'ap-mode' },
              h('button', {
                type: 'button',
                className: 'ap-btn' + (folderMode === 'create' ? ' primary' : ''),
                onClick: () => setFolderMode('create'),
              }, '新建项目文件夹'),
              h('button', {
                type: 'button',
                className: 'ap-btn' + (folderMode === 'existing' ? ' primary' : ''),
                onClick: () => setFolderMode('existing'),
              }, '关联现有项目文件夹'),
            ),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              style: { width: '100%', justifyContent: 'flex-start' },
              onClick: () => {
                if (desktop && typeof desktop.pickFolder === 'function') {
                  desktop.pickFolder().then((path) => { if (path) setSelectedPath(path) })
                  return
                }
                const fallback = window.prompt(folderMode === 'create' ? '上级目录绝对路径' : '现有项目目录绝对路径', selectedPath || cwd)
                if (fallback) setSelectedPath(fallback)
              },
            }, Icon('folder', 14), selectedPath || (folderMode === 'create' ? '选择上级目录' : '选择现有项目目录')),
            !selectedPath && cwd
              ? h('button', {
                type: 'button',
                className: 'ap-btn link',
                onClick: () => setSelectedPath(cwd),
              }, '使用当前工作区：' + cwd)
              : null,
            rootPath ? h('p', { className: 'ap-sub' }, '项目资料/成果目录：' + rootPath + '（阶段状态与编排数据保存在当前工作区，不写入该目录）') : null,
          ) : null,
          showFiles ? h(FilePickPanel, { cwd, selected: attachments, onToggle: toggleAttach }) : null,
          showConfirm ? h('div', { className: 'ap-confirm' },
            h('p', { style: { fontWeight: 600 } }, moduleLabel(current)),
            h('p', { className: 'ap-sub' }, adopt
              ? (existingHere
                ? '该工作区已登记过本模块，确认后打开已有项目。'
                : '不另建文件夹。已有正式成果保留；盘面从“' + ((stageLabels[module] || [])[0] || '资料登记') + '”起，不会自动改写后续阶段。')
              : '新项目从“' + (stageLabels[module] || [])[0] + '”开始；后续阶段在工作台切换。'),
            h('ol', { style: { paddingLeft: 18, margin: '10px 0' } },
              (stageLabels[module] || []).map((label) => h('li', { key: label, style: { margin: '6px 0', paddingBottom: 6, borderBottom: '1px solid var(--dsw-alias-border-l2)' } }, label)),
            ),
            h('p', null, h('span', { className: 'k' }, '项目：'), name),
            h('p', null, h('span', { className: 'k' }, '目录：'), rootPath),
            h('p', null, h('span', { className: 'k' }, '登记资料：'), attachments.length + ' 个'),
            adopt && preview && preview.officialCount
              ? h('p', null, h('span', { className: 'k' }, '已有正式成果：'), preview.officialCount + ' 份（保留）')
              : null,
          ) : null,
          error ? h('div', { className: 'ap-err' }, error) : null,
          h('div', { className: 'ap-foot' },
            step > 0 ? h('button', { type: 'button', className: 'ap-btn', disabled: saving, onClick: () => setStep((n) => n - 1) }, '上一步') : h('button', { type: 'button', className: 'ap-btn', disabled: saving, onClick: close }, '取消'),
            step < 3
              ? h('button', { type: 'button', className: 'ap-btn primary', disabled: !canContinue, onClick: () => setStep((n) => n + 1) }, '下一步')
              : h('button', {
                type: 'button',
                className: 'ap-btn primary',
                disabled: saving || !rootPath,
                onClick: handleCreate,
              }, saving
                ? (adopt ? '升级中…' : '创建中…')
                : (adopt
                  ? (existingHere ? '打开已有项目' : '升级为专业项目')
                  : '创建项目（登记资料后再启动阶段）')),
          ),
        ),
      )
    }

    function replaceChildren(nodes, path, children) {
      return (nodes || []).map((node) => {
        if (node.path === path) return Object.assign({}, node, { children: children, childrenLoaded: true, hasMoreChildren: false })
        if (node.children) return Object.assign({}, node, { children: replaceChildren(node.children, path, children) })
        return node
      })
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
      const [aiSel, setAiSel] = React.useState(null)
      const [sheetTab, setSheetTab] = React.useState(0)
      const [univerDirty, setUniverDirty] = React.useState(false)
      const [recalcPrompt, setRecalcPrompt] = React.useState(null)
      const editRef = React.useRef(null)
      const wysiwygRef = React.useRef(null)
      const previewBoxRef = React.useRef(null)
      const univerRef = React.useRef(null)
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
      const isOfficeUniver = !!(isOffice && office && office.engine === 'univer-office' && office.viewerUrl)
      const isSlimUniver = !!(kind === 'spreadsheet' && office && office.engine === 'univer' && office.viewerUrl)
      const isUniver = !!(isOfficeUniver || isSlimUniver)
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

      const saveContent = (content) => {
        if (!canEdit || busy) return
        if (isOfficeUniver) return
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
        api('/api/agent-pi/files/delete', cwd, { method: 'POST', body: JSON.stringify({ path: file.path }) })
          .then(() => {
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
            DocBtn('AI 改', () => openAiSel(), [Icon('sparkles', 14), 'AI 改'], loading || !!busy),
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
            kbSlug ? null : (canExport ? h('div', { className: 'ap-doc-exports' },
              DocBtn('导出 Markdown', () => exportFile('md'), [Icon('download', 14), ' MD'], !!busy),
              DocBtn('导出 PDF', () => exportFile('pdf'), [Icon('download', 14), ' PDF'], !!busy),
              DocBtn('导出 Word', () => exportFile('docx'), [Icon('download', 14), ' DOCX'], !!busy),
            ) : null),
            kind === 'binary' || kind === 'pdf' || kind === 'image' || isOffice || kind === 'html' ? DocBtn('下载原件', () => {
              apiBlob('/api/agent-pi/files/raw?path=' + encodeURIComponent(file.path), cwd, { method: 'GET' })
                .then((result) => downloadBlob(result.blob, result.filename || file.name))
                .catch((e) => setError(String(e.message || e)))
            }, [Icon('download', 14)], !!busy) : null,
            DocBtn('关闭', props.onClose, [Icon('x', 14)]),
          ),
        ),
        h('div', { className: 'ap-doc-scroll' + (isUniver ? ' univer' : '') },
          isUniver
            ? h(React.Fragment, null,
              error ? h('div', { className: 'ap-err', style: { padding: '8px 12px', position: 'relative', zIndex: 2 } }, error) : null,
              !isOfficeUniver && status ? h('div', { className: 'ap-doc-status', style: { padding: '8px 12px' } }, status) : null,
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

    function ComposerTools(props) {
      captureComposerFace(props)
      const live = snapshotComposer()
      const cwd = live.cwd
      const draft = readDraft()
      const [busy, setBusy] = React.useState(false)
      const [items, setItems] = useAttachItems()
      const fileInput = React.useRef(null)
      wrapComposerSubmit(live)
      React.useEffect(() => { if (items.length) stripComposerMentions(items) }, [items.length])
      const propsRef = React.useRef(live)
      propsRef.current = live
      const [, setCodexTurnTick] = React.useState(0)
      React.useEffect(() => {
        const sync = () => setCodexTurnTick((tick) => tick + 1)
        codexTurnListeners.add(sync)
        return () => { codexTurnListeners.delete(sync) }
      }, [])
      const armed = codexTurnArmed(live)
      React.useEffect(() => {
        const onFill = (event) => {
          const text = event && event.detail && event.detail.text
          if (!text) return
          const current = currentDraft(propsRef.current).trimEnd()
          fillComposer(propsRef.current, event.detail.append && current ? current + '\n' + text : text)
        }
        window.addEventListener('agent-pi-fill-composer', onFill)
        return () => {
          window.removeEventListener('agent-pi-fill-composer', onFill)
        }
      }, [])
      React.useEffect(() => {
        const isSendButton = (btn) => {
          if (!btn || btn.closest('.ap-row') || btn.closest('.ap-attach-host') || btn.closest('.ap-attach-rail')) return false
          if (!btn.closest('[data-composer-card]')) return false
          if (!/primary/i.test(String(btn.className || ''))) return false
          const label = (btn.getAttribute('aria-label') || btn.textContent || '').trim()
          return !/停止|Stop|stop/i.test(label)
        }
        const onClick = (event) => {
          if (!attachItemsOf(attachSessionId(propsRef.current)).length) return
          if (!isSendButton(event.target.closest('button'))) return
          event.preventDefault()
          event.stopPropagation()
          if (codexTurnArmed(propsRef.current)) {
            const submit = propsRef.current && propsRef.current.inputActions && propsRef.current.inputActions.submit
            if (typeof submit === 'function') submit()
            return
          }
          foldAndSubmit(propsRef.current)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
          if (!attachItemsOf(attachSessionId(propsRef.current)).length) return
          const ta = event.target
          if (!ta || ta.tagName !== 'TEXTAREA' || !ta.closest('[data-composer-card]')) return
          event.preventDefault()
          event.stopPropagation()
          if (codexTurnArmed(propsRef.current)) {
            const submit = propsRef.current && propsRef.current.inputActions && propsRef.current.inputActions.submit
            if (typeof submit === 'function') submit()
            return
          }
          foldAndSubmit(propsRef.current)
        }
        document.addEventListener('click', onClick, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [])
      const polish = () => {
        if (!cwd || !draft.trim() || busy) return
        setBusy(true)
        // provider/model/connectionName stay empty: the host falls back to the
        // agent-default-model from settings.yaml.
        api('/api/agent-pi/optimize-prompt', cwd, {
          method: 'POST',
          body: JSON.stringify({
            input: draft,
            attachments: attachItemsOf(attachSessionId(live)).map((item) => ({
              name: item.name,
              type: item.kind,
              size: item.size,
            })),
            reasoningEffort: readReasoningEffort(),
          }),
        }).then((result) => {
          if (result.optimizedPrompt) fillComposer(live, result.optimizedPrompt)
          showToast(result.fallback ? '已用本地模板润色（当前模型未响应）' : '已用当前模型润色')
        }).catch((err) => {
          showToast('润色失败：' + String(err && err.message || err))
        }).finally(() => setBusy(false))
      }
      const uploaded = items.filter((item) => item.kind !== 'image').length
      return h('div', { className: 'ap-composer-tools' },
        h('div', { className: 'ap-row', style: { gap: 2 } },
          h('button', {
            type: 'button',
            className: 'ap-toolbtn' + (busy ? ' on' : ''),
            title: busy ? '正在用当前模型润色…' : '用当前模型润色提示词',
            disabled: busy || !draft.trim(),
            onMouseDown: (e) => e.preventDefault(),
            onClick: polish,
          }, Icon('sparkles', 15, busy ? 'ap-spin' : '')),
          h('button', {
            type: 'button',
            className: 'ap-codex-turn' + (armed ? ' on' : ''),
            'aria-pressed': armed ? 'true' : 'false',
            title: armed
              ? '下一条消息将由 Codex 子智能体执行'
              : '仅将下一条消息交给 Codex 子智能体',
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setCodexTurnArmed(propsRef.current, !armed),
          }, Icon('sparkles', 14), 'Codex 执行'),
          h('button', {
            type: 'button',
            className: 'ap-toolbtn',
            title: uploaded ? '已加入 ' + uploaded + ' 个文件' : '上传文件到对话（回形针）',
            onMouseDown: (e) => e.preventDefault(),
            onClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              chooseAndUpload(cwd, snapshotComposer(), 'files', { fileInput }).catch((err) => showToast('上传失败：' + String(err && err.message || err)))
            },
          }, Icon('paperclip', 15), uploaded ? h('span', { className: 'ap-badge' }, uploaded > 9 ? '9+' : uploaded) : null),
          h('button', {
            type: 'button',
            className: 'ap-toolbtn',
            title: tAp('files.addFolder'),
            onMouseDown: (e) => e.preventDefault(),
            onClick: (e) => {
              e.preventDefault()
              e.stopPropagation()
              chooseFolderForChat(cwd, snapshotComposer()).catch((err) => showToast('加入文件夹失败：' + String(err && err.message || err)))
            },
          }, Icon('folder', 15)),
          h('input', { ref: fileInput, type: 'file', multiple: true, style: { position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none' },           onChange: (e) => {
            const list = snapshotFileList(e.target.files)
            e.target.value = ''
            if (list.length) uploadFileList(cwd, list, snapshotComposer()).catch((err) => showToast('上传失败：' + String(err && err.message || err)))
          } }),
        ),
      )
    }

    function renderAttachRail(items, onRemove) {
      return h('div', { className: 'ap-attach-host', 'aria-label': '已加入对话的文件' },
        h('div', { className: 'ap-attach-rail' },
          items.map((item) => h('div', {
            key: item.id || item.relativePath,
            className: 'ap-attach-bubble' + (item.kind === 'image' ? ' image' : '') + (item.kind === 'folder' ? ' folder' : '') + (item.loaded === false ? ' loading' : ''),
            title: item.error || item.path || item.relativePath || item.name,
          },
            h('button', {
              type: 'button',
              className: 'ap-attach-x',
              title: '移除',
              onClick: () => onRemove(item),
            }, Icon('x', 10)),
            h('div', { className: 'ap-attach-thumb' },
              item.loaded === false
                ? Icon('sparkles', 16, 'ap-spin')
                : item.kind === 'image' && item.previewUrl
                  ? h('img', { src: item.previewUrl, alt: item.name })
                  : Icon(item.kind === 'folder' ? 'folder' : item.kind === 'text' ? 'fileText' : 'file', 16),
            ),
            item.kind === 'image' ? null : h('div', { className: 'ap-attach-meta' },
              h('strong', { title: item.path || item.relativePath || item.name }, item.name),
            ),
          )),
        ),
      )
    }

    function AttachmentDock(props) {
      captureComposerFace(props)
      wrapComposerSubmit(snapshotComposer())
      return null
    }

    function ensureComposerAttachHost() {
      const card = document.querySelector('[data-composer-card]')
      if (!card) return null
      let host = Array.prototype.find.call(card.children, (node) => node.classList && node.classList.contains('ap-attach-in-card'))
      if (!host) {
        host = document.createElement('div')
        host.className = 'ap-attach-in-card'
        const official = card.querySelector('[data-slot="conversation.input.attachments"]')
        if (official) official.insertAdjacentElement('afterend', host)
        else {
          const scroll = card.querySelector('[data-input-scroll]')
          if (scroll) card.insertBefore(host, scroll)
          else card.insertBefore(host, card.firstChild)
        }
      }
      return host
    }

    function AttachmentFloat() {
      useApLang()
      const [items, setItems] = useAttachItems()
      const [host, setHost] = React.useState(null)
      React.useEffect(() => {
        const place = () => setHost(ensureComposerAttachHost())
        place()
        window.addEventListener('resize', place)
        const timer = window.setInterval(place, 400)
        return () => {
          window.removeEventListener('resize', place)
          window.clearInterval(timer)
        }
      }, [items.length])
      if (!items.length) return null
      const rail = renderAttachRail(items, (item) => setItems(items.filter((row) => row !== item)))
      if (host && ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(rail, host)
      }
      const node = h('div', {
        className: 'ap-attach-float',
        style: { left: '50%', bottom: '168px', transform: 'translateX(-50%)', width: 'min(720px, calc(100vw - 48px))' },
      }, rail)
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function ToastHost() {
      const [text, setText] = React.useState('')
      React.useEffect(() => {
        let timer = 0
        const onToast = (event) => {
          const next = event && event.detail && event.detail.text
          if (!next) return
          setText(next)
          window.clearTimeout(timer)
          timer = window.setTimeout(() => setText(''), 4800)
        }
        window.addEventListener('agent-pi-toast', onToast)
        return () => {
          window.removeEventListener('agent-pi-toast', onToast)
          window.clearTimeout(timer)
        }
      }, [])
      if (!text) return null
      return h('div', { className: 'ap-toast', role: 'status' }, text)
    }

    function officialRpc(method, payload) {
      const rpcId = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2)
      return fetch('/rpc/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: rpcId, method: method, payload: payload }),
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((body && body.error && body.error.message) || res.statusText)
        const result = body.result
        if (!result) throw new Error('empty rpc result')
        if (result.ok === false) throw new Error((result.error && (result.error.message || result.error.code)) || method + ' failed')
        return result.value
      })
    }

    function officialDialogOpen() {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      for (const node of dialogs) {
        if (node.closest('.ap-keydlg')) continue
        const text = node.textContent || ''
        if (/添加一个 API Key 开始使用|Add an API key to get started|内测声明|Internal Testing Notice/.test(text)) return true
      }
      return false
    }

    function DeepSeekKeyDialog() {
      const [view, setView] = React.useState('hidden')
      const [key, setKey] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        let cancelled = false
        const later = () => {
          try { return sessionStorage.getItem('ap-deepseek-key-later') === '1' } catch { return false }
        }
        const probe = () => {
          if (later() || officialDialogOpen()) {
            if (!cancelled) setView('hidden')
            return
          }
          officialRpc('credentials.describe', { refs: ['DEEPSEEK_API_KEY'] }).then((value) => {
            if (cancelled) return
            const cred = value && value.credentials && value.credentials.DEEPSEEK_API_KEY
            if (!cred || cred.configured !== true) setView('form')
            else if (cred.writable === false) setView('env')
            else setView('hidden')
          }).catch(() => {
            if (!cancelled) setView('hidden')
          })
        }
        const start = window.setTimeout(probe, 800)
        const timer = window.setInterval(probe, 2500)
        return () => {
          cancelled = true
          window.clearTimeout(start)
          window.clearInterval(timer)
        }
      }, [])
      const dismiss = () => {
        try { sessionStorage.setItem('ap-deepseek-key-later', '1') } catch {}
        setView('hidden')
      }
      const save = () => {
        const value = key.trim()
        if (!value || busy) return
        setBusy(true)
        setError('')
        officialRpc('credentials.set', { ref: 'DEEPSEEK_API_KEY', value: value }).then(() => {
          setView('hidden')
          showToast('已保存 DeepSeek API Key')
        }).catch((err) => {
          setError(String(err && err.message || err))
        }).finally(() => setBusy(false))
      }
      if (view === 'hidden') return null
      const node = h('div', { className: 'ap-keydlg', role: 'presentation' },
        h('div', { className: 'ap-keydlg-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-keydlg-title' },
          h('h2', { id: 'ap-keydlg-title' }, '添加一个 API Key 开始使用'),
          view === 'env'
            ? h('p', null, '当前密钥由启动环境提供，模型设置里无法改写。请完全退出应用后重新打开，即可在「模型」中填写默认 DeepSeek Key。')
            : h('p', null, '配置 DeepSeek 官方模型，即可开始使用。'),
          view === 'form' ? h('label', { className: 'ap-keydlg-field' },
            h('span', null, 'API 密钥'),
            h('input', {
              type: 'password',
              autoComplete: 'off',
              autoFocus: true,
              placeholder: '输入 API 密钥',
              value: key,
              onChange: (e) => setKey(e.target.value),
            }),
          ) : null,
          error ? h('p', { className: 'ap-keydlg-error', role: 'alert' }, error) : null,
          h('div', { className: 'ap-keydlg-actions' },
            h('button', { type: 'button', className: 'ap-btn', onClick: dismiss }, view === 'env' ? '知道了' : '稍后配置'),
            view === 'form' ? h('button', {
              type: 'button',
              className: 'ap-btn primary',
              disabled: busy || !key.trim(),
              onClick: save,
            }, busy ? '保存中…' : '保存并继续') : null,
          ),
        ),
      )
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    function clampFilesRailWidth(px) {
      const n = Math.round(Number(px))
      if (!Number.isFinite(n) || n <= 0) return 300
      return Math.min(560, Math.max(220, n))
    }

    function readFilesRailWidth() {
      try { return clampFilesRailWidth(localStorage.getItem('ap-files-width') || 300) } catch { return 300 }
    }

    function writeFilesRailWidth(px) {
      const next = clampFilesRailWidth(px)
      try { localStorage.setItem('ap-files-width', String(next)) } catch {}
      return next
    }

    function FilesRail(props) {
      useApLang()
      const cwd = readWorkspaceCwd(props)
      const sessionId = activeSessionId(props)
      const [open, setOpen] = React.useState(() => {
        try { return sessionStorage.getItem('ap-files-open') !== '0' } catch { return true }
      })
      const [railWidth, setRailWidth] = React.useState(readFilesRailWidth)
      const [resizing, setResizing] = React.useState(false)
      const railWidthRef = React.useRef(railWidth)
      railWidthRef.current = railWidth
      const setRailOpen = (next) => {
        setOpen(next)
        try { sessionStorage.setItem('ap-files-open', next ? '1' : '0') } catch {}
      }
      const startRailResize = (event) => {
        if (!open) return
        event.preventDefault()
        event.stopPropagation()
        const startX = event.clientX
        const startW = clampFilesRailWidth(railWidthRef.current)
        setResizing(true)
        document.documentElement.classList.add('ap-rail-resizing')
        const onMove = (ev) => {
          const next = clampFilesRailWidth(startW + (startX - ev.clientX))
          railWidthRef.current = next
          setRailWidth(next)
          document.documentElement.style.setProperty('--ap-files-w', next + 'px')
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          document.documentElement.classList.remove('ap-rail-resizing')
          setResizing(false)
          writeFilesRailWidth(railWidthRef.current)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }
      // Preview stack: opening pushes, closing pops. Clicking a source citation
      // inside a Markdown preview must return to that Markdown on close, not exit.
      const [stack, setStack] = React.useState([])
      const preview = stack.length > 0 ? stack[stack.length - 1] : null
      React.useEffect(() => {
        const onOpen = () => {
          setRailOpen(true)
        }
        window.addEventListener('agent-pi-open-files', onOpen)
        const onOpenFile = (event) => {
          const detail = event && event.detail
          const path = detail && detail.path
          if (!path) return
          setRailOpen(true)
          setStack((prev) => {
            const top = prev.length > 0 ? prev[prev.length - 1] : null
            if (top && top.type === 'file' && top.file && top.file.path === path && (!detail.kbSlug || top.file.kbSlug === detail.kbSlug)) return prev
            return prev.concat([{
              type: 'file',
              file: {
                path: path,
                name: detail.name || fileName(path),
                type: 'file',
                kbSlug: detail.kbSlug || '',
                kbHasSource: !!detail.kbHasSource,
              },
            }])
          })
        }
        window.addEventListener('agent-pi-open-file', onOpenFile)
        const onClosePreview = () => setStack([])
        window.addEventListener('agent-pi-close-preview', onClosePreview)
        return () => {
          window.removeEventListener('agent-pi-open-files', onOpen)
          window.removeEventListener('agent-pi-open-file', onOpenFile)
          window.removeEventListener('agent-pi-close-preview', onClosePreview)
        }
      }, [])
      React.useEffect(() => {
        const hasWorkspace = !!(cwd || sessionId)
        const reserved = hasWorkspace ? (open ? clampFilesRailWidth(railWidth) : 56) : 0
        if (reserved) document.documentElement.style.setProperty('--ap-files-w', reserved + 'px')
        else document.documentElement.style.removeProperty('--ap-files-w')
        document.documentElement.classList.toggle('ap-files-rail', hasWorkspace)
        document.documentElement.classList.toggle('ap-files-collapsed', !!(hasWorkspace && !open))
        document.documentElement.classList.toggle('ap-doc-open', !!preview)
      }, [cwd, sessionId, open, preview, railWidth])
      React.useEffect(() => {
        return () => {
          document.documentElement.classList.remove('ap-files-rail')
          document.documentElement.classList.remove('ap-files-collapsed')
          document.documentElement.classList.remove('ap-doc-open')
          document.documentElement.style.removeProperty('--ap-files-w')
        }
      }, [])
      const openFile = React.useCallback((file, fromFolder) => {
        setStack(fromFolder
          ? [{ type: 'folder', file: fromFolder }, { type: 'file', file: file }]
          : [{ type: 'file', file: file }])
      }, [])
      const openFolder = React.useCallback((file) => {
        setStack([{ type: 'folder', file: file }])
      }, [])
      const closePreview = React.useCallback(() => {
        setStack((prev) => prev.slice(0, -1))
      }, [])
      if (!cwd && !sessionId) return h('span', { style: { pointerEvents: 'none' } })
      const overlay = preview && preview.type === 'folder'
        ? h(FolderPreviewOverlay, {
          cwd: cwd,
          folder: preview.file,
          sessionProps: props,
          onClose: closePreview,
          onOpenFile: (file) => setStack((prev) => prev.concat([{ type: 'file', file: file }])),
        })
        : preview && preview.type === 'file'
          ? h(FilePreviewOverlay, {
            key: preview.file.kbSlug || preview.file.path,
            cwd: cwd,
            file: preview.file,
            kbSlug: preview.file.kbSlug || '',
            kbHasSource: !!preview.file.kbHasSource,
            sessionProps: props,
            onClose: closePreview,
            onDeleted: closePreview,
            onKbSaved: () => window.dispatchEvent(new Event('agent-pi-files-changed')),
          })
          : null
      const rail = h('div', {
        className: 'ap-files-dock' + (open ? '' : ' collapsed') + (resizing ? ' resizing' : ''),
        'data-files-collapsed': open ? undefined : 'true',
      },
        open ? h('div', {
          className: 'ap-files-resizer',
          title: tAp('files.resize'),
          'aria-label': tAp('files.resize'),
          role: 'separator',
          'aria-orientation': 'vertical',
          onPointerDown: startRailResize,
        }) : null,
        h(FilesPanel, Object.assign({}, props, {
          collapsed: !open,
          onOpenFile: openFile,
          onOpenFolder: openFolder,
          onToggle: () => { setRailOpen(!open) },
        })),
      )
      return h(React.Fragment, null, rail, overlay)
    }

    function FilesToggle() {
      useApLang()
      return h('button', {
        type: 'button',
        className: 'ap-header-tool',
        title: tAp('files.title'),
        'aria-label': tAp('files.title'),
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          window.dispatchEvent(new Event('agent-pi-open-files'))
        },
      }, Icon('folder', 16))
    }

    function HarvestOutputs(props) {
      const cwd = readWorkspaceCwd(props)
      const paths = props.matched || []
      React.useEffect(() => {
        if (!cwd || !paths.length) return
        api('/api/agent-pi/files/harvest', cwd, {
          method: 'POST',
          body: JSON.stringify({ paths: paths }),
        }).then((body) => {
          if (body && body.published) window.dispatchEvent(new Event('agent-pi-files-changed'))
        }).catch(() => {})
      }, [cwd, paths.join('|')])
      return null
    }

    function LanguageToggle() {
      const lang = useApLang()
      return h('button', {
        type: 'button',
        className: 'ap-lang',
        title: tAp('lang.title'),
        'aria-label': tAp('lang.title'),
        onClick: () => {
          const next = lang === 'zh' ? 'en' : 'zh'
          setApLang(next)
          if (runtime.locale && typeof runtime.locale.setLocale === 'function') {
            try { runtime.locale.setLocale(next) } catch {}
          }
        },
      }, lang === 'zh' ? h(React.Fragment, null, h('b', null, '中'), ' / EN') : h(React.Fragment, null, '中 / ', h('b', null, 'EN')))
    }

    function uniqueIds(ids) {
      const out = []
      const seen = new Set()
      for (const value of Array.isArray(ids) ? ids : []) {
        const id = String(value || '').trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        out.push(id)
      }
      return out
    }

    function visibleArchivedSessionIds(archivedIds, forgottenIds) {
      const forgotten = new Set(uniqueIds(forgottenIds))
      return uniqueIds(archivedIds).filter((id) => !forgotten.has(id))
    }

    function archiveSessionRows(input) {
      const payload = input && typeof input === 'object' ? input : {}
      const archived = visibleArchivedSessionIds(payload.archivedSessionIds, payload.forgottenSessionIds)
      const byId = payload.sessionsById && typeof payload.sessionsById === 'object' ? payload.sessionsById : {}
      const workspaceOf = {}
      for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
        if (!workspace) continue
        const title = String(workspace.title || workspace.path || '工作区')
        for (const sessionId of uniqueIds(workspace.sessionIds)) {
          workspaceOf[sessionId] = { id: String(workspace.workspaceId || ''), title }
        }
      }
      return archived.map((sessionId) => {
        const session = byId[sessionId] || {}
        const workspace = workspaceOf[sessionId]
        return {
          sessionId,
          title: String(session.displayTitle || session.title || '未命名对话'),
          blank: !!session.blank,
          updatedAt: Number(session.updatedAt) || 0,
          workspaceId: workspace ? workspace.id : '',
          workspaceTitle: workspace ? workspace.title : tAp('archive.ungrouped'),
        }
      }).sort((left, right) => (right.updatedAt - left.updatedAt) || left.title.localeCompare(right.title, 'zh'))
    }

    function groupArchiveRows(rows) {
      const groups = []
      const index = new Map()
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String((row && row.workspaceId) || '')
        if (!index.has(key)) {
          const group = { workspaceId: key, title: (row && row.workspaceTitle) || tAp('archive.ungrouped'), sessions: [] }
          index.set(key, group)
          groups.push(group)
        }
        index.get(key).sessions.push(row)
      }
      return groups
    }

    function workspaceActionTitle(label) {
      const text = String(label || '').trim()
      const zh = text.match(/^工作区[“"](.+)[”"]的操作$/)
      if (zh) return zh[1]
      const en = text.match(/^Workspace actions for (.+)$/)
      if (en) return en[1]
      return ''
    }

    function resolveWorkspaceByTitle(items, title, index) {
      const name = String(title || '').trim()
      if (!name) return null
      const matches = []
      for (const workspace of Array.isArray(items) ? items : []) {
        if (!workspace) continue
        const label = String(workspace.title || workspace.path || '').trim()
        if (label !== name) continue
        matches.push({
          workspaceId: String(workspace.workspaceId || ''),
          title: label,
          path: String(workspace.path || ''),
          sessionIds: uniqueIds(workspace.sessionIds),
        })
      }
      if (!matches.length) return null
      const at = Number(index)
      if (Number.isInteger(at) && at >= 0 && at < matches.length) return matches[at]
      return matches[0]
    }

    function archivedWorkspaceGroups(input) {
      const payload = input && typeof input === 'object' ? input : {}
      const archivedWs = new Set(uniqueIds(payload.archivedWorkspaceIds))
      const rows = archiveSessionRows(payload)
      const sessionGroups = groupArchiveRows(rows)
      const byId = new Map(sessionGroups.map((group) => [group.workspaceId, group]))
      const out = []
      const seen = new Set()
      for (const workspace of Array.isArray(payload.workspaces) ? payload.workspaces : []) {
        if (!workspace) continue
        const id = String(workspace.workspaceId || '')
        if (!id || !archivedWs.has(id)) continue
        const existing = byId.get(id)
        out.push({
          workspaceId: id,
          title: String(workspace.title || workspace.path || '工作区'),
          path: String(workspace.path || ''),
          kind: 'workspace',
          sessions: existing ? existing.sessions : [],
        })
        seen.add(id)
      }
      for (const group of sessionGroups) {
        if (group.workspaceId && seen.has(group.workspaceId)) continue
        out.push({
          workspaceId: group.workspaceId,
          title: group.title,
          path: '',
          kind: group.workspaceId ? 'sessions' : 'ungrouped',
          sessions: group.sessions,
        })
      }
      return out
    }

    function readWorkspaceListSnap() {
      const list = runtime.workspaces && runtime.workspaces.list
      if (list && typeof list.getSnapshot === 'function') return list.getSnapshot()
      return { items: [], archivedSessionIds: [] }
    }

    function readSessionListSnap() {
      const list = runtime.sessions && runtime.sessions.list
      if (list && typeof list.getSnapshot === 'function') return list.getSnapshot()
      return { byId: {}, current: undefined }
    }

    function archiveSessionById(sessionId) {
      const workspaces = runtime.workspaces
      if (!workspaces || typeof workspaces.archiveSession !== 'function') {
        return Promise.reject(new Error('会话服务还没就绪'))
      }
      return Promise.resolve(workspaces.archiveSession(sessionId))
    }

    function forgetSessionById(sessionId) {
      return api('/api/agent-pi/archive', '', {
        method: 'POST',
        body: JSON.stringify({ action: 'forget_session', sessionId }),
      })
    }

    let archiveStoreSnap = { forgottenSessionIds: [], archivedWorkspaceIds: [] }
    let lastWorkspaceMenuButton = null

    function rememberArchiveStore(body) {
      const next = {
        forgottenSessionIds: uniqueIds(body && body.forgottenSessionIds),
        archivedWorkspaceIds: uniqueIds(body && body.archivedWorkspaceIds),
      }
      const same = next.forgottenSessionIds.join('\0') === archiveStoreSnap.forgottenSessionIds.join('\0')
        && next.archivedWorkspaceIds.join('\0') === archiveStoreSnap.archivedWorkspaceIds.join('\0')
      archiveStoreSnap = next
      hideArchivedWorkspaceGroups()
      if (!same) window.dispatchEvent(new Event('agent-pi-archive-changed'))
      return archiveStoreSnap
    }

    function loadArchiveStore() {
      return api('/api/agent-pi/archive', '', { method: 'GET' })
        .then((body) => rememberArchiveStore(body))
        .catch(() => archiveStoreSnap)
    }

    function openArchivePage() {
      try { sessionStorage.setItem('ap-wb-module', 'archive') } catch {}
      window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'archive' }))
      setWorkbenchOpen(true)
    }

    function workspaceActionButtons() {
      return Array.from(document.querySelectorAll('button[aria-label]')).filter((btn) => (
        workspaceActionTitle(btn.getAttribute('aria-label'))
      ))
    }

    function resolveWorkspaceFromButton(button) {
      if (!button) return null
      const title = workspaceActionTitle(button.getAttribute('aria-label'))
      if (!title) return null
      const sameTitle = workspaceActionButtons().filter((btn) => (
        workspaceActionTitle(btn.getAttribute('aria-label')) === title
      ))
      return resolveWorkspaceByTitle(readWorkspaceListSnap().items, title, sameTitle.indexOf(button))
    }

    function hideArchivedWorkspaceGroups() {
      if (typeof document === 'undefined') return
      document.querySelectorAll('[data-ap-archived-workspace]').forEach((el) => {
        el.removeAttribute('data-ap-archived-workspace')
      })
      const archived = new Set(uniqueIds(archiveStoreSnap.archivedWorkspaceIds))
      if (!archived.size) return
      workspaceActionButtons().forEach((button) => {
        const workspace = resolveWorkspaceFromButton(button)
        if (!workspace || !archived.has(workspace.workspaceId)) return
        const row = button.closest('[role="treeitem"]')
        const section = row && row.parentElement
        if (!section) return
        section.setAttribute('data-ap-archived-workspace', workspace.workspaceId)
      })
    }

    function injectWorkspaceArchiveMenu(root) {
      const scope = root && root.querySelectorAll ? root : document
      const menus = []
      if (scope.matches && scope.matches('[role="menu"]')) menus.push(scope)
      if (scope.querySelectorAll) scope.querySelectorAll('[role="menu"]').forEach((menu) => menus.push(menu))
      menus.forEach((menu) => {
        if (menu.querySelector('[data-ap-archive-workspace]')) return
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
        const del = items.find((el) => {
          const text = (el.textContent || '').trim()
          return text === '删除工作区' || text === 'Delete workspace'
        })
        const rename = items.find((el) => {
          const text = (el.textContent || '').trim()
          return text === '重命名' || text === 'Rename'
        })
        if (!del || !rename || !del.parentElement || !rename.parentElement || !del.parentElement.parentElement) return
        const wrap = rename.parentElement.cloneNode(true)
        const btn = wrap.querySelector('[role="menuitem"]')
        if (!btn) return
        btn.setAttribute('data-ap-archive-workspace', '1')
        const spans = btn.querySelectorAll('span')
        const textSpan = spans[spans.length - 1]
        if (textSpan) textSpan.textContent = tAp('archive.workspace')
        else btn.textContent = tAp('archive.workspace')
        btn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const trigger = lastWorkspaceMenuButton
            || document.querySelector('button[aria-expanded="true"][aria-label]')
          archiveWorkspaceFromSidebar(resolveWorkspaceFromButton(trigger))
        })
        del.parentElement.parentElement.insertBefore(wrap, del.parentElement)
      })
    }

    function archiveWorkspaceFromSidebar(workspace) {
      if (!workspace || !workspace.workspaceId) {
        showToast(tAp('archive.workspaceFailed'))
        return
      }
      if (!window.confirm(tAp('archive.workspaceConfirm'))) return
      window.__apViewingArchived = ''
      Promise.all(uniqueIds(workspace.sessionIds).map((id) => archiveSessionById(id).catch(() => {})))
        .then(() => api('/api/agent-pi/archive', '', {
          method: 'POST',
          body: JSON.stringify({ action: 'mark_workspace', workspaceId: workspace.workspaceId }),
        }))
        .then((body) => {
          rememberArchiveStore(body)
          openArchivePage()
        })
        .catch((err) => showToast(tAp('archive.workspaceFailed') + '：' + String(err && err.message || err)))
    }

    function watchArchivedWorkspaces() {
      loadArchiveStore()
      const list = runtime.workspaces && runtime.workspaces.list
      if (list && typeof list.subscribe === 'function' && !list.__apArchiveHide) {
        list.__apArchiveHide = true
        list.subscribe(() => hideArchivedWorkspaceGroups())
      }
    }

    function guardArchivedSessionView(sessions, workspaces) {
      const sessionApi = sessions || runtime.sessions
      if (sessionApi && !sessionApi.__apArchiveGuard) {
        const origClear = typeof sessionApi.clear === 'function' ? sessionApi.clear.bind(sessionApi) : null
        const origOpen = typeof sessionApi.open === 'function' ? sessionApi.open.bind(sessionApi) : null
        if (origClear) {
          sessionApi.clear = function () {
            const snap = sessionApi.list && typeof sessionApi.list.getSnapshot === 'function'
              ? sessionApi.list.getSnapshot()
              : null
            const current = snap && snap.current
            if (current && window.__apViewingArchived === current) return
            window.__apViewingArchived = ''
            return origClear()
          }
        }
        if (origOpen) {
          sessionApi.open = function (sessionId) {
            if (window.__apViewingArchived && window.__apViewingArchived !== sessionId) {
              window.__apViewingArchived = ''
            }
            return origOpen(sessionId)
          }
        }
        sessionApi.__apArchiveGuard = true
      }
      const workspaceApi = workspaces || runtime.workspaces
      if (workspaceApi && typeof workspaceApi.startSession === 'function' && !workspaceApi.__apArchiveGuard) {
        const origStart = workspaceApi.startSession.bind(workspaceApi)
        workspaceApi.startSession = function () {
          window.__apViewingArchived = ''
          return origStart.apply(this, arguments)
        }
        workspaceApi.__apArchiveGuard = true
      }
    }

    function openArchivedSession(sessionId) {
      if (!sessionId || !runtime.sessions || typeof runtime.sessions.open !== 'function') {
        showToast('会话服务还没就绪')
        return
      }
      window.__apViewingArchived = sessionId
      setWorkbenchOpen(false)
      runtime.sessions.open(sessionId)
    }

    function ArchiveSession(props) {
      useApLang()
      const [busy, setBusy] = React.useState(false)
      const sessionId = props.sessionId || resolveSessionId(props)
      if (!sessionId) return null
      return h('button', {
        type: 'button',
        className: 'ap-header-tool',
        title: tAp('session.archiveTitle'),
        'aria-label': tAp('session.archive'),
        disabled: busy,
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (busy) return
          window.__apViewingArchived = ''
          setBusy(true)
          archiveSessionById(sessionId)
            .catch((err) => showToast(tAp('session.archiveFailed') + '：' + String(err && err.message || err)))
            .finally(() => setBusy(false))
        },
      }, Icon('archive', 16))
    }

    function ArchivePanel(props) {
      useApLang()
      const [forgotten, setForgotten] = React.useState(() => uniqueIds(archiveStoreSnap.forgottenSessionIds))
      const [archivedWorkspaceIds, setArchivedWorkspaceIds] = React.useState(() => uniqueIds(archiveStoreSnap.archivedWorkspaceIds))
      const [tick, setTick] = React.useState(0)
      const [busy, setBusy] = React.useState('')
      React.useEffect(() => {
        api('/api/agent-pi/archive', '', { method: 'GET' })
          .then((body) => {
            rememberArchiveStore(body)
            setForgotten(uniqueIds(body && body.forgottenSessionIds))
            setArchivedWorkspaceIds(uniqueIds(body && body.archivedWorkspaceIds))
          })
          .catch(() => {})
      }, [tick])
      React.useEffect(() => {
        const refresh = () => setTick((value) => value + 1)
        const unsubs = []
        if (runtime.workspaces && runtime.workspaces.list && typeof runtime.workspaces.list.subscribe === 'function') {
          unsubs.push(runtime.workspaces.list.subscribe(refresh))
        }
        if (runtime.sessions && runtime.sessions.list && typeof runtime.sessions.list.subscribe === 'function') {
          unsubs.push(runtime.sessions.list.subscribe(refresh))
        }
        window.addEventListener('agent-pi-archive-changed', refresh)
        return () => {
          unsubs.forEach((fn) => { try { fn() } catch {} })
          window.removeEventListener('agent-pi-archive-changed', refresh)
        }
      }, [])
      const workspaceSnap = readWorkspaceListSnap()
      const sessionSnap = readSessionListSnap()
      const groups = archivedWorkspaceGroups({
        archivedWorkspaceIds,
        archivedSessionIds: workspaceSnap.archivedSessionIds,
        forgottenSessionIds: forgotten,
        sessionsById: sessionSnap.byId,
        workspaces: workspaceSnap.items,
      })
      const deleteArchived = (sessionId) => {
        if (!window.confirm(tAp('session.deleteConfirm'))) return
        setBusy('del:' + sessionId)
        archiveSessionById(sessionId)
          .catch(() => {})
          .then(() => forgetSessionById(sessionId))
          .then((body) => {
            rememberArchiveStore(body)
            if (window.__apViewingArchived === sessionId) {
              window.__apViewingArchived = ''
              if (runtime.sessions && typeof runtime.sessions.clear === 'function') runtime.sessions.clear()
            }
            setTick((value) => value + 1)
          })
          .catch((err) => showToast(tAp('session.deleteFailed') + '：' + String(err && err.message || err)))
          .finally(() => setBusy(''))
      }
      const deleteWorkspace = (workspace) => {
        if (!workspace || !workspace.workspaceId) return
        if (!window.confirm(tAp('archive.deleteWorkspaceConfirm'))) return
        if (!runtime.workspaces || typeof runtime.workspaces.delete !== 'function') {
          showToast('工作区服务还没就绪')
          return
        }
        setBusy('wsd:' + workspace.workspaceId)
        Promise.resolve(runtime.workspaces.delete(workspace.workspaceId))
          .then(() => api('/api/agent-pi/archive', '', {
            method: 'POST',
            body: JSON.stringify({ action: 'forget_workspace', workspaceId: workspace.workspaceId }),
          }))
          .then((body) => {
            rememberArchiveStore(body)
            setTick((value) => value + 1)
          })
          .catch((err) => showToast(String(err && err.message || err)))
          .finally(() => setBusy(''))
      }
      return h('div', { className: 'ap-main' },
        h('section', { className: 'ap-sec' },
          h('h2', null, tAp('archive.title')),
          h('p', { className: 'ap-arch-lead' }, tAp('archive.lead')),
          groups.length === 0
            ? h('p', { className: 'ap-sub' }, tAp('archive.empty'))
            : groups.map((group) => h('div', {
              key: (group.kind || 'group') + ':' + (group.workspaceId || 'ungrouped'),
              className: 'ap-arch-group',
            },
              h('div', { className: 'ap-arch-group-hd' },
                h('h3', null, group.title + ' · ' + group.sessions.length + (group.kind === 'sessions' ? ' · ' + tAp('archive.workspaceLive') : '')),
                group.kind === 'workspace'
                  ? h('button', {
                    type: 'button',
                    className: 'ap-btn',
                    disabled: !!busy,
                    onClick: () => deleteWorkspace(group),
                  }, tAp('archive.deleteWorkspace'))
                  : null,
              ),
              group.sessions.length === 0
                ? h('p', { className: 'ap-arch-empty' }, tAp('archive.workspaceEmpty'))
                : group.sessions.map((row) => h('div', { key: row.sessionId, className: 'ap-arch-row' },
                  h('div', { className: 'grow' },
                    h('strong', null, row.title),
                    h('div', { className: 'ap-sub' }, row.sessionId),
                  ),
                  h('span', { className: 'ap-arch-actions' },
                    h('button', {
                      type: 'button',
                      className: 'ap-btn primary',
                      disabled: !!busy,
                      onClick: () => {
                        if (props.onClose) props.onClose()
                        openArchivedSession(row.sessionId)
                      },
                    }, tAp('archive.open')),
                    h('button', {
                      type: 'button',
                      className: 'ap-btn',
                      disabled: !!busy,
                      onClick: () => deleteArchived(row.sessionId),
                    }, tAp('archive.delete')),
                  ),
                )),
            )),
        ),
      )
    }

    function paintHeroLogo(root) {
      const scope = root && root.querySelectorAll ? root : document
      const nodes = new Set()
      scope.querySelectorAll('[data-phase="hero"] div:has(> span > svg[viewBox="0 0 23.16 17.04"])').forEach((el) => nodes.add(el))
      scope.querySelectorAll('[data-phase="hero"] [class*="stack"] > [class*="headline"]:not([class*="Text"])').forEach((el) => nodes.add(el))
      nodes.forEach((el) => {
        let img = el.querySelector(':scope > img.ap-hero-logo')
        if (!img) {
          img = document.createElement('img')
          img.className = 'ap-hero-logo'
          img.alt = 'Agent Pi DSH'
          el.insertBefore(img, el.firstChild)
        }
        if (img.getAttribute('src') !== BRAND_LOGO) img.src = BRAND_LOGO
      })
    }

    const BRAND_LOGO = '/api/agent-pi/brand/logo.png?v=8'
    const BRAND_FAVICON = '/api/agent-pi/brand/favicon.png?v=8'
    const COMPANY_LOGO = '/api/agent-pi/brand/company.png?v=5'
    const PRODUCT_NAME = 'Agent Pi DSH'

    let placingSidebar = false
    function sidebarParts() {
      const slot = document.querySelector('[data-slot="sidebar"]')
      const root = slot && slot.firstElementChild
      if (!root) return null
      let logoRow = null
      let newSession = null
      let region = null
      let foot = null
      for (let i = 0; i < root.children.length; i++) {
        const el = root.children[i]
        if (el.getAttribute && el.getAttribute('data-ap-mount')) continue
        if (el.querySelector && el.querySelector('[data-slot="sidebar.workspaces"]')) { region = el; continue }
        if (el.querySelector && el.querySelector('[data-slot="sidebar.settings"]')) { foot = el; continue }
        if (el.tagName === 'BUTTON') { newSession = el; continue }
        if (!logoRow) logoRow = el
      }
      return { root, logoRow, newSession, region, foot }
    }

    function ensureMount(id) {
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('div')
        el.id = id
        el.className = 'ap-mount'
        el.setAttribute('data-ap-mount', id)
      }
      return el
    }

    function fillPiMount(mount) {
      if (!mount) return
      let wrap = mount.querySelector('.ap-pi')
      if (!wrap) {
        wrap = document.createElement('div')
        wrap.className = 'ap-pi'
        wrap.setAttribute('aria-label', 'Agent Pi DSH')
        const img = document.createElement('img')
        img.src = BRAND_LOGO
        img.alt = 'Agent Pi DSH'
        img.draggable = false
        wrap.appendChild(img)
        mount.appendChild(wrap)
      }
      wrap.classList.toggle('rail', !!document.querySelector('[data-sidebar-collapsed]'))
    }

    function syncSidebarLayout() {
      if (placingSidebar || typeof document === 'undefined') return
      const parts = sidebarParts()
      if (!parts || !parts.root || !parts.logoRow || !parts.newSession) return
      placingSidebar = true
      try {
        const company = ensureMount('ap-mount-company')
        const wb = ensureMount('ap-mount-wb')
        const kb = ensureMount('ap-mount-kb')
        const archive = ensureMount('ap-mount-archive')
        const pi = ensureMount('ap-mount-pi')
        const staleSessions = document.getElementById('ap-mount-sessions')
        if (staleSessions) staleSessions.remove()
        const seq = [parts.logoRow, company, wb, kb, archive, parts.newSession, parts.region, parts.foot, pi].filter(Boolean)
        for (let i = 0; i < seq.length; i++) {
          if (parts.root.children[i] !== seq[i]) parts.root.insertBefore(seq[i], parts.root.children[i] || null)
        }
        ;['ap-mount-company', 'ap-mount-wb', 'ap-mount-kb', 'ap-mount-archive'].forEach((id) => {
          const mount = document.getElementById(id)
          const node = document.querySelector('[data-ap-place="' + id + '"]')
          if (mount && node && node.parentElement !== mount) mount.appendChild(node)
        })
        fillPiMount(pi)
      } finally {
        placingSidebar = false
      }
    }

    function usePlaced(mountId) {
      const ref = React.useRef(null)
      React.useLayoutEffect(() => {
        const node = ref.current
        if (node) node.setAttribute('data-ap-place', mountId)
        syncSidebarLayout()
      })
      return ref
    }

    function KnowledgeBaseNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [kbOn, setKbOn] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') === 'kb' } catch { return false }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setKbOn(sessionStorage.getItem('ap-wb-module') === 'kb') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const ref = usePlaced('ap-mount-kb')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-kb' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (open && kbOn ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('nav.kbTitle'),
          'aria-pressed': open && kbOn ? 'true' : 'false',
          onClick: () => {
            try { sessionStorage.setItem('ap-wb-module', 'kb') } catch {}
            setKbOn(true)
            window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'kb' }))
            setWorkbenchOpen(true)
          },
        }, Icon('book', 16), props.wide ? h('span', null, tAp('nav.kb')) : null),
      )
    }

    function WorkbenchNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [page, setPage] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') || 'tender' } catch { return 'tender' }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setPage(sessionStorage.getItem('ap-wb-module') || 'tender') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const on = open && page !== 'kb' && page !== 'archive' && page !== 'modules'
      const ref = usePlaced('ap-mount-wb')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-wb' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (on ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('workbench.title'),
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => {
            try { sessionStorage.setItem('ap-wb-module', 'tender') } catch {}
            window.dispatchEvent(new CustomEvent('agent-pi-wb-module', { detail: 'tender' }))
            setWorkbenchOpen(true)
          },
        }, Icon('layout', 16), props.wide ? h('span', null, tAp('workbench.title')) : null),
      )
    }

    function ArchiveNav(props) {
      useApLang()
      const open = useWorkbenchOpen()
      const [on, setOn] = React.useState(() => {
        try { return sessionStorage.getItem('ap-wb-module') === 'archive' } catch { return false }
      })
      React.useEffect(() => {
        const sync = () => {
          try { setOn(sessionStorage.getItem('ap-wb-module') === 'archive') } catch {}
        }
        window.addEventListener('agent-pi-wb-module', sync)
        window.addEventListener('agent-pi-wb-module-sync', sync)
        window.addEventListener('agent-pi-wb-changed', sync)
        return () => {
          window.removeEventListener('agent-pi-wb-module', sync)
          window.removeEventListener('agent-pi-wb-module-sync', sync)
          window.removeEventListener('agent-pi-wb-changed', sync)
        }
      }, [])
      const ref = usePlaced('ap-mount-archive')
      return h('div', { ref, className: 'ap-nav-host', 'data-ap-place': 'ap-mount-archive' },
        h('button', {
          type: 'button',
          className: 'ap-nav' + (open && on ? ' on' : '') + (props.wide ? '' : ' rail'),
          title: tAp('archive.lead'),
          'aria-pressed': open && on ? 'true' : 'false',
          onClick: () => {
            setOn(true)
            openArchivePage()
          },
        }, Icon('archive', 16), props.wide ? h('span', null, tAp('archive.title')) : null),
      )
    }

    function WorkbenchOverlay(props) {
      const open = useWorkbenchOpen()
      const left = useSidebarInset()
      if (!open) return h('span', { style: { pointerEvents: 'none' } })
      return h('div', { className: 'ap-wb-page', style: { left: left + 'px' } },
        h(Workbench, Object.assign({}, props, { onClose: () => setWorkbenchOpen(false) })),
      )
    }

    const COMPANY_MARK = '/api/agent-pi/brand/company-mark.png?v=5'

    function rewriteBrandText(value) {
      return String(value || PRODUCT_NAME)
        .replace(/DeepSeek Harness/g, PRODUCT_NAME)
        .replace(/DSH Local Build/g, PRODUCT_NAME)
        .replace(/Agent π/g, PRODUCT_NAME)
    }

    function installTitleAndFavicon() {
      try {
        const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'title')
        if (desc && desc.set && desc.get && !document.__apTitleGuard) {
          document.__apTitleGuard = true
          Object.defineProperty(document, 'title', {
            configurable: true,
            enumerable: true,
            get() { return desc.get.call(document) },
            set(v) { desc.set.call(document, rewriteBrandText(v)) },
          })
        }
      } catch {}
      document.title = rewriteBrandText(document.title || PRODUCT_NAME)
      document.querySelectorAll('link[rel*="icon"]').forEach((el) => {
        if (el.getAttribute('href') !== BRAND_FAVICON) el.remove()
      })
      if (!document.querySelector(`link[rel="icon"][href="${BRAND_FAVICON}"]`)) {
        const link = document.createElement('link')
        link.rel = 'icon'
        link.type = 'image/svg+xml'
        link.href = BRAND_FAVICON
        document.head.appendChild(link)
      }
    }

    function scrubDeepSeekLabels(root) {
      if (!root || root.nodeType !== 1) return
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      nodes.forEach((node) => {
        if (node.nodeValue && /DeepSeek Harness|DSH Local Build/.test(node.nodeValue)) {
          node.nodeValue = rewriteBrandText(node.nodeValue)
        }
      })
    }

    function syncSplashState() {
      const hero = document.querySelector('[data-phase="hero"]')
      const ta = hero && hero.querySelector('textarea')
      const waiting = !ta || /选择一个工作区开始|Choose a workspace to start/.test(ta.placeholder || '')
      document.documentElement.classList.toggle('ap-waiting-workspace', !!(hero && waiting))
    }

    function shortPluginName(moduleName) {
      const raw = String(moduleName || '')
      const unscoped = raw.startsWith('@') ? raw.slice(raw.indexOf('/') + 1) : raw
      return unscoped
        .replace(/^cordis:/, '')
        .replace(/^cordis-plugin-/, '')
        .replace(/^dsh-(?:host-|client-)?/, '') || raw
    }

    function hideVisionDupNode(node, kind) {
      if (!node || node.getAttribute('data-ap-hidden-vision-dup')) return
      node.setAttribute('data-ap-hidden-vision-dup', kind)
      node.setAttribute('hidden', '')
      node.setAttribute('aria-hidden', 'true')
      node.style.display = 'none'
    }

    function isHiddenVisionModelsAlias(text) {
      const sample = String(text || '').replace(/\s+/g, ' ')
      return /视觉路由\s*[（(]自动识图[)）]/.test(sample)
        || /Vision Router \(auto image understanding\)/i.test(sample)
        || /DeepSeek \+ 自动识图/.test(sample)
        || /DeepSeek \+ Auto Vision/i.test(sample)
    }

    function isRetiredVisionNavLabel(text) {
      const sample = String(text || '').replace(/\s+/g, ' ').trim()
      return /^Vision Router\b/i.test(sample)
        || /^视觉路由/.test(sample)
        || /^vision-router$/i.test(sample)
    }

    function hideRetiredVisionSettingsNav(scope) {
      const root = scope && scope.querySelectorAll ? scope : document
      const dialogs = root.querySelectorAll('[role="dialog"]')
      const hosts = dialogs.length ? dialogs : [root]
      for (let d = 0; d < hosts.length; d++) {
        const host = hosts[d]
        if (!host || !host.querySelectorAll) continue
        const buttons = host.querySelectorAll('nav button')
        let hiddenActive = false
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i]
          if (!isRetiredVisionNavLabel(btn.textContent)) continue
          hiddenActive = hiddenActive
            || btn.getAttribute('aria-current') === 'true'
            || /\bactive\b/i.test(String(btn.className || ''))
          hideVisionDupNode(btn, 'nav')
        }
        if (!hiddenActive) continue
        for (let i = 0; i < buttons.length; i++) {
          const other = buttons[i]
          if (other.getAttribute('data-ap-hidden-vision-dup')) continue
          other.click()
          break
        }
      }
    }

    // Official DeepSeek key card stays. Hide leftover Vision Router aliases
    // and the retired plugin's settings stub, including its leftover nav row.
    function hideRedundantVisionSettings(root) {
      hideRetiredVisionSettingsNav(root)
      const scope = root && root.querySelectorAll ? root : document
      const cards = scope.querySelectorAll('.vr-card, [data-plugin-entry], li')
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const text = card.textContent || ''
        const entry = String(card.getAttribute('data-plugin-entry') || '')
        const leftoverPlugin = /dsh-vision-router/i.test(entry)
          || /Vision Router 设置已迁移|Vision Router settings moved/.test(text)
          || (/Vision Router/i.test(text) && /vision_describe|vision_ocr|stealth/i.test(text))
        if (!leftoverPlugin) continue
        hideVisionDupNode((card.closest && card.closest('li')) || card, 'plugin')
      }
      const markers = document.querySelectorAll('p, h2')
      for (let i = 0; i < markers.length; i++) {
        const title = (markers[i].textContent || '').trim()
        if (title !== '填入各提供方的 API 密钥即可使用其模型'
          && title !== 'Enter your API keys to use models from the following providers.') continue
        const section = markers[i].parentElement
        if (!section) continue
        const rows = section.querySelectorAll('li')
        for (let j = 0; j < rows.length; j++) {
          if (isHiddenVisionModelsAlias(rows[j].textContent)) hideVisionDupNode(rows[j], 'models')
        }
        const options = section.querySelectorAll('option')
        for (let j = 0; j < options.length; j++) {
          const opt = options[j]
          const value = String(opt.value || '')
          if (value === 'deepseek-vision' || value === 'vision-router' || isHiddenVisionModelsAlias(opt.textContent)) {
            opt.hidden = true
            opt.disabled = true
            opt.setAttribute('data-ap-hidden-vision-dup', 'models')
          }
        }
      }
    }

    function paintPluginNames(root) {
      const scope = root && root.querySelectorAll ? root : document
      scope.querySelectorAll('[data-plugin-entry]').forEach((card) => {
        const strong = card.querySelector('strong')
        if (!strong) return
        const title = strong.getAttribute('title') || card.getAttribute('data-plugin-entry') || ''
        if (!String(strong.textContent || '').trim() && title) {
          strong.textContent = shortPluginName(title)
        }
        strong.style.setProperty('color', '#111827', 'important')
        strong.style.setProperty('-webkit-text-fill-color', '#111827', 'important')
        strong.style.setProperty('font-size', '14px', 'important')
        strong.style.setProperty('opacity', '1', 'important')
        strong.style.setProperty('visibility', 'visible', 'important')
        strong.style.setProperty('display', 'block', 'important')
        strong.style.setProperty('flex', '1 1 auto', 'important')
        strong.style.setProperty('min-width', '48px', 'important')
      })
    }

    function installSimpleNav() {
      document.documentElement.classList.add('ap-simple-nav')
      document.documentElement.classList.remove('ap-split-nav', 'ap-split-collapsed')
      syncSidebarLayout()
    }

    if (typeof document !== 'undefined') {
      document.querySelectorAll('.ap-hero-rebrand, .ap-brand-top, .ap-brand-mark').forEach((el) => el.remove())
      document.documentElement.classList.toggle('ap-wb-open', readWorkbenchOpen())
      installTitleAndFavicon()
      installSimpleNav()
      syncSplashState()
      paintPluginNames(document)
      paintHeroLogo(document)
      hideRedundantVisionSettings(document)
      function isInsideApDoc(node) {
        if (!node) return false
        let el = node
        if (el.nodeType === 3) el = el.parentElement || el.parentNode
        return !!(el && el.closest && el.closest('.ap-doc'))
      }
      const observer = new MutationObserver((records) => {
        let touchedShell = false
        for (const rec of records) {
          if (rec.type === 'characterData' && rec.target.nodeValue && /DeepSeek Harness|DSH Local Build/.test(rec.target.nodeValue)) {
            if (!isInsideApDoc(rec.target)) {
              rec.target.nodeValue = rewriteBrandText(rec.target.nodeValue)
              touchedShell = true
            }
          }
          if (rec.addedNodes && rec.addedNodes.length) {
            rec.addedNodes.forEach((node) => {
              if (node.nodeType !== 1 || isInsideApDoc(node)) return
              touchedShell = true
              scrubDeepSeekLabels(node)
              paintPluginNames(node)
              paintHeroLogo(node)
              hideRedundantVisionSettings(node)
              injectWorkspaceArchiveMenu(node)
            })
          }
        }
        hideArchivedWorkspaceGroups()
        if (!touchedShell) return
        syncSplashState()
        syncSidebarLayout()
        paintPluginNames(document)
        paintHeroLogo(document)
        hideRedundantVisionSettings(document)
        injectWorkspaceArchiveMenu(document)
      })
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
      document.addEventListener('pointerdown', (event) => {
        const btn = event.target && event.target.closest && event.target.closest('button[aria-label]')
        if (!btn || !workspaceActionTitle(btn.getAttribute('aria-label'))) return
        lastWorkspaceMenuButton = btn
      }, true)
      loadArchiveStore()
      hideArchivedWorkspaceGroups()
      injectWorkspaceArchiveMenu(document)
    }

    function CodexSettingsSection() {
      const desktop = window.agentPiDesktop
      const lang = useApLang()
      const zh = lang !== 'en'
      const [auth, setAuth] = React.useState({ available: true, state: 'checking' })
      const [busy, setBusy] = React.useState(false)
      const compactionBridgeAvailable = !!desktop
        && typeof desktop.compactionFallbackStatus === 'function'
        && typeof desktop.setCompactionFallback === 'function'
      const [compactionEnabled, setCompactionEnabled] = React.useState(true)
      const lastConfirmedCompaction = React.useRef(true)
      const [compactionBusy, setCompactionBusy] = React.useState(compactionBridgeAvailable)
      const [compactionMessage, setCompactionMessage] = React.useState('')

      const refresh = React.useCallback(async () => {
        if (!desktop || typeof desktop.codexAuthStatus !== 'function') {
          setAuth({ available: false, state: 'unavailable' })
          return
        }
        try {
          setAuth(await desktop.codexAuthStatus())
        } catch {
          setAuth({ available: false, state: 'unavailable' })
        }
      }, [desktop])

      React.useEffect(() => { void refresh() }, [refresh])
      React.useEffect(() => {
        if (auth.state !== 'pending') return undefined
        const timer = setInterval(() => { void refresh() }, 2000)
        return () => clearInterval(timer)
      }, [auth.state, refresh])

      const loadCompaction = React.useCallback(async () => {
        if (!compactionBridgeAvailable) {
          setCompactionBusy(false)
          return
        }
        setCompactionBusy(true)
        setCompactionMessage('')
        try {
          const result = await desktop.compactionFallbackStatus()
          if (!result || typeof result.enabled !== 'boolean') throw new Error('Invalid compaction preference')
          lastConfirmedCompaction.current = result.enabled
          setCompactionEnabled(result.enabled)
        } catch {
          setCompactionEnabled(lastConfirmedCompaction.current)
          setCompactionMessage(zh ? '无法读取自动压缩设置，请重试。' : 'Could not load the compaction setting. Please retry.')
        } finally {
          setCompactionBusy(false)
        }
      }, [compactionBridgeAvailable, desktop, zh])

      React.useEffect(() => { void loadCompaction() }, [loadCompaction])

      const invoke = async (method) => {
        setBusy(true)
        try {
          setAuth(await desktop[method]())
        } catch {
          setAuth({ available: true, state: 'error' })
        } finally {
          setBusy(false)
        }
      }

      const saveCompaction = async () => {
        if (!compactionBridgeAvailable || compactionBusy) return
        const nextEnabled = !compactionEnabled
        setCompactionBusy(true)
        setCompactionEnabled(nextEnabled)
        setCompactionMessage('')
        try {
          const result = await desktop.setCompactionFallback(nextEnabled)
          if (!result || typeof result.enabled !== 'boolean' || typeof result.restartRequired !== 'boolean') {
            throw new Error('Invalid compaction preference')
          }
          lastConfirmedCompaction.current = result.enabled
          setCompactionEnabled(result.enabled)
          setCompactionMessage(result.restartRequired ? (zh ? '重启应用后生效' : 'Restart the app to apply') : '')
        } catch {
          setCompactionEnabled(lastConfirmedCompaction.current)
          setCompactionMessage(zh ? '保存失败，请重试。' : 'Could not save the setting. Please retry.')
        } finally {
          setCompactionBusy(false)
        }
      }

      const labels = zh
        ? {
            checking: '正在检查',
            'logged-in': '已通过 ChatGPT 登录',
            pending: '等待浏览器授权',
            'logged-out': '未登录',
            error: '登录未完成',
            unavailable: 'Codex 运行时不可用',
          }
        : {
            checking: 'Checking',
            'logged-in': 'Signed in with ChatGPT',
            pending: 'Waiting for browser authorization',
            'logged-out': 'Not signed in',
            error: 'Sign-in did not complete',
            unavailable: 'Codex runtime unavailable',
          }
      const loggedIn = auth.state === 'logged-in'
      const pending = auth.state === 'pending'
      const statusClass = loggedIn ? 'ap-chip ok' : pending ? 'ap-chip live' : 'ap-chip warn'
      const model = loggedIn && auth.model
      const formatCapacity = (value) => Number(value).toLocaleString()
      const capacitySource = zh
        ? {
            provider: '供应商返回',
            official: '官方参数',
            estimated: '估算参数',
          }
        : {
            provider: 'Provider metadata',
            official: 'Verified catalog',
            estimated: 'Conservative estimate',
          }

      return h('section', { className: 'ap-codex-settings' },
        h('h1', null, zh ? 'Codex 智能体' : 'Codex Agent'),
        h('p', { className: 'ap-codex-lead' }, zh
          ? 'DeepSeek DSH 保持主智能体和投标流程控制权，Codex 作为独立子智能体处理明确委派的代码、审查与修复任务。'
          : 'DeepSeek DSH remains the primary agent and tender orchestrator. Codex handles self-contained coding, review, and repair delegations.'),
        h('div', { className: 'ap-codex-card' },
          h('div', { className: 'ap-codex-status' },
            h('strong', null, 'ChatGPT / Codex'),
            h('span', { className: statusClass }, labels[auth.state] || auth.state),
          ),
          h('p', { className: 'ap-sub' }, zh
            ? '使用 ChatGPT 账号在系统浏览器中授权，无需 API Key。凭据仅保存在本机 Agent Pi 专属 Codex 目录。'
            : 'Authorize with your ChatGPT account in the system browser. No API key is required; credentials stay in Agent Pi’s private local Codex directory.'),
          loggedIn && h('p', { className: 'ap-sub' }, model
            ? [
                h('strong', { key: 'id' }, model.id),
                h('br', { key: 'break' }),
                zh ? '上下文窗口：' : 'Context window: ',
                formatCapacity(model.contextWindow),
                ' · ',
                capacitySource[model.contextWindowSource],
                h('br', { key: 'output-break' }),
                zh ? '最大输出：' : 'Maximum output: ',
                formatCapacity(model.maxTokens),
                ' · ',
                capacitySource[model.maxTokensSource],
              ]
            : (zh ? '模型信息暂不可用' : 'Model information is temporarily unavailable')),
          h('div', { className: 'ap-row', style: { marginTop: 14 } },
            !loggedIn && h('button', {
              type: 'button',
              className: 'ap-btn primary',
              disabled: busy || pending || !auth.available,
              onClick: () => { void invoke('codexAuthLogin') },
            }, pending ? (zh ? '等待授权…' : 'Waiting…') : (zh ? '使用 ChatGPT 登录' : 'Sign in with ChatGPT')),
            h('button', {
              type: 'button',
              className: 'ap-btn',
              disabled: busy,
              onClick: () => { void refresh() },
            }, zh ? '刷新状态' : 'Refresh'),
            loggedIn && h('button', {
              type: 'button',
              className: 'ap-btn warn',
              disabled: busy,
              onClick: () => {
                if (window.confirm(zh ? '确认退出 Agent Pi 的 Codex 登录？' : 'Sign out of Codex in Agent Pi?')) {
                  void invoke('codexAuthLogout')
                }
              },
            }, zh ? '退出登录' : 'Sign out'),
          ),
          h('p', { className: 'ap-codex-note' },
            zh ? '登录后，DSH 智能体可按需调用 ' : 'After sign-in, DSH agents can invoke ',
            h('code', null, 'subagent_codex'),
            zh
              ? '。Codex 不会自动继承父对话或知识库，父智能体会把所需文件路径、知识和交付目标整理成独立任务。'
              : '. Codex does not inherit parent conversation or knowledge automatically, so the parent provides a self-contained brief.',
          ),
        ),
        h('div', { className: 'ap-codex-card', style: { marginTop: 14 } },
          h('div', { className: 'ap-codex-status' },
            h('strong', null, zh ? '对话自动压缩' : 'Automatic conversation compaction'),
            h('button', {
              type: 'button',
              role: 'switch',
              className: 'ap-switch' + (compactionEnabled ? ' on' : ''),
              'aria-label': zh ? 'DeepSeek 摘要兜底' : 'DeepSeek summary fallback',
              'aria-checked': compactionEnabled ? 'true' : 'false',
              disabled: compactionBusy || !compactionBridgeAvailable,
              onClick: () => { void saveCompaction() },
            }, h('span', { className: 'ap-switch-knob' })),
          ),
          h('p', { className: 'ap-sub' }, zh
            ? '当上下文用量达到约 72% 时自动压缩，先尝试当前会话模型。启用兜底后，如果主摘要发生可兜底的失败，旧对话历史可能会发送给 deepseek-v4-flash-vision-exp；这可能产生一次 DeepSeek 调用费用，并会跨供应商处理该段历史。'
            : 'Automatic compaction starts near 72% context usage and tries the current session model first. When fallback is enabled and the primary summary has an eligible failure, older conversation history may be sent to deepseek-v4-flash-vision-exp. This may create one DeepSeek charge and processes that history across provider boundaries.'),
          !compactionBridgeAvailable && h('p', { className: 'ap-sub' }, zh
            ? '此设置仅在打包的桌面应用中可用。'
            : 'This setting is available only in the packaged desktop app.'),
          compactionMessage && h('p', { className: 'ap-sub' }, compactionMessage),
        ),
      )
    }

    function CompanyLockup(props) {
      const ref = usePlaced('ap-mount-company')
      if (!props.wide) return h('span', { ref, 'data-ap-place': 'ap-mount-company', style: { display: 'none' } })
      return h('div', { ref, className: 'ap-company', 'data-ap-place': 'ap-mount-company', 'aria-label': '中国建筑第二工程局有限公司' },
        h('img', { src: COMPANY_LOGO, alt: '中国建筑第二工程局有限公司', draggable: false }),
      )
    }

    function SidebarBrandMark(props) {
      const size = Number(props && props.size) || 24
      return h('img', {
        src: '/api/agent-pi/brand/symbol.png?v=8',
        alt: '',
        width: size,
        height: size,
        draggable: false,
        style: { width: size, height: size, objectFit: 'contain' },
      })
    }

    function SidebarBrandName() {
      return h('span', { className: 'ap-sidebar-brand-name' }, 'Agent Pi DSH')
    }

    function HeroBrandMark(props) {
      const size = Number(props && props.size) || 34
      return h('img', {
        className: (props && props.className) || 'ap-hero-logo',
        src: BRAND_LOGO,
        alt: 'Agent Pi DSH',
        width: size,
        height: size,
        draggable: false,
        style: { width: size, height: 'auto', maxHeight: 188, objectFit: 'contain' },
      })
    }

    exports.name = 'tender-web'
    exports.inject = ['slots', 'workspaces']
    window.__apAttachItems = attachItemsToComposer
    if (!window.__apAttachFileBound) {
      window.__apAttachFileBound = true
      window.addEventListener('agent-pi-attach-file', (event) => {
        const detail = event && event.detail
        if (!detail || !detail.items) return
        const write = window.__apAttachItems
        if (typeof write === 'function') write(detail.sessionProps || composerPropsRef.current, detail.items, detail.source)
      })
    }

    exports.apply = function apply(ctx) {
      runtime.workspaces = ctx.workspaces || runtime.workspaces
      watchArchivedWorkspaces()
      ctx.inject(['sessions'], (scope) => {
        runtime.sessions = scope.sessions
          || ctx.sessions
          || (typeof scope.get === 'function' ? scope.get('sessions') : null)
          || runtime.sessions
        guardArchivedSessionView(runtime.sessions)
      })
      ctx.inject(['conversation'], (scope) => {
        runtime.conversation = scope.conversation
          || ctx.conversation
          || (typeof scope.get === 'function' ? scope.get('conversation') : null)
          || runtime.conversation
      })
      ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: 'workbench', order: 50, label: WORKBENCH_LABEL },
        Workbench,
      ))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: 'agent-pi-codex',
          order: 15,
          label: () => langState.lang === 'en' ? 'Codex Agent' : 'Codex 智能体',
        },
        CodexSettingsSection,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-workbench', order: 5, label: WORKBENCH_LABEL },
        WorkbenchOverlay,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-create', order: 20, label: '新建项目' },
        CreateOverlay,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'tender-files', order: 10, label: '资源文件' },
        FilesRail,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'agent-pi-toast', order: 80, label: '提示' },
        ToastHost,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'agent-pi-deepseek-key', order: 90, label: 'API Key' },
        DeepSeekKeyDialog,
      ))
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'agent-pi-attach-float', order: 75, label: '附件条' },
        AttachmentFloat,
      ))
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
        { name: 'conversation.input.dock', id: 'agent-pi-attachments', order: 5, label: '附件' },
        AttachmentDock,
      ))
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
        { name: 'conversation.input.left', id: 'agent-pi-composer-tools', order: 20, label: '指令润色' },
        ComposerTools,
      ))
      ctx.inject(['workspaces'], (scope) => {
        runtime.workspaces = scope.workspaces
          || ctx.workspaces
          || (typeof scope.get === 'function' ? scope.get('workspaces') : null)
          || runtime.workspaces
        guardArchivedSessionView(runtime.sessions, runtime.workspaces)
        watchArchivedWorkspaces()
      })
      ctx.inject(['locale'], (scope) => {
        runtime.locale = scope.locale || (typeof scope.get === 'function' ? scope.get('locale') : null) || runtime.locale
        const applyLang = () => {
          const snap = runtime.locale && typeof runtime.locale.getLocale === 'function' ? runtime.locale.getLocale() : null
          const id = snap && snap.active ? snap.active : (snap && snap.locale)
          setApLang(id)
        }
        applyLang()
        if (typeof scope.on === 'function') scope.on('locale/change', applyLang)
      })
      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
        {
          name: 'conversation.chat.turnTail',
          id: 'agent-pi-harvest',
          order: 80,
          select: (owner) => {
            const data = owner && owner.turn && owner.turn.data && typeof owner.turn.data.get === 'function'
              ? owner.turn.data.get('deliverables')
              : null
            const produced = data && data.produced ? data.produced : []
            const paths = []
            const seen = new Set()
            for (let i = 0; i < produced.length; i++) {
              const row = produced[i]
              if (!row || !row.path || seen.has(row.path)) continue
              if (typeof owner.seq === 'number' && row.seq > owner.seq) continue
              seen.add(row.path)
              paths.push(row.path)
            }
            return paths.length ? paths : null
          },
        },
        HarvestOutputs,
      ))
      ctx.inject(['inputTriggers', 'sessions'], (scope) => {
        runtime.sessions = scope.sessions || (typeof scope.get === 'function' ? scope.get('sessions') : null)
        const inputTriggers = scope.inputTriggers || (typeof scope.get === 'function' ? scope.get('inputTriggers') : null)
        if (!inputTriggers || typeof inputTriggers.registerSource !== 'function') return
        const source = {
          trigger: '/',
          name: FILE_SOURCE,
          order: 40,
          candidates(_session, req) {
            const query = String(req && req.query || '').toLowerCase()
            return Promise.resolve(runtime.files
              .filter((file) => !query || file.name.toLowerCase().includes(query) || file.relativePath.toLowerCase().includes(query))
              .slice(0, 24)
              .map((file) => ({ name: file.name, description: file.relativePath })))
          },
          onPick({ candidate }) {
            const ref = candidate.description || candidate.name
            const file = runtime.files.find((row) => row.relativePath === ref || row.name === candidate.name) || {}
            window.dispatchEvent(new CustomEvent('agent-pi-attach-file', {
              detail: {
                items: [{
                  id: ref + ':' + Date.now(),
                  relativePath: ref,
                  path: file.path,
                  name: candidate.name,
                  kind: fileKind(candidate.name),
                }],
                source: 'mention',
              },
            }))
            return {}
          },
          codec: {
            clipboardText: (ref) => ref,
            serialize: (ref) => Promise.resolve('请读取并依据此文件：`' + ref + '`'),
          },
        }
        if (typeof scope.effect === 'function') {
          scope.effect(() => inputTriggers.registerSource(source), 'tender-web: workspace-file source')
        } else {
          inputTriggers.registerSource(source)
        }
      })
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'agent-pi-files', order: 40, label: '资源文件' },
        FilesToggle,
      ))
      ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'agent-pi-delete-session', order: 80, label: '归档对话' },
        ArchiveSession,
      ))
      ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register(
        { name: 'sidebar.brand.mark' },
        SidebarBrandMark,
      ))
      ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
        { name: 'sidebar.brand.name' },
        SidebarBrandName,
      ))
      ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register(
        { name: 'conversation.hero.brand.mark' },
        HeroBrandMark,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-company', order: 0, label: '中建二局' },
        CompanyLockup,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-lang', order: 1, label: 'Language' },
        LanguageToggle,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'tender-workbench-nav', order: 2, label: WORKBENCH_LABEL },
        WorkbenchNav,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-kb-nav', order: 3, label: '知识库' },
        KnowledgeBaseNav,
      ))
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'agent-pi-archive-nav', order: 4, label: '归档' },
        ArchiveNav,
      ))
    }
    return module.exports
  },
})
