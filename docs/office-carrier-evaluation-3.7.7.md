# Office 载体评估（3.7.7，2026-09-29）

结论：保留完整的 `dsh-univer-office` 0.3.5 作为应用内 Office 工作台；本轮只升级 DSH 内核，不接入或替换 OfficeCLI。OfficeCLI 适合以后作为受控的文件级代理工具试点，不能凭项目宣称直接认定为本应用最佳 Office 载体。

| 维度 | DSH 0.2.0-rc.1 官方能力 | 当前 Univer 插件 | OfficeCLI v1.0.152 |
| --- | --- | --- | --- |
| 主要用途 | Office 技能引导 Word/Excel/PPT 工作；LibreOffice Kit 做转换、重算/渲染和 PDF 预览 | DSH/Cordis 插件，内嵌 Sheet/Doc/Slide 编辑、预览、导入导出、工作树和会话内审核 | 单文件 CLI/MCP/SDK，结构化查询、批量修改、验证、HTML/PNG 预览 |
| 人工工作台 | 官方文档/PDF 预览，不提供可替代的完整 Office 编辑工作台 | 现有桌面应用内交互、预览、批准或丢弃变更 | `watch` 提供浏览器预览和有限表格内联编辑；尚无与本应用相同的嵌入式协作/审核流程 |
| 智能体接口 | 技能与现有文件工具 | 原生 DSH 插件和配套技能 | `--json`、元素路径、`batch`、MCP，文件级精确修改较有吸引力 |
| 分发/许可 | 官方 DSH MIT；LibreOffice Kit 另有运行时与许可 | 上游插件 Apache-2.0；当前发行物已有完整依赖、许可和逐文件校验 | Apache-2.0；自包含 .NET 二进制，需要另建固定版本、完整性、自动更新关闭和隔离运行的发布流程 |

判断依据：

- 本应用的 Univer 0.3.5 已打通 DSH 插件注册、桌面内预览和编辑、工作树审核、XLSX/DOCX/PPTX 导入导出及安装包完整性门禁。替换它需要重新实现这些用户路径，并验证已有项目和文件的迁移；OfficeCLI 的 `watch` 不能直接承担该职责。
- Univer 0.3.5 上游声明的 DSH peer 范围尚未包含 0.2.0-rc.1。本版只对其七个 DSH 依赖声明加入精确的 `0.2.0-rc.1`，未修改官方内核或放宽未来版本。已核对这些接口的生产源码，并验证插件在隔离桌面启动时由主机和客户端实际加载；这仍不等于对所有复杂 Office 文件的内容保真作出保证。
- OfficeCLI 提供比纯 Office 技能更直接的结构化文件操作，尤其是按元素定位、JSON 回读、原子批量修改和渲染后检查。它可能补足复杂模板的局部编辑，但这些是候选增量能力，不是替换证明。
- 上游当前公开问题包括 [DOCX PAGE 字段刷新损坏](https://github.com/iOfficeAI/OfficeCLI/issues/438)、[CSV 长标识符/前导零改变](https://github.com/iOfficeAI/OfficeCLI/issues/415)、[MCP 未执行操作却报告成功](https://github.com/iOfficeAI/OfficeCLI/issues/411)、[XLSX 文本列将等号内容当公式](https://github.com/iOfficeAI/OfficeCLI/issues/410)。这类风险对投标表格和正式文件尤为敏感。这里只依据公开问题判断风险，未声称本应用已复现。
- 官方 0.2.0-rc.1 [发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1)涉及 Office/PDF 预览文字选区；其 [Office-to-PDF 包](https://github.com/deepseek-ai/deepseek-harness/tree/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/document/office-to-pdf)仍依赖 LibreOffice Kit，未提供取代 Univer 的完整编辑器。

后续若试点 OfficeCLI，应先固定版本并禁用自动更新，在隔离副本上用真实投标 DOCX、BOQ XLSX、PPTX 模板比较内容保真、公式/格式、PDF/PNG 渲染、MCP 错误语义和耗时；尤其测试长编号、公式文本、页码字段、批注、合并单元格及复杂图表。通过后才考虑将其包装为可选 Cordis 工具，由任务路由选择，不直接改写用户原件。

来源：[DSH 官方发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.1)、[OfficeCLI 项目及命令](https://github.com/iOfficeAI/OfficeCLI)、[OfficeCLI 版本](https://github.com/iOfficeAI/OfficeCLI/releases/tag/v1.0.152)、[Univer DSH 插件](https://github.com/dream-num/dsh-univer-office)。
