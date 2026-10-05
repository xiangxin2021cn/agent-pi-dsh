# 中国招投标插件

通过 `engineering` 注册 `china-tender` provider，由现有 `engineering_project` 工具的 `run` 动作执行。可选注入 `professionalCapabilities`，让“本次任务”发现中国招投标资料核对能力。卸载注销能力，不删除工程历史。运行时与工程宿主需支持 5.8.0 的 `EngineeringExecutionContext.previousRuns`。

同时可选向 `workbench` 注册独立 `china-tender` 模块，五阶段依次为：项目制度与原始清单、招标要求与补遗解析、资格与响应证据、报价与工程复算差异、递交前人工检查。首阶段由主对话分析，不要求先填表。该流程不继承南非 SANRAL 阶段控制或默认知识库；地方/行业规则由用户选择实际有效资料。

各阶段需实际成果文件；末阶段设置原生人工确认门，只记录准备材料已人工复核，不代表资格通过、CA 签章或实际提交。规则未知、证据缺失和原量差异由 provider 保留问题，并通过工程账本同步任务发现。流程提示并非全国法规自动审查引擎；是否满足资格和交易规则仍由法定主体判断。项目保存 workflowSnapshot，卸载插件后不能新建该类型，但既有项目、流程快照和工程历史仍可读取。

## 动作

- `analyze`：`data` 使用 `packages/china-tender/types.ts` 的 `ChinaTenderInput`。结果包括制度建议、规则适用、要求证据响应矩阵及可选清单差异。零要求会明确提示未覆盖，不能作为通过审查。缺证据、未查询到、证据过期与明确矛盾分别展示。
- `create_baseline`：`data={baselineId,source:{documentId,sha256,revision?,issuedAt?},rows}`。`rows` 使用 `BoqBaselineRow`，数量传十进制字符串。先登记原始文件，保留中国清单编号、零量行及指定金额。输出为清单快照，不构成招标人批准或最终报价。

`inputDescription` 为模型提供完整字段和限制；正式字段契约以纯模块类型为准。规则目录为已列明来源的小范围实现，省级规则需实际来源和适用核验。

## 基线版本边界

工程宿主向执行函数传入本项目已保存历史的只读副本，模型输入不能提供这份上下文。插件从 `china-tender` 的基线历史结果核验已绑定指纹：

1. 新 `baselineId` 可创建首次快照。
2. 同 `baselineId`、相同指纹允许重试；变化的源文件、行内容或元数据必须使用新编号。
3. `analyze` 中的基线必须已在本项目登记且指纹一致，不能靠重新计算指纹来替换原快照。
4. 宿主负责持久化和 revision CAS；执行函数不写 store。并发或过期提交由宿主拒绝。
5. 有效补遗创建新快照，保留旧记录。是否采用该补遗以及相关响应、报价是否复核，仍需在项目任务中完成。

哈希保障快照的一致性，不证明原图/证书真实性，不等同 CA 签章或法律意义的不可篡改存证。未绑定源文件或版本不符会给出独立 issue。

## 验证

`node --test packages/china-tender/tests/china-tender.test.ts bundles/china-tender/tests/*.test.ts`

插件测试使用真实 provider 注册器、能力注册器和工程 store，覆盖基线创建、重试、同编号篡改、恢复后检查、证据缺口与生命周期。
工作台测试使用真实 WorkbenchRegistry、项目创建/绑定、工程宿主和 taskGuide，验证动态创建、缺报告不可收阶段、未知制度和缺证据仍产生缺口、任务发现同步，以及卸载保留。
