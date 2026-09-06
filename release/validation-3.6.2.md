# Agent Pi DSH 3.6.2 验证记录

本记录覆盖源代码、Codex RPC、隔离桌面验证及后续同版安装器修复。各测试组可能存在交集，数量不相加；发行资产的完整性以对应批次的 Release 构建回执及 SHA256 为准。

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

- 原发布验证未执行实际安装/卸载测试。后续本机恢复验证的 `installerExecuted` 仍为 `false`。按用户选择，此次重打也不执行真实产品安装、升级或卸载；验证范围为生产 NSIS 隔离升级 fixture 和解包应用独立启动。完整 DSH/runtime 回滚尚未实现。
- 首批安装包曾错误排除完整 `dsh-univer-office`；本次重打恢复官方固定版本，原始许可材料和上游授权校验保持不变，验证范围包括实际插件服务和 Office 文件打开流程。

## 2026-09-06：恢复 Office 与思考等级

- 恢复固定的官方 Office 0.2.13 完整发行包；Windows 默认打包、portable 载荷和 macOS/Linux 构建均要求插件存在。来源 pin、上游文件清单、兼容补丁、原始 LICENSE 和平台原生依赖分别校验，误排除 Office 会使构建失败。
- Office 四组定向测试 60 通过、0 失败；日志 `.codex-temp/republish-362/office-public-contracts.log`。覆盖完整档案接受、缺失/修改/旧版本/错误来源拒绝、原生模块校验失败传递、显式关闭 Office 早期拒绝。
- Codex 默认与单次思考等级的 desktop/UI 联合测试 103 通过、0 失败，包含真实 React DOM。等级取自模型目录；切换模型会清除不兼容选择，单次模型不会继承不支持的已保存等级。
- Codex 产品桥接 6 通过、0 失败；日志 `.codex-temp/republish-362/codex-effort-bridge-tests.log`。并发请求分别携带模型和思考等级，保留官方 provider/tool 生命周期、工作目录和权限语义。
- 内置官方 CLI 0.149.1 在独立空目录下完成默认等级保存/重读/清除、模型与等级的原子更新，以及进程参数覆盖 Ultra 且不改配置文件；模型调用数为 0。证据 `.codex-temp/codex-reasoning-config-probe-result.json`。
- 用户更新系统 CLI 后，使用同一 Agent Pi 账号目录对照：旧内置 0.149.1 含隐藏条目共 8 模型，无 Astra；0.153.4 返回 9 模型，新增可见的 `gpt-6-astra`，支持 low/medium/high/xhigh/max/ultra。认证文件和配置文件 SHA 未改变，模型调用数为 0。
- 产品层独立固定 `@openai/codex` 0.153.4；登录、模型目录与实际执行统一解析产品依赖，不读取全局 PATH 或回退旧内置 CLI。官方 DSH 源码及依赖锁保持原样。目录验证不等于已执行真实 Astra 任务。
- 产品 0.153.4 的实际桌面控制器已查询到 Astra；空目录官方配置 RPC 回环通过，认证和用户配置保持不变。证据 `.codex-temp/codex-reasoning-config-01534-probe-result.json`。产品桥接 6 项回归及运行时门禁 6 项回归通过，缺失、旧版本或不能执行的产品 CLI 会被拒绝。
- 源码隔离 Office 预检通过：真实 DSH profile、Gateway、XLSX/DOCX/PPTX 导入、Viewer HTML/脚本/样式请求、生成 `.univer` 重开正常。证据 `.codex-temp/republish-362/office-source-preflight.json`。此项不等同最终安装包的 UI 渲染验证。
- 生产 NSIS 升级及 Office 门禁 fixture 共 10 项通过；返回 `0` 才继续，脚本缺失、非零退出及 `nsExec` 启动错误均拒绝并触发回滚。证据 `.codex-temp/republish-362/office-nsis-gate-regressions.log`。未执行真实产品安装器。

## 2026-09-06：普通对话与知识库范围

- 投标业务提示和执行工具只在明确绑定项目的会话及其子智能体中启用；普通对话保留原生 Standard/PTC/Cordis 的目标、计划、待办和文件工具。移除空白普通对话中的专业项目创建横条，侧栏保留显式项目入口。
- Host 业务边界、项目记忆、附件兼容回归 24 项通过；原生新建/打开/清空会话、普通与 Codex 发送以及真实 React 界面集成回归 87 项通过。知识库范围与选择本体 14 项通过，各组存在覆盖交集，不合计。
- 普通知识库搜索默认使用当前会话明确勾选的范围，空范围不搜索；索引只加载所选条目。旧 `active` 选择不再迁入新对话。草稿选择只归属由该草稿创建的新会话；串行保存和发送前等待防止延迟响应、失败或切换会话时串用选择。
- 真实官方 preset 在隔离 profile 中创建 7 个空闲智能体、0 次模型调用：普通 Standard/PTC/Cordis 无业务提示和 `tender_stage`，保留显式项目入口及原生工具；绑定父/子/孙三级均启用业务能力，同目录的另一个未绑定会话仍为普通会话。所有启用模块均处于运行状态，没有依赖等待。证据 `.codex-temp/republish-362/business-runtime-preflight.json`。

