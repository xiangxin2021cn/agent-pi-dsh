# Agent π 3.2.1 — 预装 GenUI、抓页、AnySearch

3.2.0 把内核钉在 `0.1.0-rc.7`。**3.2.1** 把现场已验证有用的扩展打进出厂包：回复里的交互 UI、本机抓页、网络搜索；并修好社区市场「放行」仍装不上 git 插件。

3.2.0 pinned the kernel. **3.2.1** ships GenUI, `web_fetch`, and AnySearch offline, and writes the real pnpm `allowBuilds` keys before a GitHub plugin install.

---

## 出厂就有 / Ships in the installer

| 扩展 | 作用 |
| --- | --- |
| **dsh-genui 0.8.7** | 助手回复里渲染 `dsh-ui` 交互界面（卡片、表、图、表单、mermaid、3D） |
| **web_fetch** | 模型用工具取回页面/图片 URL，再写成 `![](https://…)` 即可出图 |
| **AnySearch 0.1.1** | 搜索提供方改为 `anysearch`；匿名额度可用，密钥写 `$DSH_HOME/.credentials.yaml` 的 `ANYSEARCH_API_KEY` |

`web-fetch-http` **不会**出现在插件市场的「已安装」依赖里——它没有 `dsh` 元数据，overlay `insert` 才是正确加载方式。市场若写「校验失败」，是误报。

对话或注入器后来装的、声明了 `dsh.bundle` 的插件，重启后仍会留在 tender 的 bundles 里，不会被启动脚本冲掉。

---

## 不是应用拦了外网 / The app did not block the network

Windows 文件沙箱（Workspace Write）不限制 network。装不上 `dsh-genui` 是因为 pnpm ≥10 默认禁止 git 包的 `prepare`，而市场用目录名 `dsh-genui` 写 `allowBuilds`，pnpm 要的是包名 `@omdsh-dev/dsh-genui@git+https://github.com/omdsh-dev/dsh-genui.git`。点「确认」不会先放行；点「放行」也写错了键。

本版在安装前预写全部候选键，并把已构建的 GenUI / AnySearch 预装成 `link:`，不再走 github prepare。

---

## 不用接 Chrome CDP / No Chrome DevTools

模型去找 Chrome CDP，是因为出厂 `tool-web.fetch: false`，且没挂 HTTP fetch 提供方。打开 `web_fetch` 后，模型用工具取回页面/图片即可。不会去接管你的 Chrome。

GenUI 让助手在回复里画交互界面。它**不会**自动变回 2.x 的扇形叠图工作台。

---

## 下载 / Download

| 平台 | 资产 | 说明 |
| --- | --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.2.1-x64.exe` | 未签名：SmartScreen 选「仍要运行」 |

覆盖安装前请完全退出（不要只关到托盘）。新会话才会带上 GenUI、`web_fetch` 与 AnySearch。
