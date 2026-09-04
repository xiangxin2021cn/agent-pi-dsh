# Agent Pi DSH 3.6.0 — DSH rc.1 与 DWG 预览正式版

3.6.0 在右侧文件栏增加 CAD 只读预览，并把 DeepSeek Harness 内核升级到官方 **`dsh-v0.1.2-rc.1`**（`a66e470204`）。Agent Pi 的兼容能力仍全部位于产品层，不修改官方内核源码。

## 正式发布范围

- 懒加载独立 CAD viewer，不把 MLightCAD 代码并入主对话页面 bundle。
- 构建产物固定写入 `bundles/tender-web/lib/cad-viewer`，由 `/api/agent-pi/cad-viewer/*` 静态路由提供。
- Windows 安装包和跨平台 runtime payload 都必须验证 HTML、JS、CSS、两个 worker、WASM、离线 Source Han Sans CN 回退字体与许可证归档齐全。
- Windows 构建直接以 `node npm-cli.js` 调用 npm，避开本机损坏的 `npm.cmd` shim。
- CAD 查看器会列出当前图纸缺失的字体，并允许用户导入自己有权使用的 `.shx` / `.ttf` / `.otf` / `.woff` 文件后重新渲染；常见 `hztxt.shx` 与 `gbcbig.shx` 分别按 GBK、GB2312 解码。内置 Source Han 只负责 Unicode 兜底，不冒充缺失的工程 SHX 大字体。
- 公共安装包不再预装 `dsh-univer-office` 或 Univer Pro 商业运行时；市场入口保留，并明确提示需另行取得商业许可且 rc.1 兼容性待验证。升级时只清理旧版本留下且目标已失效的产品 `link:` / `file:` 依赖，用户自行安装的 npm 版本不改动。

## DSH rc.1 适配

- 发布运行时钉定官方 `dsh-v0.1.2-rc.1`，拒绝旧 alpha.3 staging 和已移除的 SQLite 会话后端。
- 保留 rc.1 的长会话折叠与导航、模型登录配置、子智能体模型选择、ACP 控制、Inspector/Web Preview、断线重连和 Windows Python SDK 等上游能力。
- Router Standard 改用 rc.1 的 `snapshotEvents()`，并修复真实用户消息路径缺失 `bandOf` / `extractText` 导入的问题；刷新 vendor 时固定上游提交并自动重放兼容补丁。
- 附件事务继续使用官方 input/Chat projection 接口；冷启动、旧 `code` 会话迁移、模式切换以及专业工作台到主对话的事务交接均已通过真实桌面冒烟。

## 许可边界

MLightCAD viewer 与 data-model 为 MIT；`@mlightcad/libredwg-converter` 及 `@mlightcad/libredwg-web` 为 GPL-3.0。仓库所有者选择 GPL 路线，因此 Agent Pi DSH 3.6.0 的项目代码和发行物改为 `GPL-3.0-only`，并保留各第三方组件自身的许可证与版权声明。

`release/publish-v3.6.0-release.mjs` 在访问 GitHub 前要求本地/远端 exact `v3.6.0` 指向同一 main 提交、干净检出、根项目 GPL 元数据、SHA256 相符且可完整验证的 `Agent-Pi-DSH-3.6.0-CAD-corresponding-source.tar.gz` 与 clean runtime。Windows、runtime payload、macOS 与 Linux 产物均带独立 SHA256；Windows 构建回执还把安装包及其 payload 绑定到 clean CAD 清单、对应源码和 DSH 构建回执。十五项资产全部到齐、远端 digest 与校验文件一致且本地关键资产逐字节一致时，才允许发布为 Latest。

同一发布闸门还会检查 Windows 解包树和跨平台 runtime payload，拒绝包含预装 Office wrapper、Univer Pro 包路径或旧 vendor receipt 的产物。

这是面向构建与分发的技术合规措施，不构成法律意见；如需对具体分发关系作法律确认，应另行咨询适用法域的专业人士。

## 发布验收

- 预览 `.dwg`，确认缩放、平移与画布渲染正常。
- 关闭预览后确认主对话、附件事务与投标工作台不受影响。
- 断网验证：viewer 自身脚本、worker、WASM、Source Han Sans CN 回退字体与许可证均来自安装包，不请求 MLightCAD 字体 CDN。
- Windows 安装包、runtime payload、CAD 对应源码归档及各自 SHA256 必须在上传与公开发布前重新生成并核对；旧候选构件不得复用。
