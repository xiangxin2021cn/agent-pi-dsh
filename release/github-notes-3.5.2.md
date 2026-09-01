# Agent Pi DSH 3.5.2 — DSH alpha.3 正式升级

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.5.2","kernel":{"releaseTag":"dsh-v0.1.2-alpha.3","commit":"dd6322d604e00eec1ba5e0c8541159906a21094a"}} -->

本版本将核心依赖正式升级到 DeepSeek Harness **`dsh-v0.1.2-alpha.3`**（`dd6322d604`），通过独立 `v3.5.2` 标签和 Release 发布，不覆盖 3.5.1。

## 主要变化

- 适配 alpha.3 独立 Chat projection：工作台、Codex 结算和用户要求监听合并读取 Session 与 Chat。
- 发布包强制使用 alpha.3 JSONL 会话后端，拒绝已删除的 SQLite Session 持久化模块残留。
- 获得长会话分页导航、低内存渲染、图片排队与子智能体图片投递、无扩展名图片识别及后端卡顿误断线修复。
- 延续 3.5.1 的一次点击一次派发、招标分析覆盖核验、BOQ 识别修复和最终提交冻结门禁。

## 发布规则

- `main` 只通过 PR merge commit 接收发布线；标签在 merge 后创建。
- 内核指针变化必须提升应用版本，并由 CI 与打包门禁校验。
- Release 资源不可覆盖；任何后续内核升级都创建新版本和新 Release。

## 下载

- Windows x64：[Agent-Pi-DSH-3.5.2-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.5.2/Agent-Pi-DSH-3.5.2-x64.exe)
- SHA256：`664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A`
- macOS arm64 与 Linux x64 资源由 `v3.5.2` 标签中的 GitHub Actions 构建。

安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH（包括托盘进程）；Windows SmartScreen 请选择“仍要运行”，并先核对 SHA256。
