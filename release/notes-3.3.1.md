# Agent Pi DSH 3.3.1 — 内核 0.1.1-rc.1，官方视觉

**3.3.1** 把钉住的 DeepSeek Harness 升到 **`dsh-v0.1.1-rc.1`**。官方目录新增 `DeepSeek-V4-Flash-Vision-Exp`。出厂卸掉第三方 `dsh-vision-router`，看图走官方视觉模型。右侧文件栏单击改回预览。产品名统一为 **Agent Pi DSH**。

---

## 内核 `0.1.0-rc.8` → `0.1.1-rc.1`

钉住上游 [`dsh-v0.1.1-rc.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.1-rc.1)（`528c682e06`）。

- DeepSeek 适配器默认目录：`deepseek-v4-flash`、`deepseek-v4-pro`、`deepseek-v4-flash-vision-exp`（`inputModalities: [text, image]`）。
- Flash / Pro 仍是纯文本；贴图只有选中 Flash Vision Exp 才会进官方 `image_url` 管道。
- `@` 引用编辑布局、Bubblewrap `/proc/.../root` 逃逸、会话表格自适应、`ask_user_question` 多行回答、子代理标题切换、近满缓存命中精度，都随内核进来。
- 本版本 changelog **没有**再声明 SQLite 格式不兼容。rc.7 → rc.8 那次仍在。

The official catalog now advertises the vision model. Text-only V4 stays text-only. No new session-store break after rc.8.

---

## 卸掉视觉插件 / Vision plugin retired

3.3.0 还留着 `dsh-vision-router`，只关 stealth。官方视觉模型已经能理解图片，再预装一套 `vision_*` 只会占体积、抢设置页。

- 出厂 profile **不再**安装、不再打包 `dsh-vision-router`
- 启动时若仍是 `agent-pi:managed-defaults`，会从 `tender` 的 dependencies / bundles 里剥掉残留
- `settings.yaml` 里的 `vision-router:` 块删掉；若旧设置写死了只有 Flash / Pro 的 models 列表，会补上 `deepseek-v4-flash-vision-exp`
- GenUI、AnySearch、`web_fetch`、super-injector、dshmarket **不动**

Pick `deepseek-v4-flash-vision-exp` to see images. The third-party vision plugin is no longer part of the factory.

---

## 文件栏单击 = 预览

右侧「资源文件」单击文件打开预览。加入对话仍用行内回形针或右键「注入对话」。文件夹路径芯片不改。

---

## 名称

窗口、侧栏、托盘、快捷方式统一为 **Agent Pi DSH**，标明这是 DeepSeek Harness 工作台。可执行文件仍是 `agent-pi-DSH.exe`。

---

## 仍必须保留的覆盖层 / Overlays kept

3.1.x / 3.2.0 针对上百个工人的历史与审批覆盖层全部迁到 `0.1.1-rc.1` 上：

- 点开某一个孩子的历史不扫全部兄弟目录
- 历史页有事件上限、字符串瘦身、JSON 预算
- 审批回执本轮立刻接受，失败可重试

`web_fetch`、AnySearch、GenUI、super-injector、知识库 MinerU 入库都还在。

---

## 升级注意 / Upgrade notes

覆盖安装前请完全退出（不要只关到托盘）。未签名：SmartScreen 选「仍要运行」。

看图请在模型选择器里选 **DeepSeek-V4-Flash-Vision-Exp**。只选 Flash / Pro 仍然看不见图片。
