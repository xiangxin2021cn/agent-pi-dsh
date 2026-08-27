const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const pptx = new pptxgen();
pptx.defineLayout({ name: "FINAL_WIDE", width: 13.333, height: 7.5 });
pptx.layout = "FINAL_WIDE";
pptx.author = "向鑫";
pptx.subject = "中国建筑第二届青年设计师创新大赛·海外业务赛道决赛答辩";
pptx.title = "海外工程投标及商业调研全流程AI智能 Agent 作业系统";
pptx.company = "中国建筑第二工程局有限公司";
pptx.lang = "zh-CN";
pptx.theme = {
  headFontFace: "Source Han Sans SC",
  bodyFontFace: "Microsoft YaHei",
  lang: "zh-CN",
};
pptx.margin = 0;

const ROOT = __dirname;
const OUT = path.join(ROOT, "out");
const IMG = path.resolve(ROOT, "..", "img");
const QA = path.join(ROOT, "qa", "ppt");
const SUPPORT = path.join(QA, "supporting-assets");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(QA, { recursive: true });
fs.mkdirSync(SUPPORT, { recursive: true });

const FILE = path.join(OUT, "决赛答辩-海外工程投标及商业调研全流程AI智能Agent作业系统-向鑫.pptx");
const C = {
  navy: "08223F", navy2: "0B2E52", blue: "176EE8", cyan: "05B9C7",
  paper: "F5F8FA", white: "FFFFFF", ink: "12283F", muted: "62778B",
  line: "D8E4EC", paleBlue: "EAF2FF", paleCyan: "E8FAFB", pale: "EEF3F6",
  warm: "FFB553", red: "D85858", green: "25A978",
};
const FONT_H = "Source Han Sans SC";
const FONT_B = "Microsoft YaHei";
const SHADOW = () => ({ type: "outer", color: "08223F", opacity: 0.12, blur: 5, angle: 135, offset: 1.5 });
const layoutLog = [];
let slideNo = 0;

function add(slide, kind, box, label, fn) {
  layoutLog.push({ slide: slideNo, kind, label, ...box });
  fn();
}
function rect(slide, x, y, w, h, fill, opts = {}) {
  add(slide, "shape", { x, y, w, h }, opts.label || "rect", () => slide.addShape(
    opts.rounded ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
    { x, y, w, h, fill: { color: fill, transparency: opts.transparency || 0 }, line: opts.line || { color: fill, transparency: 100 }, radius: opts.radius, shadow: opts.shadow }
  ));
}
function line(slide, x, y, w, h, color = C.line, width = 1.2, opts = {}) {
  add(slide, "line", { x, y, w, h }, opts.label || "line", () => slide.addShape(pptx.ShapeType.line, {
    x, y, w, h, line: { color, width, transparency: opts.transparency || 0, dash: opts.dash, beginArrowType: opts.beginArrowType, endArrowType: opts.endArrowType }
  }));
}
function txt(slide, text, x, y, w, h, opts = {}) {
  const o = {
    x, y, w, h, margin: opts.margin === undefined ? 0 : opts.margin,
    fontFace: opts.fontFace || FONT_B, fontSize: opts.fontSize || 16,
    color: opts.color || C.ink, bold: !!opts.bold, align: opts.align || "left",
    valign: opts.valign || "mid", breakLine: false, fit: "shrink",
    paraSpaceAfterPt: opts.paraSpaceAfterPt || 0, charSpacing: opts.charSpacing || 0,
    italic: !!opts.italic, transparency: opts.transparency || 0,
  };
  if (opts.rotate !== undefined) o.rotate = opts.rotate;
  if (opts.isTextBox !== undefined) o.isTextBox = opts.isTextBox;
  add(slide, "text", { x, y, w, h }, opts.label || String(text).slice(0, 24), () => slide.addText(text, o));
}
function title(slide, kicker, heading, page, dark = false) {
  txt(slide, kicker.toUpperCase(), 0.55, 0.51, 5.5, 0.18, { fontSize: 9.5, bold: true, color: dark ? "78E5EA" : C.cyan, charSpacing: 2.2, label: "kicker" });
  txt(slide, heading, 0.55, 0.73, 10.7, 0.48, { fontFace: /[A-Za-z]/.test(heading) ? FONT_B : FONT_H, fontSize: 29, bold: true, color: dark ? C.white : C.navy, label: "title" });
  txt(slide, String(page).padStart(2, "0"), 12.05, 0.51, 0.72, 0.30, { fontSize: 14, bold: true, align: "right", color: dark ? "8AA9C2" : "8AA1B4", label: "page" });
}
function footer(slide, text = "海外工程投标及商业调研全流程AI智能 Agent 作业系统") {
  txt(slide, text, 0.55, 6.79, 8.8, 0.18, { fontSize: 8.2, color: "7890A3", label: "footer" });
  txt(slide, "向鑫 · 海外业务赛道", 10.5, 6.79, 2.28, 0.18, { fontSize: 8.2, color: "7890A3", align: "right", label: "footer identity" });
}
function card(slide, x, y, w, h, fill = C.white, opts = {}) {
  rect(slide, x, y, w, h, fill, { rounded: true, shadow: opts.shadow === false ? undefined : SHADOW(), line: opts.line || { color: opts.lineColor || C.line, width: opts.lineWidth || 0.8 }, label: opts.label || "card" });
}
function pill(slide, text, x, y, w, color, fill, opts = {}) {
  rect(slide, x, y, w, opts.h || 0.34, fill, { rounded: true, line: { color: opts.lineColor || fill, width: 0.7 }, label: "pill" });
  txt(slide, text, x + 0.08, y + 0.01, w - 0.16, (opts.h || 0.34) - 0.02, { fontSize: opts.fontSize || 9.5, color, bold: !!opts.bold, align: "center", label: `pill ${text}` });
}
function node(slide, n, label, x, y, color, w = 1.35) {
  rect(slide, x, y, w, 0.62, C.white, { rounded: true, line: { color, width: 1.1 }, shadow: SHADOW(), label: `node ${n}` });
  txt(slide, n, x + 0.12, y + 0.10, 0.28, 0.18, { fontSize: 8.5, bold: true, color, label: `node ${n} index` });
  txt(slide, label, x + 0.12, y + 0.29, w - 0.24, 0.22, { fontSize: 11.5, bold: true, color: C.ink, label: `node ${label}` });
}
function circle(slide, x, y, d, fill, label = "circle") {
  add(slide, "shape", { x, y, w: d, h: d }, label, () => slide.addShape(pptx.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, transparency: 100 } }));
}
function image(slide, file, x, y, w, h, opts = {}) {
  const p = path.resolve(file);
  add(slide, "image", { x, y, w, h }, opts.label || path.basename(p), () => slide.addImage({ path: p, x, y, w, h, transparency: opts.transparency || 0, altText: opts.altText || path.basename(p) }));
}
function imageFrame(slide, file, x, y, w, h, opts = {}) {
  card(slide, x, y, w, h, opts.frameFill || C.white, { shadow: opts.shadow !== false, lineColor: opts.lineColor || C.line, label: `${opts.label || "image"} frame` });
  image(slide, file, x + 0.08, y + 0.08, w - 0.16, h - 0.16, { label: opts.label || "image", altText: opts.altText });
}
function base(light = true) {
  slideNo += 1;
  const s = pptx.addSlide();
  s.background = { color: light ? C.paper : C.navy };
  if (light) {
    for (let i = 0; i < 8; i++) line(s, 0.55, 1.24 + i * 0.72, 12.23, 0, "E9F0F4", 0.45, { label: "blueprint grid" });
    for (let i = 0; i < 14; i++) line(s, 0.55 + i * 0.94, 1.24, 0, 5.58, "EDF3F6", 0.4, { label: "blueprint grid" });
  }
  return s;
}

