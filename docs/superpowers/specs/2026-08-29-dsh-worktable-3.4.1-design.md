# Agent Pi DSH 3.4.1 专业工作台深度改造设计

状态：待用户批准后实施  
目标版本：3.4.1  
底座：DSH 0.1.2-alpha.1  
约束：不修改 DSH 内核；现有投标编排、知识库、证据门禁、能力包和正式产物仍是唯一业务权威。

## 1. 结论

`dsh-worktable` 可以显著提升 Agent Pi DSH 的专业工作台体验，但不应直接安装后与现有投标工作台并列运行，也不应让它接管项目、阶段或产物状态。

推荐方案是：

1. 以 MIT 许可的 `dsh-worktable` 为交互壳和布局引擎参考，保留其许可证与版权声明。
2. 在 Agent Pi 仓库内建立受控的 `tender-worktable` 派生包，复用控制室、多窗格、标签、拖拽尺寸和会话联动思路。
3. 删除上游通用项目状态和任意文件/终端能力，改接 Agent Pi 现有 `/api/agent-pi/*`、`.agent-pi` 状态和阶段控制面。
4. `localStorage` 只保存 UI 布局；业务阶段、知识、证据、能力包、执行状态和正式产物继续由 Agent Pi host 持久化。
5. 所有会产生业务变更的按钮均进入 Agent Pi 的显式事务/阶段动作，不允许 UI 直接改 JSON、直接写最终产物或绕过门禁。

这属于“换专业驾驶舱，不换发动机和行车电脑”。

## 2. 已核对的交互目标

### 2.1 视频 1:02–1:26

参考视频：<https://www.toutiao.com/video/7679121872046408233/>

该段展示的核心链路是：

1. 左侧工作台/项目入口。
2. 大面积项目进度总览。
3. 当前阶段、任务量、文件量等指标。
4. 动态分析和甘特式时间线。
5. 数据总览、项目目录和实时导出结果。

这与投标项目天然对应：项目入口 → 阶段控制室 → 任务/门禁时间线 → 证据与能力包健康度 → 正式成果中心。

### 2.2 用户截图

四张截图可归纳为三种专业工作面：

- 应用抽屉：控制室、专业模块和项目入口。
- 控制室：项目卡片、运行/空闲/待决定状态和最近执行摘要。
- 项目驾驶舱：左侧资料/目录，中央阶段和甘特视图，右侧主对话或成果预览。

3.4.1 不应复制通用“旅行/建筑/健身”项目，而应把入口固定为 Agent Pi 的业务模块和投标项目。

## 3. 三种接入方案

| 方案 | 做法 | 优点 | 主要问题 | 结论 |
| --- | --- | --- | --- | --- |
| A. 只参考视觉 | 保留现有 Workbench，只模仿卡片和深色网格 | 变更最小 | 不能获得多窗格和专业工作面 | 可作降级方案 |
| B. 派生工作台壳 + Agent Pi 适配器 | 在本库维护受控派生包；只复用布局/控制室；全部业务数据接 Agent Pi | 能达到截图效果；状态统一；可测试、可发布 | 需要拆分上游大文件并补安全边界 | **推荐** |
| C. 直接把上游插件与现有工作台并装 | Agent Pi 仅注册一个项目卡片 | 演示最快 | 双入口、双状态、任意路径接口、DOM 锚定脆弱、上游升级不可控 | 不用于正式版 |

## 4. 为什么不能直接把上游插件作为业务内核

### 4.1 文件和命令权限过宽

上游 host 当前存在以下行为：

- `serverCwd()` 接受客户端传入的任意 `cwd`，会话不存在时还会退回 `process.cwd()`。
- `/api/worktable/file` 对请求中的绝对路径直接 `resolve()` 后读取。
- `/api/worktable/fs` 可列出请求中的任意路径。
- `/api/worktable/write` 可向请求中的任意路径写文本。
- `/api/worktable/mkdir` 可在任意已存在父目录下创建目录。
- `/api/worktable/git` 在客户端指定的任意 `cwd` 执行 Git。
- `/api/worktable/term` 在客户端指定的 `cwd` 启动 PowerShell/bash，并继承整个 `process.env`。

这些能力适合本地开发工具，不适合默认装入投标生产工作台。3.4.1 必须改成“能力代理”：路径绑定到当前 Agent Pi 工作区和项目，动作按类型授权，终端默认关闭。

### 4.2 上游状态不具备业务权威性

