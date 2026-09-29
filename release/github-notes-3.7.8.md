# Agent Pi DSH 3.7.8

<!-- agent-pi-release-meta: {"schema":1,"appVersion":"3.7.8","kernel":{"releaseTag":"dsh-v0.2.0-rc.2","commit":"639ed015397290b3745d163aafe02ffee4aa3f84"}} -->

本版固定到 [DeepSeek Harness 官方 0.2.0-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) 发行标签，继续保持官方内核源码不修改。专业工作台、任务引导与 Univer Office 插件继续作为产品插件运行。

DWG 读图现在复用已随应用安装的 MLightCAD/LibreDWG Web 解析库及清洁构建 WASM。右侧打开 DWG 或智能体调用 `cad_prepare` 时，系统自动导出带源文件哈希的 ASCII DXF 到工作区，供后续图层、几何、文字与尺寸分析；无需另装 `dwgread`。DXF 反映解析器已识别的数据，关键构件仍应与原始图纸核对。

右侧 Markdown 与文本预览读取完整文件；Office 表格预览不再静默截去后续行。Windows 安装包保留完整的 Univer Office 插件和 CAD 对应源码材料。本产品由 **Always π AI studio** 独立开发，许可为 **GPL-3.0-only**。
