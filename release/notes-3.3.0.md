# Agent π 3.3.0 — 内核 rc.8，知识库本页解析

**3.3.0** 把钉住的 DeepSeek Harness 升到 **`dsh-v0.1.0-rc.8`**。出厂装配关掉 vision-router 的 stealth，恢复官方 `llm-deepseek`。识图插件还在，只提供 `vision_*` 工具。知识库在本页选 PDF/Word/Excel/PPT/图片即可解析入库，扫描件走 MinerU（默认 OCR），列表与上传文件齐名。

3.2.3 的文件夹路径芯片和右键「注入对话」都还在。桌面壳带 `--no-open`，打开 Windows 应用时不再顺带拉起系统浏览器。

---

## 知识库：本页入库，看起来像一份源文件

- PDF / Word / Excel / PPT / 图片在知识库页选完就解析、切块、入库、勾选，不必先去对话里转 Markdown。
- 扫描件和图片一律走 [MinerU](https://mineru.net/apiManage/docs)。本页可保存并验证 Token；无 Token 时小文件走轻量接口。
- 列表一行一份原文档，名称与上传文件齐名。不展示 `full.md`、`images`、`layout.json` 或 `文件名.pdf-<uuid>` 产物夹。
- 点名称预览并改解析稿；「打开源文件」打开本机保存的原件。保存解析稿会按同一条重建索引。
- 本机 MinerU 产物文件夹（含 `full.md`）拖进来也收成一条，显示名去掉 `-<uuid>`。

---

## 内核 `0.1.0-rc.7` → `0.1.0-rc.8`

钉住上游 [`dsh-v0.1.0-rc.8`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.0-rc.8)。

- DeepSeek 适配器可以**配置**启用原生图片请求；`/goal`、`/plan` 能收图文；`@` 可引用文件和会话。
- **默认 V4 Flash / V4 Pro 仍是纯文本。** 官方视觉模型还没挂进目录。贴图不会自动变成「模型看见了」。
- Windows PTY 支持持久 PowerShell；`web_search` 可并发；子代理 `reportDelivery` 会叫醒父任务。
- 取消流式后，已展示的回复前缀会带进下一问和分叉。大图或历史图片累计过大不再直接把请求打挂。
- Claude Code / Codex 可按需装成 Profile Bundle。**本包不出厂捆绑。**

Persistent PowerShell, concurrent search, and the official image-part pipe land with the kernel. Default DeepSeek models stay text-only.

---

## 识图还在，只不再接管路由 / Vision stays, stealth off

3.2.x 为了让选择器里的 DeepSeek 也能「吃图」，关掉了官方 `llm-deepseek`，让 vision-router 整条接管。rc.8 已经有官方图片管道，再劫持只会挡住内核。

本版出厂 overlay：

- **不再**写 `llm-deepseek: disabled`
- vision-router 固定 `stealth: false`、`progressiveTools: false`
- 插件本身不卸：图纸、扫描页、像素页继续走 `vision_describe` / `vision_ocr` / `vision_crop` / `vision_ground`

启动时若 `$DSH_HOME` 里还留着 `agent-pi:managed-defaults` 标记，会重写出厂 overlay，并把 `settings.yaml` 里残留的 `vision-router.stealth: true` 改回 `false`。删过标记、自己改过 overlay 的人：请去掉 `llm-deepseek disabled`，并把 stealth 关掉。

The vision plugin stays. It no longer takes over the official DeepSeek route.

---

## 仍必须保留的 Agent Pi 覆盖层 / Overlays kept

3.1.x / 3.2.0 针对上百个工人的历史与审批覆盖层全部留下：

- 点开某一个孩子的历史不扫全部兄弟目录
- 历史页有事件上限、字符串瘦身、JSON 预算，不整份复制 live log
- 审批回执本轮立刻接受，失败可重试

`web_fetch`、AnySearch、GenUI、super-injector、dshmarket 都还在。官方 rc.8 的 `standard` 预设仍是 `fetch: false`，本机 overlay 继续打开。

---

## 升级注意 / Upgrade notes

**SQLite 会话库格式不兼容。** 官方 changelog 写明：rc.8 改善了读写和分叉，但旧库不能直接接着用。覆盖安装后，旧会话可能打不开。项目目录、`Agent Pi Outputs`、技能和知识库不受影响。需要旧聊天时，先备份 `%APPDATA%\agent-pi-dsh-desktop\dsh-home`。

覆盖安装前请完全退出（不要只关到托盘）。未签名：SmartScreen 选「仍要运行」。

The SQLite session store from rc.7 is not readable by rc.8. Back up `$DSH_HOME` if you still need those chats. Project files stay.

---

## 下载 / Download

| 平台 | 资产 | 说明 |
| --- | --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.3.0-x64.exe` | 未签名：SmartScreen 选「仍要运行」 |
| macOS arm64 | `Agent-Pi-DSH-3.3.0-mac-arm64.dmg` / `.zip` | GitHub Actions 生成 |
| Linux x64 | `Agent-Pi-DSH-3.3.0-linux-x86_64.AppImage` / `Agent-Pi-DSH-3.3.0-linux-amd64.deb` | GitHub Actions 生成 |
