# Task 3 实现报告

## 完成结果

已以官方附件 2 为唯一版式基线，生成推荐表基础填写版：

- `competition/final/out/附件2-决赛作品推荐表-向鑫-基础填写版.docx`

官方源文件保持不变；未重建表格，未填写任何公司意见、签字人或日期。

## 实现边界

- 官方源文件 SHA-256：`1C0A447777E52FBA935F87FEE86BA873DF4E356E1217A49CA92F8D443F99E0AD`。
- 最终文件 SHA-256：`B4FF4E8FE020BE39F0F8772424236FF472CC4AE8DC087DAE48E1CF99751546E3`。
- 仅修改 DOCX 包内的 `word/document.xml`；其余包部件、关系和文件清单与官方源文件一致。
- 官方标题、A4 纵向页面、页边距、1 个 7 行 × 5 网格列表格、合并关系、列宽、边框、固定行高和审批栏全部保留。
- 官方源文件在完成后重新核验，SHA-256 未变化。

## 已填写的五个字段

- 参赛作品名称：海外工程投标及商业调研全流程AI智能 Agent 作业系统
- 参赛选手姓名：向鑫
- 参赛作品赛道：海外业务赛道
- 所属单位：博茨公司
- 作品简介：共 258 个字符，说明商业调研轨与工程投标轨并行、证据门禁、可点击且可追溯引用、Official Outputs，以及关键判断、最终工程量和价格必须由具备职责的专业人员审核确认的边界。

作品简介未写入效率提升百分比、业务规模、成本、产品版本号或其他未经核验的量化结论。

## 排版实现

- 短字段沿用官方模板的仿宋体系、10.5 pt 字号与单元格垂直居中，并采用水平居中。
- 作品简介沿用仿宋体系、10.5 pt 字号，使用两字符首行缩进、两端对齐和 1.25 倍行距；内容在原大单元格内自然换行并保持视觉居中。
- 未调整表格尺寸、行高、列宽、合并单元格、边框或审批栏内的既有签字日期提示。

## 结构与样式审计

结构审计通过：

- 1 个节、1 个表格、7 行、5 个网格列。
- 网格列宽保持 `1456、1040、2286、2286、2288 twips`。
- A4 纵向；页边距保持左/右 1.25 英寸、上/下 1.00 英寸。
- 三个审批行与官方源文件逐字节一致。
- 五个目标单元格的文本与批准内容完全一致；作品简介长度在 150—260 字符范围内。
- 样式审计未发现标题伪装为标题样式等新增结构问题；新增直接格式仅来自五个填写字段，并继承官方字体体系。

审计文件：

- `competition/final/qa/recommendation-filled/final-style-lint.json`

## PDF 导出与逐页检查

Documents 技能的 LibreOffice 渲染器在当前 Windows 环境找不到 `soffice`，因此按任务要求改用 Microsoft Word 后台以只读方式打开最终 DOCX 并导出 PDF，再使用工作区内置 Poppler 生成逐页 PNG。

验证结果：

- PDF：1 页，页面尺寸约 `595.3 × 841.9 pt`，对应 A4 纵向。
- 逐页检查：标题、表格、五个填写字段和三处审批栏均完整；无截断、重叠、异常换行、边框断裂或缺字。
- 作品名称保持单行；作品简介完整落在原大单元格内，末行未溢出。
- 三处公司意见内容区未填写；部门经理/主要领导及年月日提示保持官方原样。
- 同一 Word 渲染链路下对官方模板与最终文件做像素差异范围检查，差异包围盒仅落在五个获批填写区域，填写区域之外差异为 0。

QA 文件：

- `competition/final/qa/recommendation-filled/render-v1/附件2-决赛作品推荐表-向鑫-基础填写版.pdf`
- `competition/final/qa/recommendation-filled/render-v1/page-1.png`
- `competition/final/qa/recommendation-filled/render-v1/reference.pdf`
- `competition/final/qa/recommendation-filled/render-v1/reference-page-1.png`
- `competition/final/qa/recommendation-filled/render-v1/visual-diff.png`

## 可复现实现

- `competition/final/qa/recommendation-template/build_recommendation_docx.py`

脚本先核验官方模板哈希与表格标签，只向五个批准的空白单元格写入内容；生成后再次检查审批行、包部件清单和非目标包部件，发现任何意外变化即失败。

未创建 Git 提交。
