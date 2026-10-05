# 工程计算书与 Office 交付插件（5.8.0）

`engineering_export({outputBasename?})` 仅从实际主对话的 `engineering.status(sessionId)` 取得来源、对象、规则、分口径数量、覆盖和运行记录；不接受调用者提交的项目 JSON 或 cwd。输出写入工作目录中新建的 `Agent Pi Outputs/Engineering Exports/<名称>-r<版本>-<随机标识>/`，不覆盖原文件或已有交付。

交付包括真实 `engineering-workbook.xlsx`、可读 `engineering-report.html`、按主题分表的 UTF-8 CSV、`source-snapshot.json` 和 `tables.json`。复用 DSH Office 文档预览组件已安装的 SheetJS 0.20.3；不新增大依赖。库从 `DSH_CHECKOUT/packages/client/ui-sidebar-documentpreview/package.json` 解析，真实路径必须仍在同一 DSH 闭包内；不会借用祖先目录的开发依赖。安装版 `DSH_CHECKOUT` 是 `resources/runtime/deepseek-harness`，Windows 打包保留并修复其内部 pnpm 链接。运行环境缺该库时明确输出 CSV/HTML/JSON，不把 CSV 改名为 XLSX。返回每个文件的真实绝对路径、MIME 与 SHA256。HTML 可由原生文件预览打开；XLSX 可用实际安装的 `univer_import` 打开 Office，导出本身不强制用户切换界面。

工作簿分开保存来源、对象参数、四类工程数量、规则版本、覆盖、运行历史、问题、钢筋逐组和三口径小计、道路区间和几何小计、IFC 原生 QTO/几何量、中国响应矩阵、不可覆盖的原始清单及复算差异。所有运行独立列出，不跨运行、单位、线路范围或口径自动相加。旧运行、blocked、插件变化或不可用记录的 `current*` 小计为 null，原记录数字仍作为历史保留。当前已知小计仍不代表专业复核或完整项目数量。

土建市政分表保留逐实体 `quantity/knownPortion/unit/quantityBasis`，按类型、单位和口径保存 `completeSubtotal/knownPartialSubtotal/knownSubtotal` 及各自当前可用值。平面 2D 管沟长度、空间 3D 长度、体积和计数不混算；未算对象与排除理由来自独立预期目录，另表记录目录覆盖和未归属数量。PDF 标定表保留来源 SHA256、页码、视口尺寸、坐标系、实际标注和两点、计算比例与标定内容哈希；未知或过期比例不作为当前依据。标定只适用于所记同版本、同页、同视口，不等于全图自动量取。

实际数字 0 保持数值零；null 单元格明确显示 `null（未知）`，缺字段显示 `未提供`；JSON 保留原始 null。领域小数串和清单代码保持字符串以避免 Excel 15 位精度损失。原始公式/标注作为文字而非工作簿公式执行；CSV 对可触发公式的文字前缀做转义。HTML 全部转义并禁用脚本及网络内容。Excel 的长单元格限制用明确的 `tables.json` 定位替代，不静默丢失完整字段。IFC 网格顶点保留于原始快照，表中保留数量及定位。

主要文件通过既有 `taskGuide.update` 注册源哈希证据、draft 成果和发现；派生证据依赖工程宿主的稳定状态证据，工程版本、来源或运行状态变化后由现有依赖传播将交付成果标为 stale。不维护另一个任务状态。空工程尚无持久版本时明确提示未建立此关联。依据同步失败会在工具结果明确报告；导出期间项目/来源/能力变化则标出历史快照或避免跨项目登记。导出不授予客户验收、专业复核通过、正式报价认可或钢筋加工批准。关闭插件移除能力贡献，已有交付和任务记录仍保留。

验证：`node --test bundles/engineering-delivery/tests/export.test.ts`。用真实 DSH `defineTool`、工程宿主与 taskGuide 验证注册和交付链；通过独立 ExcelJS 读取实际 XLSX 验证格式、数值零、未知值、精确小数和非公式字符串；验证过期小计、原始文件保护、目录穿越/junction、CSV 注入、长单元格 JSON 恢复、缺库回退及同步失败。Windows junction 测试需要临时目录链接权限。

安装运行库验证设置 `ENGINEERING_DELIVERY_RUNTIME_DSH` 为已构建安装目录中的 `resources/runtime/deepseek-harness` 后运行同一测试：实际从其内部 `node_modules/.pnpm/xlsx@https+++cdn.sheetjs.com+xlsx-0.20.3+xlsx-0.20.3.tgz/node_modules/xlsx/xlsx.js` 生成工作簿，再由独立 ExcelJS 读回。未设置时仅这项可选安装产物测试跳过；不可据开发环境测试声称安装产物已验证。
