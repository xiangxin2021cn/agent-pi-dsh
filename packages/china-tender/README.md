# 中国招投标资料核对

纯 TypeScript 模块，无文件、网络或平台操作。运行环境为 Node.js 24；运行 `node --test packages/china-tender/tests/china-tender.test.ts`。

本模块输出制度适用建议、规则范围判断、要求证据响应矩阵和清单差异，不输出资格合格/不合格、废标或全国合规结论。默认目录只有三个列明出处的国家/公路行业来源，核验日期为 2026-10-05；不含省级规则，修订草案不能执行为现行规则。调用方提供更多规则时，应先复核其效力状态、正式来源及项目适用范围。

## 宿主入口

```ts
import { analyzeChinaTender, createChinaBoqBaseline } from './index.ts';

const profile = {
  context: 'government_procurement',
  subject: 'construction',
  method: 'tender',
  mandatoryTender: 'yes',
  province: 'CN-44',
  industry: 'highway',
  projectDate: '2026-10-05',
} as const;

const report = analyzeChinaTender({ profile });
```

`context` 是经项目资料核实的采购制度，不能由“国企”“政府项目”或网站名直接推断。`engineering_goods`、`engineering_services` 表示已确认与工程的法定关联；不能仅因同一采购人而归入。非招标工程需提供 `mandatoryTender: 'no'` 才给出相应程序建议，存在法定例外的复杂情形先交专业人员处理。

`province` 建议由宿主使用省级代码，规则的 `provinces` 使用相同代码；只做准确匹配，不猜省份名称别名。`industry` 内置公路规则使用 `highway`，其他专业使用宿主稳定标识。所有日期采用 `YYYY-MM-DD`：规则 `effectiveTo` 为失效日（不包含），证书 `validUntil` 为有效期最后一天（包含）。项目适用日期可以由要求的 `evaluationDate` 覆盖，不能把开标、有效期或履约期限混成一个日期。规则和证据在项目时点前核验的，输出需要更新核验。

## 输出与证据

`analyzeChinaTender` 输出 `profileAssessment`、`ruleAssessments`、`responseMatrix`、`summary` 和可选 `boqComparison`。结构见 `types.ts`。无要求时 `summary.hasRequirements` 为 false，不表示审查通过。

要求和证据引用原系统的文件、要求编号即可。文件来源必须显式说明 `active`、`superseded` 或 `withdrawn`。`verified`、核验人、核验日期和支持/矛盾关系由宿主的复核流程提供；本模块不自行读取图片或核验证照真伪。仅有有效文件、有效证据、审阅记录与响应定位的支持关系才能显示 `supported`。证据缺失或网站未检索到显示 `needs_evidence`；过期、已替代及未核实显示 `needs_review`；有核验证据的明确矛盾显示 `conflict`，这些均不是法律资格结论。

登记要求时应提供 `source.sha256`，复核响应时保存 `requirementSourceSha256`；两者不一致或响应未绑定当前来源时进入复核。只有来源尚无哈希的旧记录才依赖来源 `status`；宿主应在来源替代时更新状态，不得将未绑定版本的旧结论直接复用到新文件。

## 清单基线

使用 `createChinaBoqBaseline(baselineId, { documentId, sha256, revision? }, rows)` 创建原始清单快照。保留原始数字字符串、零数量行、中国清单编码和指定金额。函数复制并冻结输入；指纹覆盖来源、基线编号和所有行。

`compareChinaBoq(baseline, comparedRows, 'recalculation' | 'submission')` 仅返回新增、遗漏及字段差异，不更新基线。按稳定行编号比较，允许不同单元工程同清单编码。数量以十进制字符串计算精确差值；单位变化时不相减。JSON 恢复的基线会重新验证完整性。

宿主必须对基线进行追加式持久化：同 `baselineId` 不得覆盖；经确认的新补遗应创建新基线，保留被替代版本，并让关联响应和报价进入复核。哈希不能证明原文件真实性，也不能阻止持有写权限的人同时重写内容和指纹，不能宣称法律意义的不可篡改存证。原始文件 SHA-256 需由宿主计算，本模块不访问文件。

本包不执行 CA 签章、加密递交、公告抓取，不包含省级计价、具体评分或自动法条文本匹配。
