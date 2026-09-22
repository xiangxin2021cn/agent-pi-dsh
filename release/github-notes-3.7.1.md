# Agent Pi DSH 3.7.1

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.1","kernel":{"releaseTag":"dsh-v0.1.7-alpha.1","commit":"c36a83ff6bb95e3f82cf79f9be7c724270a8aa61"}} -->

Agent Pi DSH 由 **Always π AI studio** 独立开发和维护。本次从正式版 3.7.0 升级，不包含 3.7.0-RSI.1 的实验功能。

## DSH 内核

升级至官方 [0.1.7-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)：

- 会话置顶、归档、过滤、撤销和搜索恢复；改进会话历史处理。
- 合并相邻的思考与工具执行详情，改进性能信息与展示选项。
- 长命令后台运行、实时输出与停止；文件变化后刷新预览。
- 原生只读表格、Office/PDF/图片缩放、系统打开文件及并排差异预览。
- Agent Teams 按成员名称操作、共享任务板展示，以及 Windows 图片路径、启动和压缩预算修复。

产品层适配新预设 bundle、设置持久化与会话接口，保持官方内核源码不变。保留可选 Agent Teams、独立 Codex 执行、专业深度、手动模板、报告技能、CAD 和资源文件栏。普通对话仍按真实任务执行，知识库由用户明确选用。

## 项目计划

内置本机 MPXJ 16.7.0 和 Java 17，无需上传计划文件至云端。点击文件可查看任务表与甘特条，编辑任务名称、计划起止时间、工期完成百分比和备注，另存后自动重新读取并核对修改。

- MPP 可读取；修改后导出 Microsoft Project XML，由 Project 打开后另存为 MPP。
- P6 XER / PMXML 可读取和导出；多项目文件可选择项目。
- 原文件不覆盖；此功能不执行 Project/P6 自动排程，也不保证格式转换保留每一项专有字段。完成百分比为工期百分比，不代替 P6 的实物或单位完成百分比。
- 当前 XER 自动识别 UTF-8，其他内容按 MPXJ 默认 Windows-1252 读取；GBK 等编码请先转换。

## 插件与兼容

- 更新 dshmarket 1.55.0、AnySearch 0.1.6、Super Injector 0.3.5。
- 保留官方 Univer Office 0.3.2 完整插件，适配 DSH 新设置接口；原生只读表格不替代 Office 编辑能力。
- 邮件插件 0.13.2 仍调用 DSH 已移除的设置接口：显示明确的不兼容原因并暂不加载，保留原有插件及账号配置，避免影响主应用启动。

微信附件问题仍需手机端验收。IM 4.25 的 `/batch` 只支持文字，不能作为多图批次方案；新版附件持久化也不能修复已过期或从未成功下载的旧图片。本次不宣称工程照片连续上传与总结问题已全部解决。

CAD 对应源码沿用已验证的 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz`，来源提交 `1aef6820ebc450125788158a4b2d1706115cdd10`。MPXJ、依赖源码及第三方许可随本机计划组件分发。

项目及发行物采用 `GPL-3.0-only`，第三方组件保留原始条款。正式 SHA256 以同一 Release 中的 `.sha256` 资产为准。
