# 3.6.4 验证范围

内核固定为官方 DSH `dd393c18202b25f9734d51cb61aac8fa8b2c5ecf`，版本 `0.1.5-alpha.2`。官方子模块保持干净，产品功能通过 bundle 和既有扩展接口实现。

## 源码验证

- 172 项针对性回归通过：专业深度状态、用户显式启用、并发修订冲突、真实文件检查、Univer 格式、PTC 外层复核、普通对话业务隔离、Codex 模型与思考等级、附件投递、Office、CAD 源码兼容、内核版本及发布门禁。
- 隔离 DSH + 本地脚本模型实际执行：研判任务、原生写文件、验收检查、`present` 交付、修改用途后定向更新、关闭专业深度。没有在线模型调用，没有读取用户账号凭证。
- 实际 Chrome 界面：启用专业深度、编辑说明并继续、刷新恢复、关闭；运行期间隐藏推理，切换执行详情；任务结束后错误仍可见。
- 官方 `dsh-univer-office` 0.2.13：Word、Excel、PPT 实际导入和画布展示，直接重开 `.univer`；新版 DSH 原生交付卡片接入 Office/CAD 预览。
- 普通对话默认不加载知识库，显式选择后仅保留在本对话，新对话不继承；投标模块仍按显式项目绑定启用。

检查命令使用 DSH 工作区配套的 `tsx` 加载器，例如：

```powershell
node --import ./vendor/deepseek-harness/node_modules/tsx/dist/loader.mjs --test bundles/tender-host/tests/professional-depth.test.ts bundles/tender-web/tests/task-process.test.mjs
```

## 验证边界

自动文件检查证明文件存在、支持格式标识、指定内容或 JSON 条件，并记录当时的 SHA256。它不证明计算、专业适用性或视觉版式已通过审阅；这些要求单列为专业审阅项。

隔离运行使用独立工作区、DSH 配置及端口，不运行用户安装包或卸载程序。源码浏览器验证不能替代最终安装包验证；发行安装包的来源、内核及文件摘要由同一 Release 的 `.build.json`、`.sha256` 和构建门禁另行记录。在线模型生成质量与所有第三方授权状态不属于本地脚本测试结论。