上游把项目、绑定、视图、文件夹和挂载指纹放在 `dsh.worktable.*` 的 `localStorage` 中，并依赖项目目录中的 `widget-result.json` 自动挂载成果。

这会产生三个问题：

1. 清理浏览器数据会丢失项目关系。
2. 任意智能体写一个 `widget-result.json` 就可能改变展示结果。
3. UI 显示“已完成”不等于通过 Agent Pi 的阶段任务、总报告、证据、能力包、BOQ 和引用门禁。

因此 `widget-result.json` 不能成为 Agent Pi 正式产物协议。正式成果必须来自 `workbenchSnapshot()` 返回的 `outputs` 或新增的受校验 artifact manifest。

### 4.3 DOM 锚定方式对 DSH 升级敏感

上游分栏通过查询 `[data-phase]`、修改会话视图区 margin、body 级 `MutationObserver` 和 `ResizeObserver` 重新锚定。它虽然注册到了官方 `shell.overlay`，但布局仍依赖宿主内部 DOM 形状。

DSH 0.1.2-alpha.1 已明确提供 `shell.overlay` 和布局服务。3.4.1 应直接以 slot/overlay 合同作为边界，不再猜测 `root.children[0/1]`，也不全局观察 `document.body`。

### 4.4 当前客户端体量不适合继续叠加业务

上游主要文件约为：

- `client/index.tsx`：约 3000 行。
- `client/split.tsx`：约 2000 行。
- `client/styles.ts`：约 480 行。

现有 Agent Pi 的 `tender-web/lib/client.js` 也已超过一万行。若把两者直接拼接，后续阶段门禁、知识库、Office、Codex 和多智能体状态会很难维护。

3.4.1 必须按 provider、pane、action、store 拆分，并对重型面板懒加载。

## 5. Agent Pi 已有的正确业务底座

3.4.1 不需要重写投标逻辑，现有底座已经覆盖：

- `workbenchSnapshot(cwd, module)`：模块、项目、工作流、阶段、知识状态和检查时间的统一快照。
- `projectSnapshot()`：当前阶段、全部阶段、证据、引用审计、正式输出和原稿恢复记录。
- `prepareStage()`：前序阶段、资料齐套、证据门禁、知识选择和任务列表。
- `completeStage()`：未完任务、阶段总报告、能力包、施工策划成果、分析套件、BOQ、测算表和本地情报硬门禁。
- `/api/agent-pi/stage`：prepare/check/complete/resume/force_pass/reset/organize/mark_dispatched 等统一动作入口。
- 每会话 Codex 事务控制器：`idle → armed → preparing → submitting → idle/disposed`，包含准备、提交、成功、失败和会话销毁。
- `business-core`：版本化 schema、能力依赖、readiness、审计问题和回归夹具。
- `.agent-pi` 工作区状态：不依赖浏览器缓存，可审计、可迁移、可恢复。

这部分继续作为唯一控制面。工作台只做投影和受控命令入口。

## 6. 推荐架构

```text
DSH 0.1.2-alpha.1 slots / session contracts
                |
                v
Agent Pi Tender Worktable Shell
  |-- App Drawer / Control Room
  |-- Project Dashboard
  |-- Stage Board + Timeline
  |-- Knowledge & Evidence Health
  |-- Capability Graph
  |-- Official Outputs / Office Preview
  `-- Parent Conversation
                |
                v
AgentPiWorkbenchProvider
  |-- GET /api/agent-pi/workbench
  |-- POST /api/agent-pi/stage
  |-- /api/agent-pi/files, kb, citations, modules
  `-- DSH session projections + per-session transactions
                |
                v
tender-host + business-core + .agent-pi durable state
```

### 6.1 包边界

建议新增：

- `bundles/tender-worktable/host`：只提供工作台需要的受控事件和能力代理；能复用 `tender-host` 的接口就不重复实现。
- `bundles/tender-worktable/client`：布局壳、控制室、项目工作面和 pane registry。
- `packages/workbench-contracts`：只放前后端共享的版本化 DTO 和 action schema。

上游源码只复制真正需要的布局/控制室部分，保留 MIT 许可证和第三方声明。不要把整个仓库作为运行时 junction，也不要依赖 `window.__dshWorktable` 这类非公开全局变量。

### 6.2 状态所有权