// 01 Cover
{
  const s = base(false);
  image(s, path.join(IMG, "hero-dark-v2.jpg"), 7.28, 0, 6.053, 7.5, { transparency: 16, label: "engineering hero" });
  rect(s, 0, 0, 7.95, 7.5, C.navy, { transparency: 0, label: "cover dark field" });
  rect(s, 7.4, 0, 1.25, 7.5, C.navy, { transparency: 34, label: "cover fade" });
  txt(s, "THE CONVERGENCE ENGINE", 0.68, 0.62, 5.5, 0.3, { fontSize: 10, bold: true, color: "71E0E9", charSpacing: 2.2, label: "cover kicker" });
  txt(s, "海外工程投标及\n商业调研全流程", 0.68, 1.25, 6.6, 1.65, { fontFace: FONT_H, fontSize: 34, bold: true, color: C.white, label: "cover title" });
  txt(s, "AI智能 Agent 作业系统", 0.68, 3.05, 6.35, 0.72, { fontFace: FONT_B, fontSize: 26, bold: true, color: "69E5EB", label: "cover subtitle" });
  txt(s, "让商业情报与工程投标两条长程作业流，\n在证据门禁中汇聚为可递交成果。", 0.68, 4.03, 5.9, 0.86, { fontSize: 15.5, color: "C7D9E7", label: "cover promise" });
  pill(s, "商业调研轨", 0.68, 5.27, 1.42, C.white, "0A7581", { bold: true });
  pill(s, "工程投标轨", 2.24, 5.27, 1.42, C.white, "1655A5", { bold: true });
  pill(s, "证据门禁", 3.80, 5.27, 1.30, C.navy, "7CE9EE", { bold: true });
  line(s, 7.82, 2.0, 2.03, 0, C.cyan, 4.2, { transparency: 8, label: "commercial lane" });
  line(s, 7.82, 4.86, 2.03, 0, C.blue, 4.2, { transparency: 6, label: "tender lane" });
  line(s, 9.85, 2.0, 1.52, 1.43, C.cyan, 4.2, { label: "commercial merge" });
  line(s, 9.85, 4.86, 1.52, -1.43, C.blue, 4.2, { label: "tender merge" });
  circle(s, 11.16, 3.20, 0.48, C.white, "official node halo");
  circle(s, 11.26, 3.30, 0.28, C.cyan, "official node");
  txt(s, "OFFICIAL\nOUTPUTS", 10.60, 3.82, 1.65, 0.58, { fontSize: 10.5, bold: true, color: C.white, align: "center", label: "official outputs" });
  txt(s, "中国建筑第二届青年设计师创新大赛 · 海外业务赛道", 0.68, 6.39, 7.3, 0.24, { fontSize: 10.5, color: "9DB4C8", label: "competition" });
  txt(s, "参赛人  向鑫", 0.68, 6.70, 2.5, 0.24, { fontSize: 11, bold: true, color: C.white, label: "participant" });
}

