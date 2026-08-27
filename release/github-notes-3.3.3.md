# Agent Pi DSH 3.3.3 — 南非道路投标分析更深，右侧多格式，软件内 Univer 编辑

**3.3.3** 把日常好用再往前推了一步：南非道路投标的招标解析必须写到规定深度，不能再拿一份总报告交差；右侧资源栏能按真实格式打开、预览、改稿；Excel / Word / PPT 引入 **Univer**，在软件里直接编辑保存。内核仍钉 DeepSeek Harness **`dsh-v0.1.1-rc.2`**。没有新的会话库格式断裂。

Windows 安装包现在就能下。macOS Apple Silicon / Linux x64 由本 Release 上的 GitHub Actions 回传。

---

## 南非道路投标：分析必须达到的深度

合格分析不是「有一份总报告」就过关。出厂门槛要求解析阶段落地 **五份固定文件名的深度分析稿**，外加原来的逐文件解析稿、`项目特征.md`、`招标文件解析总报告.md`。总报告是综合指针，**不能代替**这五份。

| 文件 | 必须覆盖 |
| --- | --- |
| `招标文件总结.md` | 基本信息、卷册、资格、评标、合同/商业、返标、时间、风险 |
| `工程量清单分析.md` | 总价、分册 / Schedule、PC Sum 或暂定、报价策略、风险 |
| `工程范围与技术规范总结.md` | 合同数据、范围、规范、HSE |
| `合同特殊条款与规范修订总结.md` | 特殊条款对照、优先级 / 支付 / 分包、规范修订、索赔 / EOT |
| `技术标文件要求汇总.md` | 返标总表、A 系列、B 系列 / 评分、方法说明书深度 |

每份至少约 3500 字，并且正文出现对应章节。缺文件、过短、缺章节时，工作台「检查」标红并列出缺口；监控空闲只催补齐，不重扫已经完成的源文件；`complete_stage` **拒绝**过门。

不预装任何一单的原文（金额、里程、罚款、地名会污染下一标）。知识库只绑结构标准；你自己的合格稿可以入库当「用户模板」勾选复刻目录，那是加分，不是门槛。

---

## 右侧文件：多格式打开，不再只是折角纸

资源栏按扩展名分色，打开方式对齐真实办公习惯：

- **图标**：`.md` 青色 M，Excel 绿网格，Word 蓝 W，PPT 橙播放，PDF 红 P，HTML 紫括号
- **Markdown / 文本**：打开先进只读预览，工具栏「编辑」才进所见即所得；超大稿先切前约 6 万字，表按张展开，避免卡死
- **PDF**：内嵌阅读
- **HTML**：同源站点可运行预览，相对 CSS / JS / 脚本可用
- **选区「AI 改」**：划选后发回**当前主会话**，带着项目记忆改这份文件，不再另开独立改稿窗

左右栏都可以拖：左侧约 264–420px，右侧 220–560px（会记住宽度）。收起右侧仍留 56px 图标轨。

---

## Univer：软件内编辑表格、文稿、幻灯片

右侧点 `.xlsx` / `.csv` / `.tsv` / `.docx` / `.pptx` / `.univer` 时，优先挂官方 **Univer Gateway Viewer**——和对话里打开完全体是同一套，可在软件内改、保存。

- 首次打开会导入工作区隐藏 sidecar（`.agent-pi/univer-preview/`），可能要等 Gateway 起来
- 完全体改动写在 sidecar `.univer` 草稿；官方未就绪才回退精简预览（精简路径仍可保存回原文件）
- 旧二进制 `.xls` / `.doc` / `.ppt` **不能**导入，请另存为 xlsx / docx / pptx
- 需要原样保真（复杂样式、合并单元格、完整 OOXML）时，请仍在 Excel / Word / PowerPoint 里改

---

## 一并更好用

- 同时最多 **4** 个活工人，避免单进程堆到约 8GB 后崩溃
- 宿主崩溃或 OOM 重启后，续跑指令打回**当前主会话**，同一崩溃只发一次
- 插件市场升级后「立即重启」会真正重启本应用
- 子代理写完会回推主对话；主会话忙时插话进入队列，不再被吞

---

## 下载 / Download

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.3-x64.exe](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-x64.exe) |
| macOS Apple Silicon | [dmg](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-mac-arm64.dmg) · [zip](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-mac-arm64.zip)（CI 回传） |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-linux-x86_64.AppImage) · [deb](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-linux-amd64.deb)（CI 回传） |
| 2.6.5 经典版 | [可与 3.x 并存](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v2.6.5) |

国内镜像（Windows）：[gh-proxy.com](https://gh-proxy.com/https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-x64.exe) · [ghfast.top](https://ghfast.top/https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.3/Agent-Pi-DSH-3.3.3-x64.exe)

Windows SHA256：`7831dbff5ccec870e9eab7e925116210ff80a1f7a3ef69aae8a12e297cb763b0`

未签名：SmartScreen / Gatekeeper 选「仍要运行」。覆盖安装前请**完全退出**（不要只关到托盘）。工作目录和 `Agent Pi Outputs` 接着用。会话不从 2.x 迁移。

---

## 这版你先测什么

1. 招标解析：只有逐文件稿、没有五份深度稿时，「检查」应标红；继续推进 / 监控空闲只催补齐，不要整单重扫。`complete_stage` 在套件未齐时应被拒绝。
2. 右侧 `.md` / `.xlsx` / `.docx` / `.pptx` / `.pdf` / `.html` 应是分色图标。打开 Markdown 先进只读预览，点「编辑」才进所见即所得。
3. 有官方 Univer 时，点 xlsx / docx / pptx 应出现对话同一套完全体，可改可存。旧 `.xls` / `.doc` / `.ppt` 应提示另存。
4. 打开生成的 `index.html`：相对资源应能加载，脚本可跑。预览里划选「AI 改」应回到主对话。
5. 同时活着的子智能体不超过 4。人为结束宿主后，主会话空闲应自动出现续跑指令。