| 状态 | 唯一所有者 | 是否可放 localStorage |
| --- | --- | --- |
| 项目、模块、当前阶段 | Agent Pi host / `.agent-pi` | 否 |
| 阶段任务、门禁、强制放行 | orchestration + business-core | 否 |
| 知识选择、证据、引用、能力包 | Agent Pi host | 否 |
| 正式成果和导出清单 | Official Outputs + host manifest | 否 |
| 主/子会话执行状态 | DSH session projection，只读镜像 | 否 |
| Codex 单轮事务 | 每会话事务控制器 | 否 |
| 窗格宽高、标签顺序、最近打开面板 | Worktable UI | 是，必须带 schemaVersion 和迁移 |
| 临时筛选、展开状态 | React 内存 | 不需要 |

### 6.3 命令流

所有按钮遵循同一条链：

1. UI 发出类型化 intent，例如 `stage.resume`、`stage.complete`、`output.open`。
2. provider 验证当前 workspace/project/session 绑定和 UI 快照 revision。
3. host 重新读取磁盘权威状态，不能信任 UI 传回的阶段状态。
4. 业务动作进入现有 `/api/agent-pi/stage` 或文件 API。
5. 成功后返回新 revision/快照；失败返回可展示的门禁原因。
6. UI 只用返回值更新，不做乐观写入业务状态。

“继续推进”仍走现有 resume/prepare + 主对话 dispatch；“完成阶段”仍走 `completeStage()`；工作台不得直接把阶段标成 done。

## 7. 3.4.1 专业工作面

### 7.1 控制室

每个项目卡片显示：

- 项目名、模块、当前阶段。
- 主对话/子智能体运行状态。
- 阶段完成比例和未完任务数。
- 证据门禁、能力包、引用审计的最严重状态。
- 最近产出时间和需要用户处理的事项。

卡片状态必须由 Agent Pi 快照计算，不能仅按“会话 busy/done”判断。

### 7.2 项目驾驶舱

推荐默认拓扑：

- 左侧 260–320px：阶段导航、资料树、知识包。
- 中央主区：阶段看板/当前任务/门禁详情。
- 中央下部或可切标签：甘特/动态时间线、能力依赖图。
- 右侧 34%：主对话，继续使用 DSH 会话运行时。
- 右侧抽屉：正式成果、Office/Markdown/PDF 预览和导出。

### 7.3 甘特和动态分析

第一版不虚构“计划日期”。时间线数据分三层：

- 工作流顺序：阶段依赖和前序门禁。
- 实际事件：prepared/dispatched/running/completed/failed 时间。
- 交付健康：任务、产物、证据和审计状态。

只有项目确有计划日期时才展示日历型甘特；否则展示阶段流水线和实际运行时长，避免伪精确。

### 7.4 成果中心

成果中心只读取 `listOfficialOutputs()` 和受校验的项目相对路径：

- Markdown、PDF、DOCX、XLSX、HTML 分类。
- 阶段、生成时间、大小、引用审计状态。
- Office/Univer 预览继续复用现有 Agent Pi 能力。
- “导出”调用现有 export API；不接受任意外部 URL 作为正式成果。

## 8. 安全设计

### 8.1 路径

- 请求中不再接受任意绝对 `cwd` 作为信任根；workspaceId/sessionId 在 host 侧解析实际根目录。
- 对现有目标执行 `resolve + realpath`，验证规范路径位于授权根内，防止 `..` 和目录联接/符号链接逃逸。
- 新文件先验证父目录的真实路径，再创建；创建后复核目标。
- 正式成果写入只允许 Agent Pi 定义的输出目录或类型化保存动作。

### 8.2 终端和 Git

- 3.4.1 默认不提供通用终端窗。
- 如以后启用，只能由用户在项目级显式开启，cwd 固定为授权工作区，环境变量使用 allowlist，进程随窗格和会话销毁。
- Git 仅对已验证仓库根执行固定只读命令；不得接受任意 cwd/参数。

### 8.3 iframe/HTML

- 本地 HTML 预览必须在受限 iframe 中运行，设置 sandbox/CSP。
- 外部 URL 只能作为普通浏览面板，不能标记为 Agent Pi 正式成果。
- 禁止把 agent 生成的 HTML 直接注入宿主 DOM。

## 9. 前端结构与性能

建议组件边界：

- `WorkbenchShell`
- `ControlRoom`
- `ProjectNavigator`
- `StageBoard`
- `TimelinePane`
- `KnowledgeEvidencePane`
- `CapabilityGraphPane`
- `OutputCenter`
- `ConversationPane`

状态层：

