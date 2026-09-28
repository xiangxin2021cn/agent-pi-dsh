import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localizeCapability } from '../src/client/capability-labels.js'

test('built-in capability copy follows the interface language without changing service data', () => {
  for (const [id, title, description] of [
    ['tender:full-analysis', '招标全文解析与要求覆盖', '原文定位、页表图附件补遗覆盖、计量与评分及递交要求'],
    ['tender:item-derivation', 'BOQ 成本与资源逐项推导', '项目范围、计量、工法工效、资源消耗和价格及对账'],
    ['tender:execution-plan', '投标实施策划', '由实际工作包、资源和项目条件形成详实策划'],
    ['tender:returnables', '招标递交文件与表单', '按实际必交清单、评分点及模板派生递交文件'],
    ['delivery:drawing', '施工图专业读图', '识别图号、版本、单位、构件及施工约束'],
    ['delivery:quantity', '工程量计算', '图纸位置、构件、计算式、单位、扣减及清单范围关联'],
    ['delivery:method', '项目施工方案', '本项目作业条件、工法步骤、资源参数和检验及异常处理'],
    ['investment:research', '专业调研与决策报告', '按当次问题、地区、时点和受众组织调查与判断'],
  ]) {
    const row = { id, title, description, status: 'available' }
    const translated = localizeCapability(row, 'en')
    assert.doesNotMatch(translated.title + translated.description, /[\u3400-\u9fff]/u, id)
    assert.equal(localizeCapability(row, 'zh-CN'), row)
    assert.deepEqual(row, { id, title, description, status: 'available' })
  }
  const userCapability = { id: 'customer:custom', title: '客户定义', description: '客户自己的说明' }
  assert.equal(localizeCapability(userCapability, 'en'), userCapability)
})
