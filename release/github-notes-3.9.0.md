# Agent Pi DSH 3.9.0 主线版

- DSH 升级到官方 `0.2.2-rc.3` 已合入 master 的固定提交 `39163dd30f703a79079e2d2446545cff3c453738`。
- 插件市场更新到官方 1.73.19，合入发布源识别、设置持久化、更新恢复与 Windows 兼容修复，保留原有联网自检、十种语言、历史错误区分和产品安全适配。
- 保留主线专业工作台、知识库、投标技能、完整 Univer Office 和 DSH 后台执行能力。
- 保留产品自动压缩、上下文超限恢复和图片卸载适配，并使用新内核重新验证。
- Codex 和 Claude 通过 DSH 的本地 OAR 委派执行，安装包沿用精简的生产依赖策略。
- 对齐 rc.3 的配置解析、会话级团队开关和 OAR 名称式任务确认，升级时保留旧配置备份。
- 修复新版侧栏结构下专业工作台入口，以及 Univer 和市场对新认证接口的兼容；保留认证、所有者校验和文档会话范围限制。
- Windows、Linux、Apple Silicon 和 Intel 安装包分别构建。macOS 正式包须完成 Developer ID 签名、Apple 公证与原生挂载冷启动验收。

核心插件均已检查。Univer 0.4.0、AnySearch 0.1.8 和注入器 0.3.5 为当前正式发布版本；Router 新版仍需适配已移除的会话接口及其私有执行器，本版保留现有兼容运行时。用户范本 Writing-DNA 保留已审核的 MIT 提交，未纳入新增非商业限制的上游版本。

发行状态以 GitHub Release 和各平台验收记录为准。投标专版独立维护。

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.9.0","kernel":{"releaseTag":"dsh-v0.2.2-rc.3","commit":"39163dd30f703a79079e2d2446545cff3c453738"}} -->
