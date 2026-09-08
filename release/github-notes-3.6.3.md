# Agent Pi DSH 3.6.3

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.3","kernel":{"releaseTag":"dsh-v0.1.5-alpha.1","commit":"2faa751be99c8fbee0524e478f4c53d93b408131"}} -->

基于 3.6.2 融入官方 DSH `dsh-v0.1.5-alpha.1`，固定提交为 [`2faa751be9`](https://github.com/deepseek-ai/deepseek-harness/commit/2faa751be99c8fbee0524e478f4c53d93b408131)。产品适配保留在独立 overlay 和 bundle，官方内核源码不做补丁。

- DeepSeek 模型列表增加 `deepseek-v4.1-flash-expires-on-0910`，供用户手动选择。保留稳定默认模型与用户自定义参数；灰度模型权限和有效期由服务端决定，没有未经核实地写入容量或图片能力。
- 保留 Codex CLI 0.153.4、设置页默认模型/思考等级、主对话单次覆盖及 DSH 原生附件上传。
- 保留普通对话的原生 DSH 流程、显式投标绑定与知识库手动引用边界。
- 保留官方 `dsh-univer-office` 0.2.13 完整插件、原始许可及授权校验。
- 同步新版 DSH 会话文件锁依赖，跨平台构建校验官方系统模块的实际加载能力。

CAD 图纸仍由本机 Worker/WASM 解析。CAD 集成输入未改变时复用已验证产物，无需新增 CAD 云端构建；原始源码归档保持名称 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`，来源提交为 `1aef6820ebc450125788158a4b2d1706115cdd10`。应用 3.6.3 的源码和构建回执另行记录，不改写 CAD 原始构建身份。

项目及发行物采用 `GPL-3.0-only`，第三方组件保留原始条款。正式 SHA256 以同一 Release 中的 `.sha256` 资产为准。旧会话由官方内核按需迁移；请避免两个版本同时写入同一应用数据目录。