// 02 Pain points
{
  const s = base(true); title(s, "WHY THIS SYSTEM", "海外作业的难点，不是缺少信息", 2); footer(s);
  txt(s, "而是信息太长、太散、太依赖个人经验，难以稳定转成正式成果。", 0.57, 1.29, 8.3, 0.42, { fontSize: 15.5, color: C.muted, label: "pain thesis" });
  const items = [
    { n: "01", t: "长文件", d: "招标书、规范、补遗与附件\n跨章节、跨格式、跨语言", c: C.blue, f: C.paleBlue },
    { n: "02", t: "散情报", d: "国别、业主、股权与项目阶段\n来源分散，时点口径不同", c: C.cyan, f: C.paleCyan },
    { n: "03", t: "经验组价", d: "范围、工法、工效与资源价\n链条长，复核成本高", c: C.navy2, f: "E9EFF4" },
  ];
  items.forEach((it, i) => {
    const x = 0.62 + i * 4.08;
    card(s, x, 2.04, 3.63, 3.18, it.f, { lineColor: it.c, lineWidth: 1.05, label: `pain ${it.t}` });
    txt(s, it.n, x + 0.24, 2.26, 0.62, 0.34, { fontSize: 13, bold: true, color: it.c, label: `pain number ${it.n}` });
    circle(s, x + 2.83, 2.22, 0.45, it.c, `pain icon ${it.n}`);
    txt(s, i === 0 ? "页" : i === 1 ? "散" : "算", x + 2.83, 2.24, 0.45, 0.36, { fontSize: 13, bold: true, color: C.white, align: "center", label: `pain icon text ${it.n}` });
    txt(s, it.t, x + 0.24, 2.93, 2.85, 0.48, { fontFace: FONT_H, fontSize: 23, bold: true, color: C.navy, label: `pain title ${it.t}` });
    txt(s, it.d, x + 0.24, 3.68, 3.08, 0.78, { fontSize: 13.5, color: C.muted, label: `pain detail ${it.t}` });
    line(s, x + 0.24, 4.68, 3.02, 0, it.c, 2.5, { transparency: 15, label: `pain trace ${it.n}` });
  });
  rect(s, 1.38, 5.76, 10.56, 0.78, C.navy, { rounded: true, shadow: SHADOW(), label: "pain result band" });
  txt(s, "碎片输入", 1.72, 5.96, 1.40, 0.28, { fontSize: 14, bold: true, color: C.white, align: "center" });
  txt(s, "→", 3.36, 5.95, 0.5, 0.28, { fontSize: 17, color: "7EE4EA", align: "center" });
  txt(s, "判断失真", 4.04, 5.96, 1.55, 0.28, { fontSize: 14, bold: true, color: C.white, align: "center" });
  txt(s, "→", 5.83, 5.95, 0.5, 0.28, { fontSize: 17, color: "7EE4EA", align: "center" });
  txt(s, "重复返工", 6.48, 5.96, 1.55, 0.28, { fontSize: 14, bold: true, color: C.white, align: "center" });
  txt(s, "→", 8.27, 5.95, 0.5, 0.28, { fontSize: 17, color: "7EE4EA", align: "center" });
  txt(s, "递交风险", 8.94, 5.96, 1.55, 0.28, { fontSize: 14, bold: true, color: C.white, align: "center" });
}

// 03 System overview
{
  const s = base(true); title(s, "SYSTEM OVERVIEW", "双轨并行，经证据门禁汇聚", 3); footer(s);
  txt(s, "3 个业务域 · 34 个领域 Skills · 统一成果树", 0.58, 1.28, 5.7, 0.34, { fontSize: 14.5, color: C.muted, label: "overview facts" });
  pill(s, "TRACK A  商业调研", 0.62, 1.88, 2.28, C.white, C.cyan, { h: 0.38, bold: true });
  pill(s, "TRACK B  工程投标", 0.62, 4.42, 2.28, C.white, C.blue, { h: 0.38, bold: true });
  const top = ["项目机会", "国别市场", "业主伙伴", "风险决策"];
  const bot = ["全量解析", "条款知识库", "BOQ 组价", "策划标稿"];
  top.forEach((t, i) => node(s, `0${i + 1}`, t, 0.72 + i * 1.73, 2.56, C.cyan, 1.47));
  bot.forEach((t, i) => node(s, `0${i + 1}`, t, 0.72 + i * 1.73, 5.08, C.blue, 1.47));
  for (let i = 0; i < 3; i++) {
    line(s, 2.19 + i * 1.73, 2.87, 0.26, 0, C.cyan, 2.0, { endArrowType: "triangle", label: "commercial connector" });
    line(s, 2.19 + i * 1.73, 5.39, 0.26, 0, C.blue, 2.0, { endArrowType: "triangle", label: "tender connector" });
  }
  line(s, 7.38, 2.87, 1.22, 0.95, C.cyan, 3.2, { label: "commercial merge" });
  line(s, 7.38, 5.39, 1.22, -1.57, C.blue, 3.2, { label: "tender merge" });
  card(s, 8.47, 2.78, 1.62, 2.12, C.navy, { lineColor: C.navy, label: "evidence gate" });
  txt(s, "EVIDENCE\nGATE", 8.67, 3.05, 1.22, 0.56, { fontSize: 10, bold: true, color: "77E6EA", align: "center", label: "evidence gate english" });
  txt(s, "证据门禁", 8.67, 3.69, 1.22, 0.38, { fontFace: FONT_H, fontSize: 17, bold: true, color: C.white, align: "center", label: "evidence gate title" });
  txt(s, "来源 · 日期\n适用口径 · 冲突", 8.67, 4.16, 1.22, 0.44, { fontSize: 9.5, color: "B7CBDA", align: "center", label: "gate checks" });
  line(s, 10.09, 3.84, 0.55, 0, C.blue, 3, { endArrowType: "triangle", label: "gate to output" });
  card(s, 10.72, 2.35, 1.98, 3.0, C.white, { lineColor: C.blue, lineWidth: 1.3, label: "official outputs" });
  circle(s, 11.36, 2.67, 0.68, C.paleCyan, "output halo");
  txt(s, "✓", 11.36, 2.69, 0.68, 0.46, { fontSize: 20, bold: true, color: C.cyan, align: "center", label: "output check" });
  txt(s, "Official Outputs", 10.94, 3.54, 1.54, 0.35, { fontSize: 14.5, bold: true, color: C.navy, align: "center", label: "official outputs title" });
  txt(s, "决策报告\n组价工作簿\n施工策划 · 投标标稿", 10.94, 4.03, 1.54, 0.86, { fontSize: 11.2, color: C.muted, align: "center", label: "official outputs list" });
  pill(s, "可追溯", 10.89, 5.68, 0.98, C.blue, C.paleBlue, { fontSize: 9.2 });
  pill(s, "可复核", 11.96, 5.68, 0.72, C.cyan, C.paleCyan, { fontSize: 9.2 });
}

