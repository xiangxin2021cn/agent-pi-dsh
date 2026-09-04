# Agent Pi DSH 3.6.0 — DSH rc.1 与 DWG 预览正式版

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.6.0","kernel":{"releaseTag":"dsh-v0.1.2-rc.1","commit":"a66e4702047846cdaa10c66c9d3df3951f5ea70d"}} -->

本版本增加 MLightCAD CAD 只读预览、桌面安装包集成，并将 DeepSeek Harness 固定到官方 **`dsh-v0.1.2-rc.1`**（`a66e470204`）。Agent Pi 的兼容层仍位于产品层，官方 DSH 内核源码保持干净。

## 主要变化

- 右侧文件栏按需加载独立 CAD viewer；主对话、附件事务和专业工作台保持原路径。
- Windows 安装包与跨平台 runtime payload 核验 viewer HTML、JS、CSS、worker、WASM、离线回退字体和许可证归档。
- rc.1 适配拒绝旧 alpha.3 runtime 与已移除的 SQLite 会话后端，并保留长会话导航、模型登录、子智能体、ACP、Inspector/Web Preview、断线重连与 Windows Python SDK 等上游能力。
- 冷启动、旧会话迁移、模式切换和投标工作台事务交接均纳入正式验收。
- `dsh-univer-office` 改为市场可选安装；公共安装包不分发其 Univer Pro 商业运行时。市场会提示商业许可要求与 rc.1 兼容性待验证，升级迁移不会改动用户自行安装的 npm 版本。

## 许可与发布闸门

MLightCAD viewer 与 data-model 为 MIT；LibreDWG converter/web 包声明为 GPL-3.0。仓库所有者选择 GPL 路线，因此 Agent Pi DSH 3.6.0 的项目代码和发行物按 `GPL-3.0-only` 发布，第三方组件继续保留自身原始条款。

publisher 以本地/远端 exact tag 双向绑定、干净检出、GPL 元数据、clean runtime 和可验证对应源码 fail-closed。Release 必须同时提供 `Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz` 及其 `.sha256`；Windows、runtime payload、macOS 与 Linux 产物也各自提供 SHA256，Windows 另附绑定 payload、CAD 与 DSH 来源的构建回执。十五项正式资产全部到齐且远端 digest 与校验文件一致后，才可公开为 Latest。

发布前还会检查 Windows 解包树与 runtime payload，确保没有预装 Office wrapper、Univer Pro 包或旧 vendor receipt。

这些是构建与分发的技术合规措施，不构成法律意见。

CAD 文字使用随包的 Source Han Sans CN 2.005（SIL OFL 1.1）作为离线中西文回退；自定义 SHX、BigFont 编码和工程专用符号仍可能采用近似字形。
