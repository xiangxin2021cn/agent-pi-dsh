# Agent Pi DSH 3.3.4 — 解析必须摸到实际 BOQ，组价按企业工效与人工复核走

**3.3.4** 把上一轮现场卡死和组价用错清单收进同一版。招标文件解析必须从已登记的工程量清单抽出真实行；没有清单不得进组价。同一版撤回产品并发帽、摊开组价 schema、恢复当地询价，企业工效最高优先，预览改价确认后全局重算。内核仍钉 **`dsh-v0.1.1-rc.2`**。

## 先测

1. 没有 BOQ 表的项目：深度稿写齐也不能 `complete_stage`。
2. 抽出至少 3 条真实行并在《工程量清单分析.md》点名清单号，解析关才能过。`force_pass` 不能放行。
3. 创建时附企业工效表；章节稿改日产/关键价保存应弹出全局调整确认。
4. `$DSH_HOME/settings.yaml` 不应再被压成 `maxParallelToolCalls: 4`。

## 下载

| 平台 | 文件 |
| --- | --- |
| Windows x64 | [Agent-Pi-DSH-3.3.4-x64.exe](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-x64.exe) · SHA256 `f10d7643ea0a0bf22deef0807323990790199a284ae7d4930e987b46615133bb` |
| macOS Apple Silicon | [dmg](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-mac-arm64.dmg) · [zip](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-mac-arm64.zip)（CI 回传） |
| Linux x64 | [AppImage](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-linux-x86_64.AppImage) · [deb](https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-linux-amd64.deb)（CI 回传） |

国内镜像（Windows）：[gh-proxy.com](https://gh-proxy.com/https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-x64.exe) · [ghfast.top](https://ghfast.top/https://github.com/xiangxin2021cn/agent-pi/releases/download/v3.3.4/Agent-Pi-DSH-3.3.4-x64.exe)

完整说明见仓库 [notes-3.3.4.md](https://github.com/xiangxin2021cn/agent-pi/blob/main/release/notes-3.3.4.md)。
