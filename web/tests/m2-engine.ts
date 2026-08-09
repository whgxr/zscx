/**
 * M2-T8 引擎纯函数单测（12 种组合）
 *   - 运行： npx tsx tests/m2-engine.ts
 *   - 不依赖 DB，全部走 engine/ 的纯函数：
 *       parseDefinition / startKey / endKeys / nodeById / evaluateNodeCondition
 */
import assert from 'node:assert/strict'
import type { WorkflowDefinition, WorkflowNodeDef, CondExpr } from '../lib/engine/types'
import { parseDefinition, startKey, endKeys, nodeById } from '../lib/engine/types'
import { evaluateNodeCondition } from '../lib/engine/condition-evaluator'

let passed = 0, failed = 0
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`✅ ${name}`) }
  catch (e: any) { failed++; console.log(`❌ ${name}\n   ${e.message}`) }
}

// ---------- helpers ----------
function linear(count = 2): WorkflowDefinition {
  const nodes: WorkflowNodeDef[] = []
  nodes.push({ id: 'start', type: 'START', name: '开始', prev: [], next: ['a1'] })
  for (let i = 1; i <= count; i++) {
    const prev = i === 1 ? ['start'] : [`a${i - 1}`]
    const next = i === count ? ['end'] : [`a${i + 1}`]
    nodes.push({
      id: `a${i}`, type: 'APPROVER_SINGLE', name: `审批${i}`, prev, next,
      approver: { kind: 'USER', candidates: [1000 + i] },
    })
  }
  nodes.push({ id: 'end', type: 'END', name: '结束', prev: [`a${count}`] })
  return { nodes }
}

check('[1] parseDefinition - 正常 DAG 应该能解析', () => {
  const r = parseDefinition({ jsonDefinition: linear(2) })
  assert.equal(r?.nodes.length, 4)
})

check('[2] parseDefinition - 缺失 nodes 应返回 null', () => {
  assert.equal(parseDefinition({ jsonDefinition: { foo: 1 } }), null)
  assert.equal(parseDefinition({}), null)
})

check('[3] startKey / endKeys - 线性 2 节点', () => {
  const def = linear(2)
  assert.equal(startKey(def), 'start')
  assert.deepEqual(endKeys(def), ['end'])
})

check('[4] nodeById - 查节点', () => {
  const def = linear(1)
  assert.equal(nodeById(def, 'a1')?.type, 'APPROVER_SINGLE')
  assert.equal(nodeById(def, 'noSuch'), undefined)
})

check('[5] 条件表达式 eq/ne 字符串', () => {
  const exprs: CondExpr[] = [
    { field: 'name', op: 'eq', value: '张三' },
    { field: 'status', op: 'ne', value: 'DRAFT' },
  ]
  const node: WorkflowNodeDef = {
    id: 'c1', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: { expressions: exprs },
    nextTrue: ['end'], nextFalse: ['end'],
  }
  assert.equal(evaluateNodeCondition(node, { name: '张三', status: 'REVIEWED' }), true)
  assert.equal(evaluateNodeCondition(node, { name: '李四', status: 'REVIEWED' }), false)
  assert.equal(evaluateNodeCondition(node, { name: '张三', status: 'DRAFT' }), false)
})

check('[6] 条件表达式 gt/gte/lt/lte 数字', () => {
  const mk = (op: any, value: number) => ({
    id: 'c', type: 'CONDITION_BRANCH' as const, name: '条件', prev: [],
    condition: { expressions: [{ field: 'amount', op, value }] as any },
    nextTrue: [], nextFalse: [],
  })
  assert.equal(evaluateNodeCondition(mk('gt', 100), { amount: 150 }), true)
  assert.equal(evaluateNodeCondition(mk('gte', 100), { amount: 100 }), true)
  assert.equal(evaluateNodeCondition(mk('lt', 100), { amount: 99 }), true)
  assert.equal(evaluateNodeCondition(mk('lte', 100), { amount: 101 }), false)
})

check('[7] 条件表达式 contains / in / empty / nempty', () => {
  const n1: WorkflowNodeDef = {
    id: 'c', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: { expressions: [{ field: 'tags', op: 'contains', value: 'apple' }] },
  }
  assert.equal(evaluateNodeCondition(n1, { tags: 'pineapple tart' }), true)
  assert.equal(evaluateNodeCondition(n1, { tags: 'peach tart' }), false)
  const n2: WorkflowNodeDef = {
    id: 'c', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: { expressions: [{ field: 'dept', op: 'in', value: ['财务部','综合部'] }] },
  }
  assert.equal(evaluateNodeCondition(n2, { dept: '财务部' }), true)
  assert.equal(evaluateNodeCondition(n2, { dept: '研发部' }), false)
  const n3: WorkflowNodeDef = {
    id: 'c', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: { expressions: [{ field: 'reason', op: 'empty', value: null }] },
  }
  assert.equal(evaluateNodeCondition(n3, { reason: '' }), true)
  assert.equal(evaluateNodeCondition(n3, { reason: 'x' }), false)
  const n4: WorkflowNodeDef = {
    id: 'c', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: { expressions: [{ field: 'reason', op: 'nempty', value: null }] },
  }
  assert.equal(evaluateNodeCondition(n4, { reason: 'x' }), true)
})

