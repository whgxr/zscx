// 回归测试：审批动作必须验证当前用户是否为待办的 assignee
//
// 背景：v1.2.2 commit 8902a52 重构审批服务时，executeNodeAction 仅校验了
// status='PENDING'，没有验证 params.assigneeId === ni.assigneeId。
// 两个对外 API（/api/approval/nodes/[id] 与 /api/approval/v2/node-actions）
// 都直接把 user.id 作为 assigneeId 传入，导致任何已登录用户都能对任意
// 待办节点执行 APPROVE/REJECT/TRANSFER，构成 IDOR / 水平越权漏洞。
//
// 触发场景：用户 A（普通 USER 角色）登录后，调用
//   POST /api/approval/v2/node-actions
//   body: { "nodeInstanceId": <任何 PENDING 节点的 id>, "action": "REJECT" }
// 即可驳回分配给其他人的审批，无需任何额外凭证。
//
// 修复：在 status 检查后增加 ni.assigneeId !== params.assigneeId 的 403 拒绝。
//
// 运行：node --test web/tests/approval-assignee-auth.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const approvalServicePath = path.join(__dirname, '..', 'lib', 'approval-service.ts')

function loadSource() {
  return fs.readFileSync(approvalServicePath, 'utf-8')
}

function extractExecuteNodeAction(source) {
  const start = source.indexOf('export async function executeNodeAction')
  if (start === -1) return null
  const next = source.indexOf('\nexport ', start + 1)
  const end = next === -1 ? source.length : next
  return source.substring(start, end)
}

test('executeNodeAction 函数必须存在', () => {
  const source = loadSource()
  const body = extractExecuteNodeAction(source)
  assert.ok(body, 'executeNodeAction 函数必须存在')
})

test('executeNodeAction 必须在校验 status 之后校验当前用户为 assignee', () => {
  const body = extractExecuteNodeAction(loadSource())
  assert.ok(body, 'executeNodeAction 函数必须存在')

  // 1. 现有的 status 检查必须保留
  const statusCheckIdx = body.indexOf("ni.status !== 'PENDING'")
  assert.ok(statusCheckIdx > -1, '必须保留 status !== PENDING 检查')

  // 2. 必须新增 assignee 一致性检查
  // 匹配形式：ni.assigneeId !== null && ni.assigneeId !== params.assigneeId
  const pattern = /ni\.assigneeId\s*!==\s*null\s*&&\s*ni\.assigneeId\s*!==\s*params\.assigneeId/
  const match = body.match(pattern)
  assert.ok(match, '必须新增 ni.assigneeId !== params.assigneeId 检查（防止 IDOR/越权）')
  assert.ok(match.index > statusCheckIdx, 'assigneeId 检查必须放在 status 检查之后')

  // 3. 拒绝分支必须返回 403（与项目其他鉴权失败响应一致）
  const rejectBlock = body.substring(match.index, match.index + 300)
  assert.match(rejectBlock, /status:\s*403/, '拒绝越权操作时必须返回 403 状态码')
})

test('两个对外 API 必须使用 user.id（当前会话用户）作为 assigneeId', () => {
  // 这两个路由是上面漏洞的入口点。如果以后有人把 assigneeId 改回从 body
  // 读取（来自客户端），等于再次打开越权后门，所以这里锁定行为。
  const routes = [
    path.join(__dirname, '..', 'app', 'api', 'approval', 'nodes', '[id]', 'route.ts'),
    path.join(__dirname, '..', 'app', 'api', 'approval', 'v2', 'node-actions', 'route.ts'),
  ]
  for (const r of routes) {
    const src = fs.readFileSync(r, 'utf-8')
    // 必须出现 `assigneeId: user.id` 或等价的 server-side 派生（user 来自 getCurrentUser）
    assert.match(
      src,
      /assigneeId:\s*user\.id/,
      `${path.basename(path.dirname(r))} 必须以 user.id 作为 assigneeId，不能从 body 直接读取`
    )
    // 防御性：不允许出现从 body 取 assigneeId 的写法
    assert.doesNotMatch(
      src,
      /assigneeId:\s*body\.assigneeId|assigneeId:\s*Number\(\s*body\./,
      `${path.basename(path.dirname(r))} 不允许把客户端传入的 assigneeId 直接信任`
    )
  }
})