// 04 Commercial research
{
  const s = base(true); title(s, "TRACK A · COMMERCIAL RESEARCH", "商业调研：从信息搜索到可引用结论", 4); footer(s);
  txt(s, "项目机会 → 国别 / 市场 → 业主 / 合作方 → 股权与风险 → 投标决策", 0.58, 1.29, 8.9, 0.32, { fontSize: 13.8, color: C.muted, label: "commercial workflow" });
  const steps = ["找信号", "核时点", "串关系", "写结论"];
  steps.forEach((t, i) => {
    circle(s, 0.78 + i * 1.35, 2.12, 0.54, i === 3 ? C.navy : C.cyan, `commercial step ${i + 1}`);
    txt(s, String(i + 1).padStart(2, "0"), 0.78 + i * 1.35, 2.19, 0.54, 0.24, { fontSize: 9.5, bold: true, color: C.white, align: "center", label: "commercial step number" });
    txt(s, t, 0.57 + i * 1.35, 2.81, 0.95, 0.32, { fontSize: 13, bold: true, color: C.navy, align: "center", label: `commercial step ${t}` });
    if (i < 3) line(s, 1.32 + i * 1.35, 2.39, 0.81, 0, C.cyan, 1.8, { endArrowType: "triangle", label: "commercial step connector" });
  });
  card(s, 0.60, 3.54, 4.95, 2.34, C.navy, { lineColor: C.navy, label: "commercial transformation" });
  txt(s, "不是“搜到什么就写什么”", 0.92, 3.85, 4.30, 0.40, { fontFace: FONT_H, fontSize: 20, bold: true, color: C.white, label: "commercial not search" });
  txt(s, "每个判断绑定来源、日期与适用口径；\n当来源冲突，保留差异并进入人工复核。", 0.92, 4.52, 4.14, 0.80, { fontSize: 13.4, color: "C5D7E3", label: "commercial evidence copy" });
  pill(s, "公司公告", 0.92, 5.36, 1.08, C.cyan, "113B57", { fontSize: 9.2 });
  pill(s, "业主官网", 2.12, 5.36, 1.08, C.cyan, "113B57", { fontSize: 9.2 });
  pill(s, "项目阶段", 3.32, 5.36, 1.08, C.cyan, "113B57", { fontSize: 9.2 });
  imageFrame(s, path.join(IMG, "report-equity.png"), 5.94, 1.73, 3.17, 2.37, { label: "equity visualization" });
  imageFrame(s, path.join(IMG, "report-stages.png"), 9.35, 1.73, 3.36, 2.37, { label: "stage visualization" });
  imageFrame(s, path.join(IMG, "report-map.png"), 5.94, 4.36, 3.17, 2.28, { label: "corridor map" });
  imageFrame(s, path.join(IMG, "screenshot-market.png"), 9.35, 4.36, 3.36, 2.28, { label: "research workbench" });
  pill(s, "股权关系", 6.08, 3.65, 0.90, C.navy, C.white, { lineColor: C.line, fontSize: 9 });
  pill(s, "项目阶段", 9.49, 3.65, 0.90, C.navy, C.white, { lineColor: C.line, fontSize: 9 });
  pill(s, "区域走廊", 6.08, 6.18, 0.90, C.navy, C.white, { lineColor: C.line, fontSize: 9 });
  pill(s, "调研工作台", 9.49, 6.18, 1.02, C.navy, C.white, { lineColor: C.line, fontSize: 9 });
}

// 05 Tender workflow
{
  const s = base(true); title(s, "TRACK B · TENDER DELIVERY", "工程投标：六步把招标文件变成标稿", 5); footer(s);
  txt(s, "输入不是“一个 PDF”，而是一组必须彼此校验的招标文件、规范、BOQ 与补遗。", 0.58, 1.29, 8.8, 0.34, { fontSize: 14.2, color: C.muted, label: "tender input thesis" });
  card(s, 0.58, 1.89, 2.08, 4.62, C.navy, { lineColor: C.navy, label: "tender inputs" });
  txt(s, "INPUT", 0.86, 2.18, 1.45, 0.25, { fontSize: 9.5, bold: true, color: "73E3E9", charSpacing: 1.8, label: "input label" });
  txt(s, "招标全量文件", 0.86, 2.60, 1.45, 0.44, { fontFace: FONT_H, fontSize: 18, bold: true, color: C.white, label: "input title" });
  ["招标书 / 规范", "BOQ / 图纸", "补遗 / 澄清", "企业模板"].forEach((t, i) => pill(s, t, 0.84, 3.31 + i * 0.58, 1.53, "CBE2F0", "113B57", { h: 0.38, fontSize: 9.6 }));
  const steps = [
    ["01", "全量解析", "建立文件清单"], ["02", "条款索引", "章 / 节 / Clause"], ["03", "范围界定", "包含项与排除项"],
    ["04", "BOQ 组价", "五步可复算"], ["05", "施工推演", "工法与阶段"], ["06", "模板标稿", "统一成果树"],
  ];
  steps.forEach((st, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 3.06 + col * 2.25, y = 1.95 + row * 2.29;
    card(s, x, y, 1.91, 1.78, i === 5 ? C.paleBlue : C.white, { lineColor: i === 5 ? C.blue : C.line, lineWidth: i === 5 ? 1.3 : 0.8, label: `tender step ${st[0]}` });
    txt(s, st[0], x + 0.18, y + 0.18, 0.43, 0.25, { fontSize: 10, bold: true, color: C.blue, label: `step ${st[0]} number` });
    txt(s, st[1], x + 0.18, y + 0.58, 1.48, 0.40, { fontFace: /[A-Za-z]/.test(st[1]) ? FONT_B : FONT_H, fontSize: 17, bold: true, color: C.navy, label: `step ${st[0]} title` });
    txt(s, st[2], x + 0.18, y + 1.14, 1.50, 0.30, { fontSize: 10.5, color: C.muted, label: `step ${st[0]} detail` });
    if (col < 2) line(s, x + 1.91, y + 0.89, 0.34, 0, C.blue, 1.8, { endArrowType: "triangle", label: "tender connector" });
  });
  line(s, 7.49, 3.73, -4.43, 0.50, C.blue, 1.8, { endArrowType: "triangle", label: "tender row turn" });
  card(s, 10.08, 1.89, 2.64, 4.62, C.white, { lineColor: C.cyan, lineWidth: 1.2, label: "tender outputs" });
  txt(s, "OUTPUT", 10.38, 2.18, 1.82, 0.25, { fontSize: 9.5, bold: true, color: C.cyan, charSpacing: 1.8, label: "output label" });
  txt(s, "可递交成果", 10.38, 2.60, 1.82, 0.44, { fontFace: FONT_H, fontSize: 18, bold: true, color: C.navy, label: "output title" });
  ["条款与风险清单", "BOQ 组价工作簿", "施工策划", "企业模板标稿"].forEach((t, i) => {
    circle(s, 10.39, 3.33 + i * 0.66, 0.28, i === 3 ? C.cyan : C.blue, "output dot");
    txt(s, "✓", 10.39, 3.34 + i * 0.66, 0.28, 0.20, { fontSize: 8.5, bold: true, color: C.white, align: "center", label: "output check" });
    txt(s, t, 10.83, 3.28 + i * 0.66, 1.52, 0.36, { fontSize: 11.2, color: C.ink, bold: i === 3, label: `output ${t}` });
  });
  pill(s, "核验点：源文件 / 页 / 条款 / 行", 10.37, 5.98, 1.98, C.navy, C.paleCyan, { h: 0.38, fontSize: 8.5, bold: true });
}

