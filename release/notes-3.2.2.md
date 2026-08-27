# Agent π 3.2.2 — 卸掉 J-Space

**3.2.1** 预装了 GenUI、抓页和 AnySearch。**3.2.2** 卸掉 J-Space：它不是市场插件，出厂技能目录里也找不到「卸载」，但模型会先读它，正常 DSH 循环就被带偏。投标 / 实施 / 投资工作台、证据门禁、正式成果仍在框架里，不依赖这套协议。

**3.2.1** shipped GenUI, `web_fetch`, and AnySearch. **3.2.2** removes J-Space. It was a bundled skill, not a market plugin, so the settings list had no uninstall button. The model kept loading it first and the normal DSH loop drifted. The workbench stays; it never needed that suite.

---

## 卸掉什么 / What is removed

- 出厂技能 `skills/j-space`
- 系统提示里「复杂任务先读 j-space」那一行
- 升级后启动时清掉 `$DSH_HOME/skills/j-space` 和误装进 tender 的同名插件

对话仍走 DeepSeek Harness 本机循环。长任务用投标 / 实施 / 投资技能和原生 `subagent` / `workflow`。

---

## 下载 / Download

| 平台 | 资产 | 说明 |
| --- | --- | --- |
| Windows x64 | `Agent-Pi-DSH-3.2.2-x64.exe` | 未签名：SmartScreen 选「仍要运行」 |

覆盖安装前请完全退出（不要只关到托盘）。
