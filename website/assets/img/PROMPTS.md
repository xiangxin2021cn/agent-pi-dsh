# Hero 主视觉生图 Prompt / Image Prompts

Codex 生图工具返回 403，未能生成，请用以下 prompt 自行生成。

- **V1（当前线上版本）**：文艺极光/水墨带 —— 正在使用，保留备用
- **V2（科技赋能基建）**：抽象数字孪生/蓝图线框风格 —— 见下方

## 文件命名约定

| 版本 | 暗色 | 亮色 |
| --- | --- | --- |
| V1（线上使用中） | `hero-dark.jpg` | `hero-light.jpg` |
| V2（生成后放入同目录） | `hero-dark-v2.jpg` | `hero-light-v2.jpg` |

V2 文件放到 `website/assets/img/` 后告诉我，我把 CSS 的 `--hero-img` 切到 V2（V1 文件保留，随时可切回）。建议尺寸 2560×1440 或 1920×1080，JPG 质量 85。

---

## V2 · 科技赋能基建（推荐）

### hero-dark-v2.jpg

```
A premium dark abstract hero background for an infrastructure-tech company website, "digital twin of civil engineering" aesthetic. Deep navy-black base (#06090F). A glowing wireframe blueprint of a grand bridge and city skyline rendered in luminous electric-blue (#4F8DFF) and cyan (#3AD6E8) holographic lines, floating in dark space like a HUD hologram, subtle isometric perspective rising from the lower third. Fine engineering grid and faint measurement callout lines (no readable text), small glowing data particles streaming along the bridge cables and road deck, soft depth-of-field, cinematic glow, gentle film grain. Wide 16:9 composition, large area of near-black negative space in the vertical center for headline text overlay. No text, no letters, no numbers, no logos, no watermark.
```

### hero-light-v2.jpg

```
A premium light abstract hero background for an infrastructure-tech company website, "digital blueprint" aesthetic. Airy off-white base (#F6F8FC) like clean drafting paper. A delicate wireframe blueprint of a grand bridge and city skyline drawn in fine blue (#2F6DF0) and cyan (#0FB5C9) lines, like a CAD drawing coming alive, subtle isometric perspective rising from the lower third, faint engineering grid and dimension lines (no readable text), a few soft glowing nodes and data particles along the structure, very light and minimal, generous clean white negative space in the vertical center for headline text overlay. Wide 16:9 composition. No text, no letters, no numbers, no logos, no watermark.
```

---

## V1 · 极光/水墨（当前线上版本，保留）

### hero-dark.png

```
A premium dark abstract hero background for a tech product website. Deep navy-black base (#06090F), flowing aurora-like ribbons of light in electric blue (#4F8DFF) and cyan (#3AD6E8) sweeping diagonally from upper left, subtle fine engineering grid fading into darkness, faint constellation of small mathematical nodes and thin connecting lines, cinematic soft glow, gentle film grain, minimal and elegant, wide 16:9 composition, large areas of near-black negative space in the center for text overlay, no text, no letters, no logos, no watermark.
```

### hero-light.png

```
A premium light abstract hero background for a tech product website. Airy off-white base (#F6F8FC), soft translucent ink ribbons in electric blue (#2F6DF0) and cyan (#0FB5C9) flowing diagonally from upper left like watercolor in water, subtle fine light-gray engineering grid, faint constellation of small nodes and thin connecting lines, minimal and elegant, wide 16:9 composition, large areas of clean white negative space in the center for text overlay, no text, no letters, no logos, no watermark.
```

---

## V3 · 视频 Banner（MiniMax / 海螺视频生成）

用于页首 / 页尾动图 banner。参考官方写法：主体 + 场景 + 运动，Director 系列模型可用 `[指令]` 控制运镜。
建议参数：16:9、10s（若支持）、最高画质；生成后用剪辑工具做首尾交叉淡化实现无缝循环。
文件存为 `website/assets/video/flow-banner.mp4`（≤25MB，Pages 单文件上限），告诉我即可嵌入。

### 中文版（推荐，海螺直用）

```
深蓝色数字空间中，一座宏伟的悬索桥以发光蓝图线框形态悬浮，电蓝色与青色全息光线勾勒出桥塔、主缆与桥面，背景隐约可见城市天际线线框与细密工程网格。大量细小发光数据粒子沿主缆和桥面持续流动，多条粒子流从画面左侧汇入，向右逐渐汇聚成一道越来越亮的主光流，最终汇入右端一个缓慢呼吸脉动的光核。全息线条轻微闪烁，光尘缓缓漂浮。[缓慢推近]镜头以极慢速度匀速前推，画面稳定，首尾衔接可循环。电影感，柔和景深，体积光，超高细节，深蓝黑色调，大气磅礴，无文字，无水印。
```

### English version

```
In a deep navy digital space, a grand suspension bridge floats as a glowing blueprint wireframe, its towers, main cables and deck outlined in luminous electric-blue and cyan holographic lines, with a faint wireframe city skyline and fine engineering grid behind. Countless tiny glowing data particles stream continuously along the cables and deck; multiple particle streams flow in from the left and converge rightward into one increasingly bright master stream, finally merging into a slowly breathing, pulsing core of light at the right end. Holographic lines flicker subtly, light dust drifts slowly. [Slow push in] the camera pushes forward extremely slowly and steadily, seamless loop. Cinematic, soft depth of field, volumetric light, ultra-detailed, deep navy-black palette, majestic, no text, no watermark.
```