// 06 BOQ
{
  const s = base(true); title(s, "BOQ PRICING", "BOQ 定价：五步推导，一条可复算证据链", 6); footer(s);
  txt(s, "范围 → 工法 → 工效 → 资源价格 → 单价", 0.58, 1.29, 7.0, 0.34, { fontSize: 14.5, color: C.muted, label: "boq chain" });
  const st = [
    ["01", "范围界定", "计量规则 / 包含项"], ["02", "工法选定", "施工序列 / 约束"], ["03", "工效测定", "班组 / 工时 / 瓶颈"],
    ["04", "资源取价", "地点 / 日期 / 来源"], ["05", "单价合成", "消耗 × 费率"],
  ];
  st.forEach((a, i) => {
    const x = 0.62 + i * 1.18, y = 2.05 + i * 0.63;
    card(s, x, y, 2.45, 0.94, i === 4 ? C.navy : C.white, { lineColor: i === 4 ? C.navy : (i === 3 ? C.cyan : C.blue), lineWidth: 1.0, label: `boq step ${a[0]}` });
    pill(s, a[0], x + 0.16, y + 0.16, 0.44, i === 4 ? C.navy : C.white, i === 4 ? "79E7EA" : (i === 3 ? C.cyan : C.blue), { h: 0.28, fontSize: 8.2, bold: true });
    txt(s, a[1], x + 0.72, y + 0.15, 1.45, 0.28, { fontSize: 13.5, bold: true, color: i === 4 ? C.white : C.navy, label: `boq ${a[1]}` });
    txt(s, a[2], x + 0.72, y + 0.51, 1.50, 0.22, { fontSize: 9.2, color: i === 4 ? "BDD0DE" : C.muted, label: `boq ${a[2]}` });
  });
  card(s, 7.86, 1.73, 4.85, 4.82, C.white, { lineColor: C.line, label: "boq workpaper" });
  txt(s, "真实工作底稿摘录", 8.16, 1.99, 2.60, 0.34, { fontFace: FONT_H, fontSize: 18, bold: true, color: C.navy, label: "workpaper title" });
  pill(s, "旧项目示例", 11.28, 2.00, 1.08, C.red, "FDEDED", { lineColor: "F5CACA", fontSize: 9.2, bold: true });
  txt(s, "C5.1.1 原状料压实至 95% MDD · COTO A5.1.3", 8.16, 2.45, 4.14, 0.24, { fontSize: 9.8, color: C.muted, label: "workpaper meta" });
  const rows = [
    ["成本项", "计算", "金额 / m³"], ["人工", "(R850 + R1,000) / 2,500", "R0.74"],
    ["机械", "设备费合计 / 2,500", "R5.33"], ["材料（水）", "R4,375 / 2,500", "R1.75"],
    ["纯直接费单价", "人工 + 机械 + 材料", "R7.82"],
  ];
  rows.forEach((r, i) => {
    const y = 2.94 + i * 0.52;
    rect(s, 8.14, y, 4.28, 0.46, i === 0 ? C.navy : i === 4 ? C.paleCyan : (i % 2 ? "F7FAFC" : C.white), { line: { color: C.line, width: 0.6 }, label: `workpaper row ${i}` });
    txt(s, r[0], 8.28, y + 0.03, 1.15, 0.33, { fontSize: 9.4, bold: i === 0 || i === 4, color: i === 0 ? C.white : C.ink, label: `workpaper ${r[0]}` });
    txt(s, r[1], 9.38, y + 0.03, 1.91, 0.33, { fontSize: 9.0, color: i === 0 ? C.white : C.muted, label: "workpaper calculation" });
    txt(s, r[2], 11.40, y + 0.03, 0.82, 0.33, { fontSize: 9.4, bold: i === 0 || i === 4, color: i === 0 ? C.white : (i === 4 ? C.cyan : C.ink), align: "right", label: "workpaper amount" });
  });
  txt(s, "边界：新标必须按项目地点、日期、工时、雨季与运距重新核证。", 8.16, 5.74, 4.12, 0.48, { fontSize: 9.8, color: C.red, bold: true, label: "boq caveat" });
  pill(s, "来源页 / 条款 / 行", 0.72, 6.17, 1.46, C.blue, C.paleBlue, { fontSize: 9.2 });
  pill(s, "资源价：地点 + 日期", 2.33, 6.17, 1.64, C.cyan, C.paleCyan, { fontSize: 9.2 });
  pill(s, "人工复核状态", 4.13, 6.17, 1.30, C.navy, "E9EFF4", { fontSize: 9.2 });
}

