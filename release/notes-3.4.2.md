# Agent Pi DSH 3.4.2 — PageIndex 影子导航与 WorkSurface 证据面

本版在 3.4.1 已收敛的七阶段投标流程上，增加长篇招标文件的结构导航、知识面类型路由、不可变证据包和分析覆盖账本。DSH 主智能体、投标编排、BOQ 表面、价格与提交门禁保持不变；DeepSeek Harness 官方子模块继续固定在 **`dsh-v0.1.2-alpha.1`**（`cd5ef81481`），未修改内核源码。

## PageIndex 影子导航

- 参考 MIT 许可的 [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) 结构树思想，以最小 TypeScript 适配接入现有 MinerU / manuscript 管线；没有整体引入 OpenKB、Python 运行时、LiteLLM 或第二套项目状态。
- 只为长篇叙事类 PDF / Markdown 建立影子树；短文档、Excel、BOQ 和表格占主导的资料继续走既有快路径。
- 影子索引绑定源文件、manuscript、pack、解析器和适配版本哈希；新增、保存、重建或删除知识条目时同步失效和重建，不进入 Electron 首屏关键路径。
- 索引禁用、缺失、过期或损坏时，MiniSearch、精确条款、MinerU、BOQ 和阶段门禁照常可用。
- 没有新 API Key 弹窗；当前确定性树构建不调用模型，因此索引模型调用、Token 与费用均为 0，仍保留项目级遥测字段。

## WorkSurface 与自然证据

- 新增 `document | table | graph | combined` 类型化路由：条款号先走精确条款，数量、公式和汇总必须走表格，版本与能力影响走依赖图；文档摘要不得替代 BOQ 计算。
- 结构化证据包冻结 claim、来源、章节/页码或工作表单元格、内部定位符和源哈希；正文显示自然出处，审计仍能用 `[ev:claimId]` 精确复核。
- 招标分析按资格风险、商务合同、BOQ 计价、施工技术、合规提交五个域记录已读/未读节点、证据、结论和人工确认。
- 专业化工作台新增只读“知识面导航与证据”状态卡，展示影子/默认状态、PageIndex 健康度、五域覆盖、证据数量和调用成本。

## 上线门禁

- 随版本提交 96 道可复现开发夹具（文档、表格、依赖各 32 道），用于验证路由、定位和计分代码。
- 开发夹具上候选 Route F1、证据召回和依赖路径准确率均为 1.00；旧统一入口基线 Route F1 约 0.667、证据召回约 0.344。
- 这些夹具不是人工审校的真实投标项目金标，因此**默认导航器仍保持影子模式**。只有真实项目审计集同时满足 Route F1 ≥ 0.95、文档证据召回提高至少 10 个百分点、定位 100%、无证据关键结论 ≤ 1% 等全部门槛，才会自动允许默认切换。

## 验证

- 产品层 84 个测试文件、389 项测试全部通过。
- 真实 Electron 冷启动 8.989 秒（门槛 30 秒），认证 URL、侧栏、工作台和无重复 API Key 弹窗检查通过。
- 旧 `code` 默认与旧会话迁移、事件帧保持、四种官方 preset 可见、标准 → PTC → 极简切换通过。
- Windows x64 安装包 SHA256：`BC18E20A2C11C032A7B41018406E3B811A6E8E138F33F0512581BEF5B8F2540B`。
- 跨平台 runtime payload SHA256：`90AABED041B6843D96AC24AF015B2FEB79393FB737E0A0BED65CCC02583E4F20`。
- DeepSeek Harness 官方子模块保持干净。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.4.2-x64.exe](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-x64.exe) · SHA256 `BC18E20A2C11C032A7B41018406E3B811A6E8E138F33F0512581BEF5B8F2540B` |
| macOS Apple Silicon | [DMG](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-mac-arm64.dmg) · [ZIP](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-mac-arm64.zip) |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-linux-x86_64.AppImage) · [DEB](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/download/v3.4.2/Agent-Pi-DSH-3.4.2-linux-amd64.deb) |
| 保留的 3.4.1 | [Agent Pi DSH v3.4.1](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/tag/v3.4.1) |
| 2.6.5 经典版 | [Craft Agents OSS 版](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

桌面安装包尚未签名。覆盖安装前请完全退出 Agent Pi DSH，包括托盘进程；Windows 遇到 SmartScreen 时选择「仍要运行」。
