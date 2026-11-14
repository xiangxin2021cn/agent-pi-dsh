# Agent Pi DSH 3.9.0 主线版

- DSH 升级到官方 `0.2.2-rc.3` 已合入 master 的固定提交 `39163dd30f703a79079e2d2446545cff3c453738`。
- 保留主线专业工作台、知识库、投标技能、完整 Univer Office 和 DSH 后台执行能力。
- 保留产品自动压缩、上下文超限恢复和图片卸载适配，并使用新内核重新验证。
- Codex 和 Claude 通过 DSH 的本地 OAR 委派执行，安装包沿用精简的生产依赖策略。
- 对齐 rc.3 的配置解析、会话级团队开关和 OAR 名称式任务确认，升级时保留旧配置备份。
- 修复新版侧栏结构下专业工作台入口，以及 Univer 和市场对新认证接口的兼容；保留认证、所有者校验和文档会话范围限制。
- Windows、Linux、Apple Silicon 和 Intel 安装包分别构建。macOS 正式包须完成 Developer ID 签名、Apple 公证与原生挂载冷启动验收。

发行状态以 GitHub Release 和各平台验收记录为准。投标专版独立维护。

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.9.0","kernel":{"releaseTag":"dsh-v0.2.2-rc.3","commit":"39163dd30f703a79079e2d2446545cff3c453738"}} -->