// 07 Evidence gate
{
  const s = base(true); title(s, "EVIDENCE GATE", "证据门禁：让每个结论都能回到原文", 7); footer(s);
  txt(s, "检索负责找到候选证据，门禁负责判断它能否进入正式成果。", 0.58, 1.29, 7.8, 0.34, { fontSize: 14.4, color: C.muted, label: "gate thesis" });
  const checks = [
    ["来源", "谁发布 / 原始文件"], ["日期", "何时有效 / 是否过期"], ["口径", "项目、地区与适用条件"],
    ["冲突", "保留差异，不强行合并"], ["人工复核", "关键判断必须确认"],
  ];
  checks.forEach((a, i) => {
    const y = 1.86 + i * 0.86;
    card(s, 0.62, y, 3.33, 0.65, i === 4 ? C.paleCyan : C.white, { lineColor: i === 4 ? C.cyan : C.line, shadow: false, label: `gate check ${a[0]}` });
    circle(s, 0.82, y + 0.15, 0.34, i === 4 ? C.cyan : C.blue, "gate check dot");
    txt(s, String(i + 1), 0.82, y + 0.17, 0.34, 0.20, { fontSize: 8.3, bold: true, color: C.white, align: "center", label: "gate check number" });
    txt(s, a[0], 1.34, y + 0.10, 0.84, 0.25, { fontSize: 12.5, bold: true, color: C.navy, label: `gate check ${a[0]} title` });
    txt(s, a[1], 2.18, y + 0.10, 1.48, 0.34, { fontSize: 10.2, color: C.muted, label: `gate check ${a[0]} detail` });
  });
  line(s, 4.08, 3.94, 0.70, 0, C.blue, 2.5, { endArrowType: "triangle", label: "checks to gate" });
  card(s, 4.87, 2.02, 3.30, 3.93, C.navy, { lineColor: C.navy, label: "gate core" });
  txt(s, "BM25", 5.24, 2.39, 1.0, 0.32, { fontSize: 17, bold: true, color: "76E7EB", label: "BM25" });
  txt(s, "定位候选段落", 6.23, 2.43, 1.50, 0.24, { fontSize: 10.5, color: "BFD3E0", align: "right", label: "BM25 purpose" });
  line(s, 5.24, 2.90, 2.50, 0, "33516D", 1, { label: "gate divider" });
  txt(s, "证据门禁", 5.24, 3.23, 2.50, 0.54, { fontFace: FONT_H, fontSize: 24, bold: true, color: C.white, align: "center", label: "gate title" });
  txt(s, "引用先于结论\n冲突显式呈现\n关键节点人工确认", 5.40, 4.08, 2.18, 1.05, { fontSize: 13.3, color: "C9DBE6", align: "center", label: "gate rules" });
  pill(s, "PASS / HOLD", 5.78, 5.34, 1.47, C.navy, "7CE9EE", { h: 0.38, fontSize: 10.2, bold: true });
  line(s, 8.17, 3.94, 0.70, 0, C.cyan, 2.5, { endArrowType: "triangle", label: "gate to references" });
  card(s, 8.97, 1.85, 3.74, 4.27, C.white, { lineColor: C.cyan, lineWidth: 1.1, label: "clickable references" });
  txt(s, "系统内可点击回源", 9.28, 2.16, 2.72, 0.40, { fontFace: FONT_H, fontSize: 18, bold: true, color: C.navy, label: "clickable references title" });
  ["源文件：Tender Data", "页码：p.126", "条款：COTO A5.1.3", "时点：2026-08", "状态：人工复核"].forEach((t, i) => pill(s, t, 9.27, 2.90 + i * 0.56, 2.45, i === 4 ? C.green : C.blue, i === 4 ? "EAF8F2" : C.paleBlue, { h: 0.37, fontSize: 9.4, bold: i === 4 }));
  txt(s, "系统内点击 → 回到出处", 9.29, 5.67, 2.40, 0.24, { fontSize: 10.2, bold: true, color: C.cyan, align: "right", label: "click hint" });
  txt(s, "本页为静态示意", 9.29, 5.91, 2.40, 0.20, { fontSize: 8.6, color: C.muted, align: "right", label: "static reference note" });
}

// 08 Real outputs
{
  const s = base(true); title(s, "REAL OUTPUTS", "真实成果：主证据不是概念界面", 8); footer(s);
  txt(s, "知识库与投标成果为主，商业调研图表为辅；EB 施工仿真明确标注为“模拟辅助”。", 0.58, 1.29, 9.5, 0.34, { fontSize: 14.2, color: C.muted, label: "real outputs thesis" });
  imageFrame(s, path.join(ROOT, "assets", "kb-workbench-redacted.png"), 0.61, 1.80, 6.38, 3.57, { label: "knowledge workbench redacted pixels" });
  rect(s, 0.82, 4.72, 5.92, 0.47, C.navy, { transparency: 4, rounded: true, label: "knowledge caption" });
  txt(s, "主证据｜知识库工作台 × 投标证据链", 1.02, 4.81, 4.94, 0.24, { fontSize: 11, bold: true, color: C.white, label: "knowledge caption text" });
  imageFrame(s, path.join(IMG, "report-equity.png"), 7.30, 1.80, 2.50, 1.74, { label: "equity result" });
  imageFrame(s, path.join(IMG, "report-stages.png"), 10.13, 1.80, 2.58, 1.74, { label: "stages result" });
  imageFrame(s, path.join(IMG, "report-map.png"), 7.30, 3.86, 2.50, 2.03, { label: "map result" });
  imageFrame(s, path.join(SUPPORT, "simulation-eb-cloete.png"), 10.13, 3.86, 2.58, 2.03, { label: "simulation result" });
  pill(s, "股权", 7.44, 3.12, 0.64, C.navy, C.white, { lineColor: C.line, fontSize: 8.8 });
  pill(s, "阶段", 10.27, 3.12, 0.64, C.navy, C.white, { lineColor: C.line, fontSize: 8.8 });
  pill(s, "区域", 7.44, 5.46, 0.64, C.navy, C.white, { lineColor: C.line, fontSize: 8.8 });
  pill(s, "模拟辅助", 10.27, 5.46, 0.90, C.red, "FDEDED", { lineColor: "F3CACA", fontSize: 8.8, bold: true });
  const chips = [["原始文件", C.blue], ["章节条款", C.blue], ["BOQ 底稿", C.cyan], ["正式标稿", C.navy]];
  chips.forEach((a, i) => pill(s, a[0], 0.80 + i * 1.46, 5.73, 1.22, a[1], a[1] === C.navy ? "E9EFF4" : (a[1] === C.cyan ? C.paleCyan : C.paleBlue), { h: 0.40, fontSize: 9.5, bold: true }));
  txt(s, "个人本地路径已从源图像像素中脱敏", 0.82, 6.31, 3.6, 0.23, { fontSize: 9.3, color: C.muted, label: "privacy note" });
  txt(s, "模型假设与最终专业结论仍须由项目团队复核。", 9.03, 6.28, 3.68, 0.30, { fontSize: 9.3, color: C.red, align: "right", label: "simulation boundary" });
}

