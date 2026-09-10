# Agent Pi DSH 3.6.5

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.5","kernel":{"releaseTag":"dsh-v0.1.5-rc.1","commit":"1ef9c1fa9afbea78c5537bfc8b6d1c27d598798e"}} -->

融入官方 DSH `dsh-v0.1.5-rc.1`，固定提交为 [`1ef9c1fa9a`](https://github.com/deepseek-ai/deepseek-harness/commit/1ef9c1fa9afbea78c5537bfc8b6d1c27d598798e)。产品扩展保持在 overlay 和 bundle，官方内核源码不做补丁。

- 新对话使用官方默认 `deepseek-flash`（DeepSeek V4.1 Flash），支持原生文字、图片理解；模型目录直接由 DSH 提供。
- 移除过期灰度模型 `deepseek-v4.1-flash-expires-on-0910`。迁移旧默认 Flash、Vision Exp 和灰度选择到正式模型，保留其他供应商、自定义模型及思考等级。
- 自动压缩的可选兜底模型同步使用 `deepseek-flash`。上下文和请求能力遵循官方 DSH：1,000,000 token 上下文，默认输出上限 256,000 token，支持历史中的系统提示更新。
- 保留资源文件栏作为唯一文件管理入口（正式成果、上传资料、工作区和关联项目目录），停用重复的官方文件树。保留官方文档预览与交付卡片；协调右侧占位，Office/CAD 使用完整预览器，同一文件关闭后可再次打开。
- 保留“专业深度”、精简过程、按需投标流程、用户选择的知识库、Codex 模型和思考等级选择、原生附件入口。
- 保留官方 `dsh-univer-office` 0.2.13 完整插件及其原始许可、授权校验；保留本地 CAD Worker/WASM。

CAD 对应源码沿用已验证的 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`，来源提交 `1aef6820ebc450125788158a4b2d1706115cdd10`。
项目及发行物采用 `GPL-3.0-only`，第三方组件保留原始条款。正式 SHA256 以同一 Release 中的 `.sha256` 资产为准。
