# Task 2 实现报告

## 完成结果

已在 `competition/final` 内使用 PptxGenJS 新建决赛答辩套件，没有覆盖或修改 `competition/out` 旧稿。

交付文件：

- `competition/final/out/决赛答辩-海外工程投标及商业调研全流程AI智能Agent作业系统-向鑫.pptx`
- `competition/final/out/5分钟答辩讲稿-向鑫.md`
- `competition/final/out/2分钟展板讲解-向鑫.md`
- `competition/final/build_deck.cjs`

## PPT 实现

- 版式：13.333 × 7.5 英寸，16:9 宽屏。
- 页数：10 页主体 + 2 页附录，共 12 页。
- 视觉语言：工程纸白、深海军蓝、蓝青双轨、汇流节点、玻璃卡片、出处芯片与 Official Outputs 终点。
- 可见作品名统一为 `海外工程投标及商业调研全流程AI智能 Agent 作业系统`；PPT 文件名保持无空格紧凑形式。
- 字体：中文主标题声明 Source Han Sans SC Bold；中英文混排使用 Microsoft YaHei 系统中文回退，避免 PowerPoint 字体替代造成拉丁字母异常。
- 真实素材：知识库工作台、股权图、项目阶段图、区域地图、调研工作台与 EB Cloete 仿真截图；仿真明确标记为“模拟辅助”。
- 证据口径：仅使用 3 个业务域、34 个领域 Skills、投标 6 步、BOQ 5 步、BM25、证据门禁、系统内可点击回源、Official Outputs 和仓库真实成果；第 7 页明确标注“本页为静态示意”。未写入 brief 禁止的不可核验结论。
- 安全区：所有信息文字与非全出血图片均位于四边至少 0.5 英寸安全区内；封面工程图作为全出血背景豁免。
- 路径脱敏：生成 `competition/final/assets/kb-workbench-redacted.png`，将项目路径与知识库路径的遮挡直接烘焙进图像像素；第 8 页只嵌入脱敏图，不再依赖可移动的 PPT 遮罩。
- 支撑素材：`simulation-eb-cloete.png` 与 `simulation-evidence.png` 已移至 `competition/final/qa/ppt/supporting-assets/`，正式 `out` 仅保留展板、PPT、讲稿和推荐表主交付。

## 讲稿验证

- 5 分钟答辩稿：按 10 个主体页标记；排除 Markdown 标题和页标记后的可朗读正文为 1131 个汉字，首 30 秒说明解决的问题；EB 画面统一称为“EB Cloete 模拟界面”。
- 2 分钟展板稿：按 3 张展板标记；排除 Markdown 标题和展板标记后的可朗读正文为 447 个汉字，突出“双轨并行—证据门禁—正式成果”。
- 字数记录：`competition/final/qa/ppt/script-counts.json`。

## QA 与修正闭环

1. 首轮生成并逐页渲染 12 张 PNG，制作 `contact-sheet-v1.png`。
2. 发现封面 `Agent` 和 BOQ 中英文混排发生字体替代；改为系统中文字体回退后重新生成。
3. 第二轮渲染 `contact-sheet-v2.png`，放大检查发现第 6 页第五步被工作底稿遮挡。
4. 收紧 BOQ 五步阶梯的水平步距，重新生成并以 150 dpi 单页复验。
5. 最终全套重新渲染到 `render-v3`，生成 `contact-sheet-final.png`；未发现新的裁切、遮挡或低对比问题。
6. 独立审查后，将公共页眉、页码、页脚和封面参赛信息收进四边 0.5 英寸安全区；补齐四边自动检查。
7. 第 8 页用两个不透明遮罩覆盖项目路径与知识库路径；第 7 页改为“系统内可点击回源 / 本页为静态示意”。
8. 扩充两份讲稿，并按排除 Markdown 标题后的朗读正文口径复算。
9. 最终 PPT 全套重新渲染到 `render-v5`，更新 `contact-sheet-final.png`；重点复验第 1、7、8、10—12 页通过。
10. 最终递交包收口时，将两处路径脱敏直接写入截图像素并替换 PPTX 媒体；解压扫描全部媒体，确认原始截图哈希命中 0、脱敏截图命中 1。
11. 可见作品名统一为正式名称，两张 simulation 支撑素材移出 `out`；最终全套重新渲染到 `render-v6` 并更新联系图。

自动检查结果：

- `layout-check.json`：717 个已知对象；四边 0.5 英寸安全区、页面越界或无效尺寸问题均为 0。
- `content-check.json`：12 页；页面尺寸 13.333 × 7.5 英寸；占位符 0；禁止口径命中 0；PPTX 包内敏感 ASCII 路径命中 0；原始截图媒体哈希命中 0；脱敏截图媒体哈希命中 1；旧作品名空格形式命中 0。
- `script-counts.json`：分别记录全文汉字数与 `SpokenBodyHanChars`，朗读正文为 1131 / 447 个汉字。
- PowerPoint 成功打开并导出最终 PDF，证明文件结构可用。

## QA 文件

- `competition/final/qa/ppt/contact-sheet-final.png`
- `competition/final/qa/ppt/render-v6/deck-v6.pdf`
- `competition/final/qa/ppt/render-v6/slide-01.png` 至 `slide-12.png`
- `competition/final/qa/ppt/layout-check.json`
- `competition/final/qa/ppt/layout-objects.json`
- `competition/final/qa/ppt/content-check.json`
- `competition/final/qa/ppt/media-scan.json`
- `competition/final/qa/ppt/media-contact-sheet-final.png`
- `competition/final/qa/ppt/media-scan-final/`
- `competition/final/qa/ppt/text-extract.txt`
- `competition/final/qa/ppt/visual-qa.md`

## 说明

技能内置的 LibreOffice 包装脚本在当前 Windows Python 环境缺少 `socket.AF_UNIX`，因此改用本机 PowerPoint 后台导出 PDF；渲染与逐页复验均已完成。未提交 Git。