### 嵌入方式（生成后我来改）

- 页尾 `.flow-band` 里加 `<video autoplay muted loop playsinline>` 作底层，Canvas 粒子层保留叠加在上（互补）
- 浅色模式自动 `filter` 调亮或切换浅色版视频（可再生成一条浅色版，同 prompt 把底色改 `米白图纸底色`）

---

## V2.1 · 科技赋能基建 + 工程机械（图片背景，下一代）

在 V2 蓝图大桥基础上加入塔吊、挖掘机等施工机械元素。文件存为 `hero-dark-v3.jpg` / `hero-light-v3.jpg`，放好告诉我切换。

### hero-dark-v3.jpg

```
A premium dark abstract hero background for an infrastructure-tech company website, "digital twin of a construction site" aesthetic. Deep navy-black base (#06090F). A holographic construction site rendered in glowing electric-blue (#4F8DFF) and cyan (#3AD6E8) wireframe lines: a grand suspension bridge blueprint spanning the middle ground, two tall tower cranes with lattice masts and long jibs rising on the left and right, a crawler excavator silhouette in wireframe near the bridge approach, faint city skyline wireframe in the distance, subtle isometric perspective rising from the lower third. Fine engineering grid, faint dimension callout lines (no readable text), small glowing data particles streaming along the bridge deck and crane jibs, cinematic soft glow, gentle film grain. Wide 16:9 composition, large near-black negative space in the vertical center for headline text. No text, no letters, no numbers, no logos, no watermark.
```

### hero-light-v3.jpg

```
A premium light abstract hero background for an infrastructure-tech company website, "living blueprint" aesthetic. Airy off-white drafting-paper base (#F6F8FC). A delicate construction-site blueprint drawn in fine blue (#2F6DF0) and cyan (#0FB5C9) CAD lines: a grand suspension bridge spanning the middle ground, two tall tower cranes with lattice masts on the left and right, a wireframe crawler excavator near the bridge approach, faint distant city skyline, subtle isometric perspective rising from the lower third. Faint engineering grid and dimension lines (no readable text), a few soft glowing nodes and data particles along the structures, very light and minimal, generous clean white negative space in the vertical center for headline text. Wide 16:9 composition. No text, no letters, no numbers, no logos, no watermark.
```

---

## V3.1 · 视频 Banner 第二版（两次机会：暗色 + 亮色，各一条）

画面风格、氛围与构图保持当前线上视频不变（现效果已认可），**只加两样东西**：塔吊与挖掘机的动态；并约束桥面光流位于画面下三分之一、光核在画面右缘、中央留白给标题。暗色版生成后覆盖 `website/assets/video/flow-banner.mp4`；亮色版存为 `website/assets/video/flow-banner-light.mp4`，我会接双主题自动切换。

### 暗色版（深色主题用）

```
深蓝黑色数字空间，电影级全息蓝图场景：一座宏伟的悬索桥以电蓝色与青色发光线框横跨画面下三分之一处，主缆与吊索清晰，桥面上持续流动着发光的数据粒子车流（光流严格保持在画面下方，画面的垂直中央与上半部保持深邃暗色留白，供叠加标题文字）；画面左侧一台塔吊的全息线框吊臂缓缓回转，小车沿吊臂行走，吊钩钢缆缓缓升降；右下近景一台履带挖掘机线框正在循环挖掘，大臂、小臂、铲斗协调运动；远景隐约可见城市天际线线框与细密工程网格。所有粒子流从画面左侧汇入，向右汇聚成一道越来越亮的主光流，最终汇入画面右缘一个缓慢呼吸脉动的光核（光核不要出现在画面中央）。整体亮度克制，高光不过曝。[缓慢推近]镜头以极慢速度匀速前推，运动平稳丝滑，首尾衔接可无缝循环。体积光，柔和景深，超高细节，大气磅礴，无文字，无水印。
```

### 亮色版（浅色主题用）

```
米白色图纸底色，一张活过来的工程施工蓝图：一座宏伟的悬索桥以蓝图蓝与青色细线横跨画面下三分之一处，主缆与吊索清晰，桥面上发光的数据粒子车流持续流动（光流严格保持在画面下方，画面垂直中央与上半部保持干净的浅色留白，供叠加标题文字）；画面左侧一台塔吊的线框吊臂缓缓回转，小车沿吊臂行走，吊钩钢缆缓缓升降；右下近景一台履带挖掘机线框正在循环挖掘，大臂、小臂、铲斗协调运动；远景是淡淡的城市天际线线框与细密工程网格。粒子流从画面左侧汇入，向右汇聚成一道渐亮的主光流，汇入画面右缘缓慢呼吸的光核（光核不要出现在画面中央）。[缓慢推近]镜头以极慢速度匀速前推，运动平稳丝滑，首尾衔接可无缝循环。极简，清淡，大量留白，柔和光感，超高细节，无文字，无水印。
```