- `WorkbenchProvider` 负责网络和 revision。
- DSH session、工作台 UI store 使用 `useSyncExternalStore` 适配，避免手工 tick 和全组件重渲染。
- Office、甘特、图谱和终端类重面板用动态导入；未打开时不加载。
- 控制室运行时长可按分钟更新；不需要每秒让全部卡片重渲染。
- 不使用 body 级 MutationObserver；overlay 坐标由 DSH slot/layout 合同提供。
- UI localStorage 加 `schemaVersion`、迁移和损坏回退；禁止存业务快照。

数据刷新：

- 首次打开拉一次 workbench snapshot。
- 阶段动作完成后立即失效并刷新。
- DSH session 事件只刷新受影响项目。
- 页面可见且正在执行时保留低频兜底刷新；隐藏时停止。
- 刷新不调用模型，不产生 Token。

## 10. 与现有工作台的迁移

1. 先保留当前 `Workbench` 作为 3.4.1 的回退视图。
2. 新壳通过 feature flag 只读接入同一 `workbenchSnapshot()`。
3. 对比新旧界面的项目、阶段、门禁、输出数量完全一致后，再把入口切到新壳。
4. 旧工作台不再注册第二个全屏 overlay，但保留可诊断的“经典视图”开关一个小版本。
5. 用户单独安装的原版 `dsh-worktable` 应提示冲突，不能同时占用相同工作面。

现有业务数据无需迁移；只迁移少量 UI 偏好。上游 `dsh.worktable.projects.v1` 不导入为 Agent Pi 项目。

## 11. 实施阶段

### Phase 0：合同与安全基线

- 建立 workbench DTO/action schema。
- 为路径逃逸、符号链接/目录联接、任意 cwd、未授权写入和终端默认关闭写失败测试。
- 固定 MIT NOTICE。

验收：没有任何工作台请求能越出当前授权工作区；关闭新壳时现有投标流程完全不变。

### Phase 1：只读壳和控制室

- 复用/重写分栏布局最小核心。
- 接入 `workbenchSnapshot()`、session projection 和现有成果预览。
- 实现截图中的控制室和项目入口。

验收：项目、当前阶段、任务、门禁、输出与经典工作台逐项一致；不提供业务写按钮。

### Phase 2：专业工作面

- 阶段看板、时间线、知识/证据健康、能力图、成果中心。
- Office/Markdown/PDF 预览懒加载。

验收：一屏可回答“在哪个阶段、谁在执行、卡在哪里、证据是否够、输出在哪里”。

### Phase 3：受控动作

- 接入 resume/check/complete/reset/organize/force_pass。
- 所有写动作进入显式事务；提交、失败、会话销毁都收口。
- Codex 指派仍使用现有每会话控制器。

验收：双击、重复提交、切会话、销毁会话、网络失败均不产生重复阶段稿或错误 done 状态。

### Phase 4：性能与发布

- Windows 安装包集成、冷启动、懒加载、长任务和 24 小时稳定性。
- 深色/浅色、125%/150% 缩放和常见窗口尺寸。
- 检查原版插件并装冲突、经典视图回退和禁用新壳。

## 12. 3.4.1 验收红线

1. 不修改 DSH 内核。
2. 新壳禁用后，现有投标流程和数据无变化。
3. UI localStorage 清空后，项目、阶段、知识、证据和成果不丢失。
4. 任何业务状态都不能通过改浏览器缓存或 `widget-result.json` 伪造。
5. 不能读取/写入授权工作区外的路径，包含目录联接和符号链接场景。
6. 通用终端默认不打包或不启用。
7. 阶段完成仍经过全部 Agent Pi 门禁。
8. 每会话事务在准备、提交、成功、失败和销毁路径均有自动测试。
9. 新旧工作台对同一项目快照的关键计数完全一致。
10. 3.4.0 已修复的启动路径不能回归；Windows 冷启动目标保持在 30 秒内。
11. 控制室首屏目标 1.5 秒内可交互；未打开的重面板不进入首屏 bundle。
12. 工作台刷新不调用模型，不额外消耗 Token。

## 13. 需要批准的设计决策

实施前需要确认以下默认选择：

1. 采用方案 B：在 Agent Pi 内维护受控派生工作台，而不是依赖用户另装原版插件。
2. 3.4.1 默认关闭通用终端，后续再单独设计项目级授权。
3. 先做投标模块；投资/交付模块复用同一壳，但不在 3.4.1 首批扩展新业务功能。
4. 保留经典工作台一个小版本作为回退，验证稳定后再删除重复 UI。

