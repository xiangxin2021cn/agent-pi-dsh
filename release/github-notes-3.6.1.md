# Agent Pi DSH 3.6.1 — DSH 0.1.3 与本地工程文件工作台

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.1","kernel":{"releaseTag":"dsh-v0.1.3-alpha.1","commit":"d347e703908d0406b7a7ef80e3a0e594d86b2215"}} -->

本版本将 DeepSeek Harness 固定到官方 **`dsh-v0.1.3-alpha.1`**（`d347e70390`），完善 Office 与 DWG 两条本地工程文件工作链。Agent Pi 兼容层仍位于产品层，官方 DSH 内核源码保持干净。

## 主要变化

- `dsh-univer-office` 0.2.13 改用新 `uiConversation` 服务路径，修复启动时等待旧 `conversationEvents` 导致的 pending；安装、升级、skills 同步与卸载均增加产品所有权收据和事务回滚。
- 默认关闭 Univer 遥测。含 Univer Pro 运行时的预装只用于明确启用且具备商业许可的构建；公开构建不会静默分发商业运行时。
- Windows 安装/卸载增加专属目录、安装收据和链接目录保护；插件解绑或链接清理失败时保留程序，不继续删除。
- DWG 查看器完整本地化 worker、WASM、字体与运行资源，支持完整审阅工具栏、缺失字体导入、布局/缺失资源状态、大图自适应超时；默认全图，新增可选“主体取景”，不隐藏或删除远端实体。
- 真实 28.9 MB DWG 的网络追踪没有任何外部请求。实测后保留 `progressiveRendering: false` 和 1000 实体批量下限，避免无收益的 progressive 模式及重复 preload。
- 每会话附件事务、长会话折叠、Codex 子智能体、模式迁移和专业工作台交接继续由产品层适配并纳入回归验证。
- 适配新 `createDrafts` / `addAttachments` / `attachmentIds` 接口；跨平台构建显式校验新增会话写入锁的原生依赖。

## 升级提醒

升级前退出旧版并备份应用数据。旧会话由官方运行时按需迁移到 v2，保留原文件；首次打开大型会话可能较慢，本机 5,395 事件投标样本首次迁移约 128 秒、工作集约 2.36 GB。三个真实会话副本及 10 个图片附件已通过迁移/重读/内容校验，但不应据此保证所有第三方插件历史记录都兼容。遇迁移报错请保留原文件，不要同时使用两个版本写同一会话。

## 许可与发布闸门

项目代码和公开发行物继续采用 `GPL-3.0-only`。第三方组件保留各自原始条款；LibreDWG 对应源码随 Release 提供。

publisher 要求 exact `v3.6.1`、干净检出、同一 main 提交、GPL 元数据、clean CAD runtime、Windows 构建回执和全部校验文件先在本地通过。Release 必须包含 `Agent-Pi-DSH-3.6.1-CAD-corresponding-source.tar.gz` 及其 SHA256；Windows、runtime payload、macOS、Linux 资产也各自提供 SHA256。十五项资产的名称、数量、大小与 GitHub digest 全部一致后，draft 才能发布为 Latest。

发布资产不可覆盖；如有问题必须提升版本重新发布。