// 09 Business value
{
  const s = base(true); title(s, "BUSINESS VALUE", "价值不止在投标：成果沿项目周期继续复用", 9); footer(s);
  txt(s, "不虚构效率百分比，只展示可见的工作链与成果复用关系。", 0.58, 1.29, 7.3, 0.34, { fontSize: 14.2, color: C.muted, label: "value thesis" });
  const phases = [
    { n: "01", en: "RESEARCH", t: "调研支撑决策", d: "机会、市场、业主、伙伴、风险", c: C.cyan, f: C.paleCyan },
    { n: "02", en: "TENDER", t: "投标形成标稿", d: "条款、BOQ、工法、施工策划", c: C.blue, f: C.paleBlue },
    { n: "03", en: "DELIVERY", t: "中标后复用", d: "知识库、参数、计划与交底", c: C.navy, f: "E8EEF3" },
  ];
  phases.forEach((p, i) => {
    const x = 0.64 + i * 4.10;
    card(s, x, 2.02, 3.62, 3.50, p.f, { lineColor: p.c, lineWidth: 1.1, label: `value ${p.en}` });
    txt(s, p.n, x + 0.26, 2.31, 0.62, 0.35, { fontSize: 13.5, bold: true, color: p.c, label: "phase number" });
    txt(s, p.en, x + 1.59, 2.36, 1.62, 0.23, { fontSize: 9.2, bold: true, color: p.c, charSpacing: 1.5, align: "right", label: "phase english" });
    txt(s, p.t, x + 0.26, 3.04, 2.96, 0.50, { fontFace: FONT_H, fontSize: 20.5, bold: true, color: C.navy, label: `phase ${p.t}` });
    txt(s, p.d, x + 0.26, 3.86, 2.94, 0.60, { fontSize: 12.3, color: C.muted, label: `phase ${p.d}` });
    line(s, x + 0.27, 4.78, 2.95, 0, p.c, 3.0, { transparency: 8, label: "phase trace" });
    if (i < 2) {
      line(s, x + 3.62, 3.75, 0.48, 0, C.cyan, 2.6, { endArrowType: "triangle", label: "phase connector" });
    }
  });
  rect(s, 1.20, 5.95, 10.93, 0.58, C.navy, { rounded: true, label: "reuse band" });
  txt(s, "同一证据链，跨阶段复用：减少重新找资料、重新解释口径、重新搭建成果结构。", 1.50, 6.10, 10.30, 0.27, { fontSize: 12.8, bold: true, color: C.white, align: "center", label: "reuse statement" });
}

// 10 Closing
{
  const s = base(false);
  for (let i = 0; i < 11; i++) line(s, 0.54 + i * 1.18, 0.55, 0, 6.40, "173A58", 0.55, { transparency: 30, label: "closing grid" });
  for (let i = 0; i < 7; i++) line(s, 0.54, 0.62 + i * 0.98, 12.22, 0, "173A58", 0.55, { transparency: 30, label: "closing grid" });
  txt(s, "THE CONVERGENCE ENGINE", 0.68, 0.65, 5.1, 0.28, { fontSize: 10, bold: true, color: "72E4E9", charSpacing: 2.1, label: "closing kicker" });
  txt(s, "把复杂输入组织成\n可信、可复核、可递交的工程成果", 1.28, 1.72, 10.78, 1.72, { fontFace: FONT_H, fontSize: 31, bold: true, color: C.white, align: "center", label: "closing claim" });
  line(s, 2.03, 4.41, 3.25, 0, C.cyan, 4.1, { label: "closing commercial" });
  line(s, 2.03, 5.23, 3.25, 0, C.blue, 4.1, { label: "closing tender" });
  line(s, 5.28, 4.41, 1.48, 0.40, C.cyan, 4.1, { label: "closing commercial merge" });
  line(s, 5.28, 5.23, 1.48, -0.40, C.blue, 4.1, { label: "closing tender merge" });
  card(s, 6.79, 4.36, 1.36, 0.92, "123B5B", { lineColor: "7AE6EB", shadow: false, label: "closing gate" });
  txt(s, "证据门禁", 6.91, 4.61, 1.12, 0.30, { fontSize: 12.2, bold: true, color: C.white, align: "center", label: "closing gate title" });
  line(s, 8.15, 4.82, 1.05, 0, C.blue, 3.3, { endArrowType: "triangle", label: "closing output arrow" });
  card(s, 9.30, 4.33, 2.38, 1.02, C.white, { lineColor: C.white, shadow: SHADOW(), label: "closing official outputs" });
  txt(s, "Official Outputs", 9.57, 4.55, 1.82, 0.30, { fontSize: 14, bold: true, color: C.navy, align: "center", label: "closing official title" });
  txt(s, "谢谢 · 请评委指导", 3.82, 6.38, 5.70, 0.36, { fontSize: 14.5, color: "B6CBD9", align: "center", label: "thanks" });
  txt(s, "向鑫 · 海外业务赛道", 10.40, 6.79, 2.30, 0.20, { fontSize: 8.5, color: "809AB0", align: "right", label: "closing footer" });
}

