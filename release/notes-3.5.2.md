# Agent Pi DSH 3.5.2 — DSH alpha.3 正式升级

3.5.2 将核心依赖正式升级到 DeepSeek Harness **`dsh-v0.1.2-alpha.3`**（`dd6322d604`）。本版本通过独立标签和 Release 发布，不覆盖 3.5.1；以后任何 `DSH_PIN` 变化都必须同步提升 Agent Pi DSH 应用版本。

## 核心变化

- 适配 alpha.3 独立 Chat projection：专业工作台、Codex 任务结算和用户要求监听合并读取 Session 与 Chat，避免升级后“主对话在运行、控制面板看不到”的失联。
- 发布包强制使用 alpha.3 JSONL 会话后端，并拒绝已被上游删除的 SQLite Session 持久化模块残留。
- 获得 alpha.3 长会话分页导航、低内存渲染、图片排队与子智能体图片投递、无扩展名图片识别和后端卡顿误断线修复。
- 保留 3.5.1 的投标执行止损：一次点击一次派发、整阶段覆盖核验、BOQ 识别修复和最终提交冻结门禁。

## 发布治理

- 正常流程固定为：发布分支 → PR → `main` merge commit → 新版本标签 → draft Release → 三平台资源齐全 → Latest Release。
- Windows、本地运行时、macOS 和 Linux 上传均不允许 `--clobber`；同版本资源不再覆盖。
- 新增 PR 与打包双门禁：内核指针改变但应用版本未提升时，CI 和本地打包都会失败。

## 验证

- 脚本、投标 Host、真实 DOM、业务核心、类型检查及桌面冷启动/模式切换烟测。
- Windows 安装包：`Agent-Pi-DSH-3.5.2-x64.exe`
- SHA256：`664C6FEBF8C1968A962C28417F9BFD96877CF32EE16BAA9A0FC819C8F154751A`