## 2026-09-06：同版安装器修复重打

用户明确授权替换 GitHub 3.6.2 Windows 安装包，并撤下其他平台资源后重新生成。原 `v3.6.2` annotated tag object 为 `02ea52b7f25c38defa1c9593582ae3ab90c685ee`，原应用提交为 `1aef6820ebc450125788158a4b2d1706115cdd10`。启动故障修复提交 `f06d6e5` 经 PR #19 合并为 `6d3435224eab9a22556527c8f563d3b6bc9cee72`；最终重打提交及资产身份见随附构建回执和对应 GitHub Actions 记录。

### 已确认的故障与修复证据

- 真实 NSIS fixture 复现 `RMDir /r` 沿旧 Office peer junction 删除共享 DSH 文件；独立 Node 清理程序保留链接目标，并覆盖嵌套、循环、顶层 junction、越界目标及删除失败场景。
- 安装器清理与生命周期回归：21 通过、0 失败、0 跳过；日志 `.codex-temp/installer-runtime-loss-regressions.log`。
- 安装后 receipt 模式与生命周期回归：30 通过、0 失败、0 跳过；日志 `.codex-temp/installed-receipt-mode-regressions.log`。`verify-installed` 允许旧版额外文件，仍拒绝当前声明文件缺失、同大小内容变化、身份不符及越界 receipt；原构建与发布 `verify` 保持严格。
- 恢复本机安装目录缺失文件后，3.6.2 真实主界面及侧栏可见，页面错误为 0，认证凭据未改变，模型调用数为 0。此步骤未执行安装器。证据：`.codex-temp/installed-362-startup-repro/installed-launch-result.json`、`installed-main-window.png`。

### CAD 复用来源

- 原 clean CAD workflow run：`34022342224`；artifact：`9985982492`（`cad-clean-release-v3.6.2`）。来源提交仍为 `1aef6820ebc450125788158a4b2d1706115cdd10`。
- 原对应源码归档 `Agent-Pi-DSH-3.6.2-CAD-corresponding-source.tar.gz` 的 SHA256：`fbc7044499a8e8f87f34cad3a0501b353a9202164fe5dda1990cb43b5d5344af`。
- 原 `CAD-CLEAN-BUILD.json` 的 SHA256：`d73a1922e3db79075681c22af0ae34bd594ba683f61cd625cd512351dfb4b620`。原完整验证记录：`.codex-temp/cad-release-362-verification.json`；runtime 位于 `.codex-temp/cad-clean-output-release-362/cad-viewer`。
- `v3.6.2` 至 `f06d6e5` 的修复未改变 CAD Viewer 源码、依赖 pin、工具链或 CAD 构建脚本。`pack-win.ps1` 的修改属于安装器打包检查；虽然该脚本也作为辅助材料存在于原 CAD 源码归档中，它不改变已复用的 CAD 二进制。保留原归档及来源，新增安装器修复由应用源码提交提供。
- 重打的 CAD 复用门禁核对实际构建输入，并校验原 runtime、对应源码和校验文件；原 CAD manifest 的来源保持不变，新安装器来源单独记录。
- 本次修正根目录第三方声明中的 Office 段，不改变 CAD 声明。兼容门禁仅允许该独立 Office 段变化；文件类型/权限、其余声明及所有 CAD 输入仍须匹配原对应源码，未提交变化仍被拒绝。

### 重打产物与验证记录

- 最终 Windows 构建提交、安装包、运行时载荷及 CAD/DSH 输入身份见 Release 随附的 `Agent-Pi-DSH-3.6.2-x64.exe.build.json`；下载文件使用同批次 `.sha256` 校验。
- 生产 NSIS 隔离升级 fixture 和解包应用独立 UI 启动的执行结果以重打验证输出为准。这些检查不计为真实产品安装、升级或卸载测试。
- macOS/Linux 的构建、打包原生模块检查及上传结果见 [build-desktop-assets Actions](https://github.com/xiangxin2021cn/agent-pi-dsh/actions/workflows/build-desktop-assets.yml) 中对应发布提交的运行。
- 最终标签来源与下载资源清单见 [v3.6.2 Release](https://github.com/xiangxin2021cn/agent-pi-dsh/releases/tag/v3.6.2)，所有重打产物通过校验后发布。本文不预先记载最终构建哈希或未执行检查的成功结果。
