# Agent Pi DSH 3.5.3 — 每会话附件事务正式版

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.5.3","kernel":{"releaseTag":"dsh-v0.1.2-alpha.3","commit":"dd6322d604e00eec1ba5e0c8541159906a21094a"}} -->

本版本修复主对话附件“显示已挂载、实际未进入该轮对话”的全链路一致性问题，并将官网扩展为十种语言。DeepSeek Harness 内核保持 **`dsh-v0.1.2-alpha.3`**（`dd6322d604`），未修改官方内核源码。

## 主要变化

- 普通附件发送升级为每会话显式事务控制器，统一管理准备、提交、持久成功、失败和会话销毁。
- 附件仅在匹配的用户消息节点真实持久化后清除；失败时保留附件并安全恢复原草稿。
- 多会话并发、同路径不同附件实例、草稿变化和会话销毁均隔离处理。
- 隐藏附件上下文使用事务标识条件取消，旧事务不会清除同会话的新上下文。
- 普通主对话与 Codex 执行共用同一附件事务协议，避免前端附件状态与 DSH 会话状态分叉。
- Windows 打包补齐 `tender-host` 锁定依赖，减少安装后文档处理模块缺失。
- 官网首页提供简体中文、英语、西班牙语、法语、德语、日语、韩语、葡萄牙语、阿拉伯语和俄语，并保留 GitHub Latest Release 自动同步。
- DSH 内核保持 `dsh-v0.1.2-alpha.3`，不修改官方内核源码。

## 发布规则

- `v3.5.3` 标签在 `main` 的 PR merge commit 上创建。
- Windows、运行时、macOS 和 Linux 资源均不可覆盖；后续修复使用新的应用版本。
- Release 仅在八项跨平台资源全部到齐后发布为 Latest。

## 下载

- Windows x64：[Agent-Pi-DSH-3.5.3-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.5.3/Agent-Pi-DSH-3.5.3-x64.exe)
- SHA256：`579CAE929C685CB0BAD65F6476B4124593DD3649C68CCAE0E1CA8829E8EF7213`
- macOS arm64 与 Linux x64 资源由 `v3.5.3` 标签中的 GitHub Actions 构建。

安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH（包括托盘进程）；Windows SmartScreen 请选择“仍要运行”，并先核对 SHA256。
