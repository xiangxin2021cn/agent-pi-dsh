# Agent Pi DSH 3.4.2 — PageIndex 影子导航与 WorkSurface 证据面

本版在 3.4.1 已收敛的七阶段投标流程上，增加长篇招标文件的结构导航、知识面类型路由、不可变证据包和分析覆盖账本。DSH 主智能体、投标编排、BOQ 表面、价格与提交门禁保持不变；DeepSeek Harness 官方子模块继续固定在 **`dsh-v0.1.2-alpha.1`**（`cd5ef81481`），未修改内核源码。

## 主要变化

- 参考 MIT 许可的 [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) 结构树思想，以最小 TypeScript 适配接入现有 MinerU / manuscript 管线；没有整体引入 OpenKB、Python 运行时或第二套 API Key。
- 只对长篇叙事 PDF / Markdown 建立带源哈希和失效检测的影子索引；短文档、精确条款、Excel/BOQ、MiniSearch、MinerU 与既有门禁保持原路径。
- 新增 `document | table | graph | combined` 类型化路由，文档摘要不得替代 BOQ 数量、公式和汇总。
- 新增不可变结构化证据包和 `[ev:claimId]` 审计令牌；自然显示文件、章节/页码或工作表单元格，源哈希变更会使证据失效。
- 招标分析按五个要求域记录已读/未读节点、证据、结论和人工确认；工作台展示影子索引健康度、覆盖、证据和成本。
- 影子索引禁用、缺失、过期或损坏时，3.4.1 的 MiniSearch、条款、MinerU、BOQ 和阶段门禁全部保留。

## 审慎上线

随版本提交的 96 道开发夹具用于验证实现链路：候选 Route F1、证据召回和依赖路径准确率均为 1.00；旧统一入口基线 Route F1 约 0.667、证据召回约 0.344。开发夹具不是人工审校的真实项目金标，因此**默认导航器仍处于影子模式**；只有真实项目审计集通过全部门槛后才允许默认切换。

## 验证与下载

- 84 个测试文件、389 项测试全部通过。
- Electron 冷启动 8.989 秒（门槛 30 秒）；认证、侧栏、工作台、API Key 单一入口检查通过。
- 旧 `code` 会话迁移与标准 → PTC → 极简切换通过。
- Windows x64：[Agent-Pi-DSH-3.4.2-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-x64.exe)
- SHA256：`BC18E20A2C11C032A7B41018406E3B811A6E8E138F33F0512581BEF5B8F2540B`
- macOS / Linux 安装资源由同一 Release 的 GitHub Actions 构建回传。

安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH（包括托盘进程）；Windows SmartScreen 请选择「仍要运行」。
