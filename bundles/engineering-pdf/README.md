# 工程 PDF 图纸插件

独立工具 `engineering_pdf`，用于大幅图纸页清点、坐标文字抽取、局部高清渲染和带重叠的分块核查。只增加本 bundle，不修改 `tender-host` 原有的摘要渲染路径。

## 操作

```json
{"action":"inventory","path":"drawings/structure.pdf","startPage":1,"limit":50}
```

返回原文件 SHA-256、页数、PDF viewBox、`rotation`、`UserUnit`、旋转后的视口尺寸和坐标变换。分页读取 `nextPage`，不把只清点的部分页面称作全图已分析。

```json
{"action":"text","path":"drawings/structure.pdf","page":2,"offset":0,"limit":1000}
```

返回原始文本矩阵、字号尺度、原 PDF 宽高、旋转后左上角坐标和文本推进范围估计。`nextOffset` 用于继续；文字范围不是精确字形边界，竖排/复杂字体应结合图像核对。无文字可能是扫描、矢量轮廓或空白，结果明确标记待视觉核查，不假定空图。

```json
{"action":"render","path":"drawings/structure.pdf","page":2,"dpi":288,"roi":{"x":0.2,"y":0.25,"width":0.4,"height":0.4}}
```

`roi` 是**旋转后整个页面**的左上角归一化 `[0,1]` 矩形；超界直接报错。直接以指定分辨率绘制原 PDF 的区域，不放大摘要位图。返回真实绝对 `imagePath` 供原生 `read_image` 使用，以及像素尺寸、PDF 到图像的矩阵、源版本和参数指纹。

```json
{"action":"tiles","path":"drawings/structure.pdf","page":2,"dpi":288,"tilePixels":2048,"overlapPixels":128,"offset":0,"limit":32}
```

生成覆盖页面右/下边界的重叠分块计划；按返回的 ROI 调用 `render`。计划、已渲染和专业理解是不同状态。分块不会自动调用视觉模型，也不会自动识别钢筋。

```json
{"action":"coverage","path":"drawings/structure.pdf","startPage":1,"limit":50}
```

按来源 SHA 独立汇总目录清点、文本分页范围和已渲染 ROI；所有专业复核保持 `pending`。扫描页记录为 `no-text-visual-review`。页读取本身从不授予专业复核、设计确认或加工批准。

## 主任务联动

工具成功操作后调用可选的共享 `engineering.recordObservation(sessionId, observation)`，提交来源、完整页清单、本次实际观察页、处理摘要和 ROI/文本/渲染记录。宿主负责写入统一工程来源、覆盖项、变更失效和任务发现。缓存目录中的 receipt 只是文件处理凭据，不是另一套专业复核状态。

返回的 `engineeringSync.status` 明确区分 `synced`、`unavailable` 与 `failed`，成功时保留共享账本返回的 `sourceId` 和 `revision`，供后续工程计算建立来源依赖。账本不可用或同步失败时仍返回实际读取结果，但不会声称已同步任务。完整目录依据 PDF 实际 `numPages` 建立，不依据成功提取的内容生成。

## 坐标、依赖及预算

- PDF 坐标单位为 `1/72 inch × UserUnit`；视口尺寸以物理排版点 `pt` 表示，已应用 CropBox、旋转和 UserUnit。它们都不是工程真实尺寸；没有已知尺寸标定时禁止由像素直接算实物量。插件没有提供无标定测量函数。
- 从现有 `tender-host/package.json` 相对解析已包装的 `pdfjs-dist` 与 `@napi-rs/canvas`，没有安装或下载运行时。Node 的 CMap/标准字体/WASM 数据目录使用本机路径；字形按轮廓绘制，避免环境字体替换导致细字缺失。缺失运行时直接报告。
- 会话 `exec.agent.session.header.cwd` 是路径权限根，模型参数不能覆盖。读取使用 `realpath` 校验；拒绝目录外链接；输出固定写该工作目录的 `.agent-pi/engineering-pdf/<source-sha>/`，缓存目录不能是链接。
- 每文件最大 64 MiB、5000 页；目录/覆盖每次最多 50 页；文本每次最多 2000 项和 200000 字符，单页最多 102000 文本项；分块最多 4096 块；输出最多 1600 万像素、8192 单边、600 DPI。预算超限会报错，不静默缩图或删图。
- PDF 渲染器需要解码原始内嵌图像；输出像素预算不等于内嵌图像解码内存上限。没有通过限制 `maxImageSize` 静默丢弃大扫描图；复杂或超大扫描件应按项目拆卷、分批核查。
- 每个插件实例最多缓存 2 个加载的 PDF，以文件 size/mtimeNs/ctimeNs/ino 和源 SHA 识别版本；单实例串行读取。输出按源 SHA、渲染器版本及参数 SHA 缓存。PNG 命中缓存前核验内容 SHA。源文件变更自动产生独立处理记录。
- 接收原生 AbortSignal、45 秒操作预算及插件卸载取消。文件读取、页循环、文字流和渲染任务设取消检查；底层解析器的同步段不保证即时中断。

## 验证

```powershell
node --test bundles/engineering-pdf/tests/pdf.test.ts
```

使用 `pdf-lib` 生成 3pt 细字、0.35pt 细线、旋转 90° + UserUnit 2 + 非零 CropBox、扫描图页。测试用真实 canvas 读取 PNG，断言字形与线条像素、矩形坐标、高清 ROI 尺寸、来源变更隔离、分块边界、分页及共享账本同步。PDF 测试夹具不是工程项目样本。
