# Agent Pi DSH 3.6.2 验证记录

本记录覆盖源代码、Codex RPC 与隔离桌面验证。各测试组可能存在交集，数量不相加；发行资产的完整性以 Release 构建回执及 SHA256 为准。

## 内核与构建

- DSH 继续固定为官方 `dsh-v0.1.3-alpha.1`，提交 `d347e703908d0406b7a7ef80e3a0e594d86b2215`。
- 用户引用的 `6a82a3b3e23cfd0d092ce2fb0331742a89dd18e9` 是该 pin 的祖先。两者差异仅为 `apps/web/tests/expected/clickable-links-gallery/ui.expected.md` 测试快照，生产源码一致，因此未调整 pin。
- 当前 pin 的官方 `build:lib`、`build:web` 和 DSH 构建回执验证成功。日志：`.codex-temp/dsh-build-362.log`。
- Codex 单次模型适配位于产品 bundle，未修改官方 DSH 源码。

## 已完成的定向回归

| 测试组 | 结果 | 覆盖内容 |
| --- | --- | --- |
| UI / 附件契约 | 76 通过，0 失败 | 设置与主对话模型选择、原生附件空文本提交、异步准备期间附件增删/替换和失败恢复；日志 `.codex-temp/codex-ui-tests-362.log` |
| Desktop / 版本 / 内核策略 | 41 通过，0 失败 | 目录分页、默认模型保存/清除、失效与刷新、注销、取消及 3.6.2 版本契约 |
| Codex 产品桥接 | 4 通过，0 失败 | 真实官方 provider/tool/run/wire 配合内存模拟 app-server，捕获并发不同 `thread/start.model`、默认省略、后台释放、前台取消、空白模型拒绝 |
| Profile / Overlay | 16 通过，0 失败 | 产品 provider/tool 接线、幂等初始化、官方 preset 不变、用户配置保留 |

桥接测试使用同 pin 的已构建官方 DSH 模块；未启动真实 Codex 模型任务。单次显式模型通过 `AsyncLocalStorage` 隔离，未写入默认模型配置；权限继续使用官方 `approve-for-me` 与 `workspace-write`。

## 真实 Codex RPC

- 专用账号目录只读查询获得 6 个可用模型；认证文件未变化（`authUnchanged: true`），模型调用数为 0。证据：`.codex-temp/codex-account-probe-result.json`。
- 独立空认证 home 完成默认模型写入、重启读取和清除，保留无关配置行；模型调用数为 0。证据：`.codex-temp/codex-config-probe-result.json`。

## 隔离桌面实测

- Electron 冷启动与原生 TXT/PNG 上传、图片解码通过；主对话只有一个原生附件按钮和文件 input，文件夹及右侧文件管理入口保留，页面错误为 0。
- 真实加载的 `codex` provider 和 `standard`、`ptc`、`cordis`、`router-standard` 四种预设均确认 `subagent_codex` 暴露可选 `model: string` 参数。
- 单次模型选择与设置页保存使用隔离 IPC 数据验证；真实 Codex RPC 由上述独立检查覆盖。未发送收费模型任务。
- 报告与截图：`output/playwright/native-codex-362/smoke-result.json`、`runtime-schema.json`、`01-native-attachments.png`、`02-codex-single-turn-model-fixture.png`、`03-codex-default-model-fixture.png`。

## 验证边界

- 本次未执行实际安装/卸载测试。完整 DSH/runtime 回滚尚未实现。
- 公开安装包不预装 `dsh-univer-office` 及 Univer Pro 商业运行时。
