# 钢筋料表与受控平法计算内核

本包提供确定性、可追溯的结构化计算，由 `bundles/engineering-rebar` 注册到 `engineering_project` 的 `rebar` provider。公开入口见 `index.ts`，精确数据契约见 `types.ts`。

## 当前可执行范围

- `calculateRebar(input)`：料表明确根数、单构件根数乘构件数、显式分区间距布置；中心线直段/圆弧；几何、计量、加工三个独立长度口径；显式每米质量计算；逐组来源、规则、输入指纹、覆盖和重复检查。
- `countSpacingZones(zones)`：显式起终点及端点包含规则；邻接区共用端点只计一次，重叠区拒绝计算。`includeEnd: true` 会纳入不在间距网格上的终点；单点区需同时包含起点和终点。
- `parsePingfa(text)`：有限文字语法，如 `4Φ20`、`2Φ22+2Φ20`、`G4C12`、`N4C16`、`Φ8@100/200(2)`、`KL1(3A) 300×600`。保留符号，不根据字体自动认定钢筋牌号；不支持片段原样返回。
- `expandPingfa(input)`：同一明确 `scopeId` 内原位标注覆盖同角色集中标注；采用经声明审校和项目采用的规则包，按照显式参数的加权和逐项计算。缺少角色、参数、规则或支持语法时保留占位组，不能静默丢弃。
- `auditRebar(input)`：与计算同源的检查结果；不会提升审核或加工批准状态。

这不是 CAD/PDF 图像识别器，也没有内置完整 22G101/18G901 规范算法。多排配筋、加腋/变截面、复杂梁柱节点、基础构造、钢筋连接、箍筋组合、抗震锚固及加工弯曲调整均需提供审校后的结构化构造及参数。梁头解析只产生元数据，不产生钢筋工程量。柱、板和基础可使用显式角色与参数计算，但没有各构件的自动构造补全。箍筋肢数只作解析信息，不能推定组合箍形状、根数或下料长度。

## 数据与未知项

长度值使用十进制字符串和 `mm`/`m`；数量使用正的安全整数。计量、加工口径未提供时保留 `null`，不会复制几何量。采购损耗没有混入钢筋净量；不默认每米质量、保护层、锚固、搭接、钢筋牌号或抗震条件。已有明确结果可计入已知小计，未解决项同时保留在行状态和 `incompleteRows` 中。

`coverage.expectedGroupIds` 必须来自独立核对的图纸/构件/钢筋组清单；未出现的组保留 `missingGroupIds`。排除项需要逐项理由。平法展开返回的清单只表示当前作用域声明的角色，不能据此证明全项目无漏项。`coverage.complete` 仅表示输入声明清单内的计算覆盖，不是图纸全覆盖、专业复核或成果验收。

同一物理组应在 BBS 与平法输入之间共享 `identityKey`；未提供时可用 `hostId + mark` 发现重复。冲突组全部从小计中排除，待核对后重新输入；不会任意选择一份。没有这些标识时，系统不能证明两个来源不是同一根钢筋。

中间十进制计算复用现有 BigInt 定点算法。圆弧使用明示数值近似 `π/180 = 0.017453292519943295`；同时给出形状和单长时执行精确一致性检查，不自动容忍或舍入差异。最终取整/舍入及加工允差应由采用规则或交付环节明确，不能隐含进净量。

## 规则与追溯

规则包必须记录编号、版本、适用构件、声明角色、标准/项目依据、来源、审校状态、项目采用状态及可选勘误指纹。包内容整体生成 SHA-256 指纹；每行保留表达式参数值、单位、倍率、来源和换算后的米值。规则只支持参数加权和，不执行表达式文本或脚本。

`reviewStatus: reviewed` 和 `adopted: true` 是调用者提交的采用记录，不能替代真实审校手续；宿主工程账本应登记其来源和依赖。所有结果恒为 `reviewState: unreviewed`、`fabricationApproved: false`。任何 AI 计算结果都不自动授予加工批准。

## 可执行示例与验证

`examples/bbs.json` 与 `examples/pingfa.json` 是明确标注的演示夹具，不是实际工程数据或规范系数。通过 provider 调用：

```json
{"action":"calculate","data":{"schemaVersion":1,"rows":[{"id":"demo-1","inputMode":"bbs","diameterMm":"16","steelGrade":"DEMO-GRADE","count":5,"lengths":{"geometry":{"value":"1200","unit":"mm"}},"unitMassKgPerM":"1.58","sourceRefs":[{"documentId":"demo-bbs"}]}],"coverage":{"expectedGroupIds":["demo-1"]}}}
```

演示结果为几何总长 `6 m`、已知质量 `9.48 kg`；加工量保持未知。完整 BBS 示例另行声明加工长度，结果为 `6.25 m`、`9.875 kg`。平法演示使用明确给出的 `5000 + 300 + 300 mm` 和 `4` 根，计算 `22.4 m`、`35.392 kg`；其中 `300 mm` 不是任何锚固默认值。

在 Node 24 中运行：

```powershell
node --test packages/engineering-rebar/tests/rebar.test.ts bundles/engineering-rebar/tests/provider.test.ts
```

测试涵盖数值预期、混合直径、重复来源、分区端点、局部未知、不支持语法、规则变更、集中/原位作用域、缺失角色及 provider 实际调用与卸载。
