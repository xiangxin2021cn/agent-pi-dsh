export const clientCss = `
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
.ap-project-starter{display:flex;align-items:center;justify-content:space-between;gap:14px;box-sizing:border-box;width:min(100%,var(--dsh-composer-card-max-width,760px));margin:0 auto 10px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--ap-accent) 24%,var(--dsw-alias-border-l2));border-radius:12px;background:color-mix(in srgb,var(--ap-accent) 7%,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary)}
.ap-project-starter-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
.ap-project-starter-copy strong{font-size:13px;font-weight:650}
.ap-project-starter-copy span{font-size:11px;line-height:1.45;color:var(--dsw-alias-label-tertiary)}
.ap-project-starter-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;flex:none}
@media(max-width:760px){.ap-project-starter{align-items:flex-start;flex-direction:column}.ap-project-starter-actions{justify-content:flex-start}}
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
.ap-user-reqs{display:flex;flex-direction:column;gap:10px;background:color-mix(in srgb,var(--ap-accent) 4%,transparent)}
.ap-user-req-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-user-req{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-base)}
.ap-user-req-main{display:flex;flex:1;flex-direction:column;gap:7px;min-width:0}
.ap-user-req-main p{margin:0;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
.ap-user-req-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap;flex:none}
@media(max-width:760px){.ap-user-req-head,.ap-user-req{flex-direction:column}.ap-user-req-actions{justify-content:flex-start}}
.ap-mon-hd{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px}
.ap-mon-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.ap-dot{width:6px;height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent);display:inline-block}
.ap-dot.on{background:var(--ap-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--ap-accent) 22%, transparent)}
.ap-dual-state{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin-top:14px}
.ap-state-card{min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 96%,var(--ap-accent) 4%);overflow:hidden}
.ap-state-card-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ap-state-card-hd>div{display:flex;flex-direction:column;gap:3px;min-width:0}
.ap-state-card-hd strong{font-size:12px;font-weight:700}
.ap-state-body{display:flex;flex-direction:column;gap:7px;padding:11px 12px;font-size:12px;line-height:1.5}
.ap-state-body p{margin:0;overflow-wrap:anywhere}
.ap-state-empty{padding:16px 12px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.55}
.ap-mini-list{display:flex;flex-direction:column;gap:5px;padding-top:2px}
.ap-mini-list>div{display:flex;align-items:flex-start;gap:7px;min-width:0}
.ap-mini-list span{min-width:0;overflow-wrap:anywhere}
.ap-mini-status{width:7px;height:7px;margin-top:5px;border-radius:999px;flex:none;background:var(--dsw-alias-label-tertiary)}
.ap-mini-status.in_progress{background:var(--ap-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--ap-accent) 18%,transparent)}
.ap-mini-status.done{background:#1f9d68}
.ap-mini-status.blocked{background:#d97706}
.ap-state-alert{padding:7px 8px;border-radius:8px;background:color-mix(in srgb,#d97706 10%,transparent);color:color-mix(in srgb,#d97706 76%,var(--dsw-alias-label-primary))}
.ap-alignment-alert{margin-top:10px;padding:10px 12px;border:1px solid color-mix(in srgb,#d97706 30%,var(--dsw-alias-border-l1));border-radius:10px;background:color-mix(in srgb,#d97706 7%,transparent);font-size:12px}
.ap-alignment-alert ul{margin:5px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary)}
@media(max-width:920px){.ap-dual-state{grid-template-columns:1fr}}
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