check('[8] 或签 (APPROVER_ORSIGN) 定义结构', () => {
  const nodes: WorkflowNodeDef[] = [
    { id: 's', type: 'START', name: '开始', prev: [], next: ['o1'] },
    { id: 'o1', type: 'APPROVER_ORSIGN', name: '或签', prev: ['s'], next: ['end'], approver: { kind: 'ROLE', candidates: [3, 7, 9] } },
    { id: 'end', type: 'END', name: '结束', prev: ['o1'] },
  ]
  const def = { nodes }
  assert.equal(startKey(def), 's')
  const o1 = nodeById(def, 'o1')!
  assert.equal(o1.type, 'APPROVER_ORSIGN')
  assert.deepEqual(o1.approver?.candidates, [3, 7, 9])
})

check('[9] 会签 (APPROVER_COUNTERSIGN) 带法定人数比例', () => {
  const def: WorkflowDefinition = {
    nodes: [
      { id: 's', type: 'START', name: '开始', prev: [], next: ['c1'] },
      { id: 'c1', type: 'APPROVER_COUNTERSIGN', name: '会签', prev: ['s'], next: ['end'], approver: { kind: 'USER', candidates: [11, 12, 13, 14], quorum: 50 } },
      { id: 'end', type: 'END', name: '结束', prev: ['c1'] },
    ]
  }
  const c1 = nodeById(def, 'c1')!
  assert.equal(c1.type, 'APPROVER_COUNTERSIGN')
  assert.equal(c1.approver?.quorum, 50)
})

check('[10] 条件分支 nextTrue / nextFalse 双出边拓扑', () => {
  const def: WorkflowDefinition = {
    nodes: [
      { id: 's', type: 'START', name: '开始', prev: [], next: ['cond'] },
      { id: 'cond', type: 'CONDITION_BRANCH', name: '条件', prev: ['s'], nextTrue: ['big'], nextFalse: ['small'], condition: { expressions: [{ field: 'x', op: 'gt', value: 5 }] } },
      { id: 'big', type: 'APPROVER_SINGLE', name: '大', prev: ['cond'], next: ['end'], approver: { kind: 'USER', candidates: [1] } },
      { id: 'small', type: 'APPROVER_SINGLE', name: '小', prev: ['cond'], next: ['end'], approver: { kind: 'USER', candidates: [2] } },
      { id: 'end', type: 'END', name: '结束', prev: ['big', 'small'] },
    ]
  }
  const cond = nodeById(def, 'cond')!
  assert.deepEqual(cond.nextTrue, ['big'])
  assert.deepEqual(cond.nextFalse, ['small'])
  const end = nodeById(def, 'end')!
  assert.deepEqual(end.prev, ['big', 'small'])
})

check('[11] 并行 PARALLEL(ANY) + CC 节点不阻塞', () => {
  const def: WorkflowDefinition = {
    nodes: [
      { id: 's', type: 'START', name: '开始', prev: [], next: ['p', 'cc'] },
      { id: 'cc', type: 'CC', name: '抄送', prev: ['s'], next: [], ccTargets: { kind: 'USER', ids: [88, 99] } },
      { id: 'p', type: 'PARALLEL', name: '并行', prev: ['s'], next: ['l1', 'r1'], parallelWaitMode: 'ANY' },
      { id: 'l1', type: 'APPROVER_SINGLE', name: '左', prev: ['p'], next: ['end'], approver: { kind: 'USER', candidates: [11] } },
      { id: 'r1', type: 'APPROVER_SINGLE', name: '右', prev: ['p'], next: ['end'], approver: { kind: 'USER', candidates: [12] } },
      { id: 'end', type: 'END', name: '结束', prev: ['l1', 'r1'] },
    ]
  }
  assert.equal(nodeById(def, 'p')?.parallelWaitMode, 'ANY')
  assert.deepEqual(nodeById(def, 'cc')?.ccTargets?.ids, [88, 99])
  assert.deepEqual(nodeById(def, 'p')?.next, ['l1', 'r1'])
})

check('[12] 或表达式 orExpressions (OR of AND 数组) 语义', () => {
  const node: WorkflowNodeDef = {
    id: 'c', type: 'CONDITION_BRANCH', name: '条件', prev: [],
    condition: {
      expressions: [],
      orExpressions: [
        [{ field: 'a', op: 'eq', value: 1 }, { field: 'b', op: 'eq', value: 2 }],  // AND: a==1 AND b==2
        [{ field: 'x', op: 'eq', value: 'vip' }],                                 // OR:  x=='vip'
      ],
    },
    nextTrue: [], nextFalse: [],
  }
  assert.equal(evaluateNodeCondition(node, { a: 1, b: 2 }), true)  // 命中第一个 AND
  assert.equal(evaluateNodeCondition(node, { a: 1, b: 99 }), false) // 第一个 AND 不成立，x 没传 → false
  assert.equal(evaluateNodeCondition(node, { x: 'vip' }), true)    // 命中第二个 AND（单项）
  assert.equal(evaluateNodeCondition(node, { a: 0 }), false)
})

console.log(`\n总计 ${passed + failed} · 通过 ${passed} · 失败 ${failed}`)
if (failed > 0) process.exit(1)
