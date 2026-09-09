# Agent Pi DSH 3.6.4

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.4","kernel":{"releaseTag":"dsh-v0.1.5-alpha.2","commit":"dd393c18202b25f9734d51cb61aac8fa8b2c5ecf"}} -->

基于 3.6.3 融入官方 DSH `dsh-v0.1.5-alpha.2`，固定提交为 [`dd393c1820`](https://github.com/deepseek-ai/deepseek-harness/commit/dd393c18202b25f9734d51cb61aac8fa8b2c5ecf)。产品功能保留在 overlay 和 bundle，官方内核源码不做补丁。

- 新增可选“专业深度”：当前智能体根据用途、专业要求、事实依据、成果格式和验收口径形成任务说明；用户可以中途修改并继续任务。说明、验收项和检查结果保存在本对话，刷新可恢复，新对话默认关闭。
- 专业深度复用 DSH 原生执行与交付工具。交付检查实际读取文件，核对格式、指定内容或 JSON，并记录文件指纹；专业准确性、计算和视觉版式另列为审阅项，避免把模型自评当作验收通过。
- 主对话默认精简过程：隐藏推理和普通工具细节，保留有用进度、错误、交互和成果；可切换“执行详情”。完整事件和轨迹仍保留。要求面向用户的进度随本次输入语言，避免逐条播报工具调用。
- 对接新版 DSH 原生交付卡片，打开 Office、CAD 文件时接入应用现有预览器。
- 保留官方 `dsh-univer-office` 0.2.13 完整插件、原始许可及授权校验；保留 Codex CLI 0.153.4、模型与思考等级选择、DSH 原生附件上传。
- 普通对话保持原生 DSH 执行，投标流程按显式绑定启用，知识库按用户选择引用。保留灰度模型 `deepseek-v4.1-flash-expires-on-0910` 的原生图片能力、1,000,000 token 上下文和 384,000 token 输出配置，不覆盖用户默认模型。

CAD 图纸仍由本机 Worker/WASM 解析。原始 CAD 产物与对应源码沿用已验证的 3.6.2 构建，源码归档为 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`，来源提交 `1aef6820ebc450125788158a4b2d1706115cdd10`；应用 3.6.4 的集成改动和构建回执独立记录。

项目及发行物采用 `GPL-3.0-only`，第三方组件保留原始条款。正式 SHA256 以同一 Release 中的 `.sha256` 资产为准。