// 11 Appendix A
{
  const s = base(true); title(s, "APPENDIX A · DESIGN NOTE", "设计说明", 11); footer(s, "附录 A · 设计说明");
  card(s, 0.62, 1.50, 7.62, 5.22, C.white, { lineColor: C.line, label: "design note" });
  txt(s, "创意理念", 0.94, 1.86, 1.30, 0.35, { fontFace: FONT_H, fontSize: 17, bold: true, color: C.cyan, label: "design section" });
  txt(s, "作品以“汇流工程”为核心隐喻：商业调研与工程投标是两条独立长程作业轨，它们持续推进、交叉校验，最终在证据门禁处汇聚为正式成果。蓝色代表投标作业，青色代表商业调研，深色节点代表门禁，明亮终点代表 Official Outputs。", 0.94, 2.28, 6.96, 1.02, { fontSize: 12.6, color: C.ink, label: "creative concept" });
  txt(s, "作品亮点", 0.94, 3.48, 1.30, 0.35, { fontFace: FONT_H, fontSize: 17, bold: true, color: C.blue, label: "design section" });
  txt(s, "系统覆盖投标、实施、投资 3 个业务域，以 34 个领域 Skills 组织专业作业；投标采用 6 步流程，BOQ 采用 5 步推导。BM25 用于定位候选段落，系统内可点击回源至源文件、页码与条款；成果进入统一成果树，支持人工复核后递交。", 0.94, 3.90, 6.96, 1.02, { fontSize: 12.6, color: C.ink, label: "work highlights" });
  txt(s, "形成过程", 0.94, 5.10, 1.30, 0.35, { fontFace: FONT_H, fontSize: 17, bold: true, color: C.navy, label: "design section" });
  txt(s, "从真实海外业务问题出发，先梳理商业调研与投标作业链，再把规范条款、BOQ 底稿、调研图表、施工策划等成果映射到统一证据规则；经过真实成果验证与人工复核边界校准，形成当前方案。", 0.94, 5.52, 6.96, 0.84, { fontSize: 12.6, color: C.ink, label: "formation process" });
  card(s, 8.62, 1.50, 4.09, 5.22, C.navy, { lineColor: C.navy, label: "participant role" });
  txt(s, "参赛人角色", 8.97, 1.88, 2.24, 0.30, { fontSize: 10, bold: true, color: "76E5EA", charSpacing: 1.6, label: "role kicker" });
  txt(s, "向鑫", 8.97, 2.43, 2.44, 0.66, { fontFace: FONT_H, fontSize: 29, bold: true, color: C.white, label: "participant name" });
  const roles = ["系统架构", "工作流设计", "领域技能与知识库建设", "真实项目验证"];
  roles.forEach((r, i) => {
    circle(s, 8.99, 3.42 + i * 0.62, 0.27, i < 2 ? C.cyan : C.blue, "role dot");
    txt(s, r, 9.43, 3.35 + i * 0.62, 2.65, 0.36, { fontSize: 12.2, color: C.white, bold: i < 2, label: `role ${r}` });
  });
  txt(s, "设计说明正文少于 1000 个汉字。", 8.98, 6.16, 3.22, 0.27, { fontSize: 8.8, color: "92ACBF", label: "design count note" });
}

// 12 Appendix B
{
  const s = base(true); title(s, "APPENDIX B · EVIDENCE BOUNDARY", "证据边界与人工复核边界", 12); footer(s, "附录 B · 证据与责任边界");
  txt(s, "AI 产出的是可追溯、可复核的专业草稿；关键判断与最终数字仍由具备职责的专业人员确认。", 0.58, 1.28, 10.3, 0.36, { fontSize: 14.1, color: C.muted, label: "boundary thesis" });
  const rows = [
    ["内容类型", "系统可完成", "必须人工复核", "进入正式成果的条件"],
    ["商业事实", "检索、聚合、形成引用卡片", "时点、主体、冲突来源", "来源与日期可定位"],
    ["条款范围", "按章 / 节 / Clause 索引", "适用性、合同解释", "原文回指 + 责任人确认"],
    ["BOQ 定价", "形成五步推导与底稿", "工程量、工效、资源价", "项目化核价 + 专业复核"],
    ["施工策划", "组织参数与阶段草案", "安全、工况、可实施性", "项目团队审查批准"],
    ["EB 仿真", "辅助表达工序与场景", "模型假设、参数、最终结论", "明确“模拟辅助”标识"],
  ];
  const xs = [0.64, 2.55, 5.89, 9.00], ws = [1.84, 3.25, 3.02, 3.68];
  rows.forEach((r, i) => {
    const y = 1.86 + i * 0.72;
    rect(s, 0.62, y, 12.08, 0.64, i === 0 ? C.navy : i % 2 ? C.white : "F0F5F8", { line: { color: C.line, width: 0.7 }, label: `boundary row ${i}` });
    r.forEach((v, j) => txt(s, v, xs[j], y + 0.07, ws[j], 0.46, { fontSize: i === 0 ? 10.7 : 10.2, bold: i === 0 || j === 0, color: i === 0 ? C.white : (j === 0 ? C.navy : C.ink), align: i === 0 ? "center" : "left", label: `boundary ${v}` }));
  });
  card(s, 0.64, 6.23, 12.04, 0.46, C.paleCyan, { lineColor: C.cyan, shadow: false, label: "boundary bottom note" });
  txt(s, "统一原则：证据不足则暂缓放行；来源冲突则显式保留；最终递交必须经过人工复核。", 0.93, 6.30, 11.47, 0.25, { fontSize: 11.2, bold: true, color: C.navy, align: "center", label: "boundary principle" });
}

function qaLayout() {
  const issues = [];
  for (const o of layoutLog) {
    if (o.x < -0.001 || o.y < -0.001 || o.x + o.w > 13.334 || o.y + o.h > 7.501) issues.push({ type: "out_of_bounds", ...o });
    if (o.kind !== "line" && (o.w <= 0 || o.h <= 0)) issues.push({ type: "invalid_size", ...o });
    const fullBleedExempt = o.kind === "image" && o.label === "engineering hero";
    if (["text", "image"].includes(o.kind) && !fullBleedExempt && (o.x < 0.5 || o.y < 0.5 || o.x + o.w > 12.833 || o.y + o.h > 7.0)) {
      issues.push({ type: "safe_margin", ...o });
    }
  }
  fs.writeFileSync(path.join(QA, "layout-objects.json"), JSON.stringify(layoutLog, null, 2), "utf8");
  fs.writeFileSync(path.join(QA, "layout-check.json"), JSON.stringify({ objectCount: layoutLog.length, issues }, null, 2), "utf8");
  if (issues.length) console.warn(`Layout QA found ${issues.length} issue(s); inspect qa/ppt/layout-check.json`);
}

qaLayout();
pptx.writeFile({ fileName: FILE }).then(() => console.log(FILE));
