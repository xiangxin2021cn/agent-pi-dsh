# Agent Pi DSH 3.6.1 — DSH 0.1.3 与本地工程文件工作台

3.6.1 将 DeepSeek Harness 升级到官方 **`dsh-v0.1.3-alpha.1`**（`d347e70390`），同时收敛 Office 与 DWG 两条本地工程文件工作链。Agent Pi 的适配仍位于产品层启动迁移、profile overlay 和 bundle，官方 DSH 源码保持干净。

## DSH 0.1.3 适配

- 发布运行时固定到官方 tag `dsh-v0.1.3-alpha.1`，完整提交为 `d347e703908d0406b7a7ef80e3a0e594d86b2215`。
- 适配新内核的 `createDrafts(sessionId, files)`、`addAttachments`、`attachmentIds` 附件接口，同时保留旧接口分支；不再依赖旧图片 API 向新内核提交附件。
- 延续每会话附件事务、长会话折叠、模型登录、Codex 子智能体、模式迁移和专业工作台交接能力。
- 会话写入锁新增原生依赖 `fs-ext`；Windows 构建需要 MSVC/Windows SDK，其他平台显式重建并使用随包 Node 验证 `fs-ext`、`koffi`，避免安装成功但启动时缺少原生模块。
- 内核 pin 变化必须对应新的 Agent Pi 应用版本；3.6.0 资产和标签不覆盖、不复用。

### 首次打开旧会话

官方运行时按需将旧会话迁移为 v2，保留原文件。升级前请退出旧版并备份应用数据；迁移过程中不要反复重启或让两个版本同时写入同一会话。Agent Pi 不增加启动时批量迁移。

隔离副本实测：普通会话 37 个事件、大型投标会话 5,395 个事件、附件工具会话 2,567 个事件均可迁移并再次读取，10 个图片附件内容校验通过，原文件 SHA256 均未变化。大型投标案例首次迁移约 128 秒、工作集约 2.36 GB，首次打开可能明显较慢；这是本机样本，不代表所有历史插件会话都保证兼容。若迁移报错，应保留原文件并排查，不能强制回写旧格式。

## Office 工作台

- `dsh-univer-office` 更新到 0.2.13，使用 rc/0.1.3 的 `uiConversation` 服务路径，不再等待已移除的 `conversationEvents`。
- 安装与升级采用版本识别和产品所有权收据；失败恢复目前仅覆盖应用入口和 Office，不代表整个 DSH/runtime 的完整回滚。未知或不兼容版本保持未激活并给出真实状态。
- 产品管理的 Office skills 只更新自身未被用户修改的文件；用户自行安装或改写的副本不覆盖。
- Windows 安装目录必须是专属文件夹；卸载核验安装收据与目录归属，Office 解绑或 DSH 链接清理失败时中止并保留程序，避免删除后留下失效配置。
- 默认关闭 Univer 遥测。包含 Univer Pro 运行时的预装构建仍需明确启用许可构建参数并满足相应商业许可；公共构建继续 fail-closed，不把商业运行时误装进公开资产。

## Windows 安装修复（2026-09-05）

- 修正目录属性调用及空目录、新建目录判断，原安装目录可继续使用，无需迁移或先卸载。
- 移除归档时的全局类型声明/source map 裁剪，避免删掉 Office 运行时校验清单中的 840 个文件。
- 许可预装包在归档后定向抽取实际 payload，并使用包内 Node 和验证脚本校验 Office；失败时不继续生成安装器。
- 安装器先释放随包载荷，再暂存旧程序；Office 暂存失败时尝试恢复应用入口。错误提示不再声称已经恢复整个应用。
- 本次本地修复包的包内校验与安装器编译通过；按用户要求未执行实际安装/卸载测试。完整运行时回滚仍未实现。

## DWG 完整预览与性能

- 查看器、LibreDWG worker/WASM、MText worker 和 Source Han Sans CN 回退字体全部随包本地加载，不依赖外部 CDN。
- 使用完整审阅工具栏、布局和缺失资源状态、用户字体导入，以及大图纸自适应超时。默认保持全图取景；仅当用户点击“主体取景”且图纸范围满足保守检查时放大主体，远端实体仍保留，可用 Zoom Extents 恢复全图。
- 实图 A/B 后固定 `progressiveRendering: false` 与 `minimumChunkSize: 1000`：在当前 MLightCAD/LibreDWG 路径中，progressive 模式没有提前显示实体，HTML preload 还会重复请求 WASM 和字体。
- DWG 首次打开的主要耗时来自本地 WASM 解析与实体构建；网络断开不会阻止查看器载入自带组件。

## 许可与不可变发布

项目代码和公开发行物继续按 `GPL-3.0-only` 发布，以满足随包分发 LibreDWG 组件的对应源码义务；其他第三方组件保留各自原始许可证与版权声明。

`release/publish-v3.6.1-release.mjs` 在访问 GitHub 前要求本地与远端 exact `v3.6.1` 指向同一 main 提交、检出完全干净、GPL 元数据正确，并验证：

- Windows 安装包、runtime payload 及各自 SHA256；
- `Agent-Pi-DSH-3.6.1-CAD-corresponding-source.tar.gz` 及其 SHA256；
- Windows 构建回执对安装包、payload、clean CAD、对应源码和 DSH 构建回执的绑定；
- macOS 与 Linux 资产及各自 SHA256；
- 远端资产数量、名称、大小与 GitHub digest 全部精确一致。

十五项正式资产全部到齐且通过校验后，draft 才能公开为 Latest。发布命令不使用 `--clobber`；发现错误必须提升版本重新发布。

## 发布验收

- 冷启动确认没有 `conversationEvents` 等待或 Office 插件 pending。
- 打开 Word、Excel、PowerPoint 兼容文件，确认 Office 工作台激活和会话投递正常。
- 打开包含中文、SHX/BigFont、远端离群实体的大型 DWG，确认初始取景、缩放、平移、图层和字体导入正常。
- 断网确认 CAD viewer 的脚本、worker、WASM 和回退字体只从安装包加载。
- 确认主对话、附件事务、投标控制面板和右侧文件栏在关闭预览后继续工作。
