/**
 * 专项动作审批 - 我的可发起申请
 * GET  /api/approval/special-actions?tableId=
 *   返回当前用户有权限发起（其角色在 visibleRoleIds，或管理员）的已发布专项动作流程
 * POST /api/approval/special-actions
 *   body: { workflowId, targetTableId, recordId?, actionType?, formData?, comment? }
 *   发起一条专项动作审批实例
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { startInstance } from '@/lib/approval-service'
import { deepParse } from '@/lib/engine'

function parseSpecialAction(raw: any): any {
  if (!raw) return null
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return null } }
  return raw
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })

    const isAdmin =
      user.role?.name === 'ADMIN' || !!user.role?.canManageApproval || !!user.role?.canManageTables

    const wfs = await prisma.approvalWorkflow.findMany({
      where: {
        status: { in: ['ACTIVE', 'PUBLISHED'] },
      },
      include: {
        table: { select: { id: true, label: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    // 按角色过滤：管理员可见全部；普通用户仅当其角色在 visibleRoleIds 中
    const visible = wfs.filter(wf => {
      const sa = parseSpecialAction(wf.specialAction)
      if (!sa) return false
      if (isAdmin) return true
      const roleIds = sa.visibleRoleIds ?? []
      if (!Array.isArray(roleIds) || roleIds.length === 0) return false
      return roleIds.includes(user.roleId)
    })

    const data = visible.map(wf => {
      const sa = parseSpecialAction(wf.specialAction)
      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        version: wf.version,
        specialAction: sa,
        // 目标项目
        targetTable: sa?.targetTableId
          ? { id: sa.targetTableId, label: sa.targetTableLabel ?? wf.table?.label ?? `#${sa.targetTableId}` }
          : (wf.table ? { id: wf.table.id, label: wf.table.label } : null),
      }
    })

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '查询失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const body = await req.json()
    const workflowId = Number(body.workflowId)
    if (!workflowId) return NextResponse.json({ ok: false, error: '缺少 workflowId' }, { status: 400 })

    const wf = await prisma.approvalWorkflow.findUnique({ where: { id: workflowId }, include: { table: true } })
    if (!wf) return NextResponse.json({ ok: false, error: '流程不存在' }, { status: 404 })
    if (wf.status !== 'ACTIVE' && wf.status !== 'PUBLISHED') {
      return NextResponse.json({ ok: false, error: '流程未发布' }, { status: 400 })
    }

    const sa = parseSpecialAction(wf.specialAction)
    if (!sa) return NextResponse.json({ ok: false, error: '该流程未配置专项动作' }, { status: 400 })

    // 权限校验：管理员或角色在 visibleRoleIds
    const isAdmin = user.role?.name === 'ADMIN' || !!user.role?.canManageApproval || !!user.role?.canManageTables
    const roleIds = sa.visibleRoleIds ?? []
    if (!isAdmin && (!Array.isArray(roleIds) || !roleIds.includes(user.roleId))) {
      return NextResponse.json({ ok: false, error: '无权限发起该专项动作申请' }, { status: 403 })
    }

    const targetTableId = sa.targetTableId ?? wf.tableId ?? Number(body.targetTableId)
    if (!targetTableId) return NextResponse.json({ ok: false, error: '未配置目标项目' }, { status: 400 })

    const actionType = sa.actionType ?? body.actionType ?? 'CREATE'
    const formData = body.formData ?? {}
    const comment = body.comment ?? ''

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip')

    // 依据动作类型组织记录：
    // CREATE：新建一条目标表记录，data=formData
    // UPDATE：需指定 recordId，可编辑字段取自 sa.editableFields，发起时 snapshotDataAfter=合并后的 data
    // DELETE/REVIEW：需指定 recordId，仅作审查基准
    let record:
      | { id: number; data: any; updatedAt: Date | null }
      | null = null
    let snapshotAfter: any = null
    let recordId = Number(body.recordId) || undefined

    if (actionType === 'CREATE') {
      const rec = await prisma.dataRecord.create({
        data: {
          tableId: targetTableId,
          data: formData as any,
          status: 'DRAFT',
          createdBy: user.id,
        },
      })
      record = { id: rec.id, data: formData, updatedAt: rec.updatedAt }
      snapshotAfter = formData
      recordId = rec.id
    } else {
      if (!recordId) return NextResponse.json({ ok: false, error: '修改/删除/审查动作必须选择目标记录' }, { status: 400 })
      const existing = await prisma.dataRecord.findUnique({ where: { id: recordId } })
      if (!existing) return NextResponse.json({ ok: false, error: '目标记录不存在' }, { status: 404 })
      if (existing.tableId !== targetTableId) {
        return NextResponse.json({ ok: false, error: '目标记录不属于该项目' }, { status: 400 })
      }
      record = { id: existing.id, data: deepParse(existing.data) ?? {}, updatedAt: existing.updatedAt }

      if (actionType === 'UPDATE') {
        // 仅允许编辑已配置的目标字段
        const editable = (sa.editableFields ?? []).map((f: any) => f.name)
        const merged = { ...record.data }
        for (const key of Object.keys(formData)) {
          if (editable.includes(key)) merged[key] = formData[key]
        }
        snapshotAfter = merged
      }
    }

    // 发起审批
    const result = await startInstance({
      tableId: targetTableId,
      recordId: recordId!,
      initiatorId: user.id,
      triggerEvent: 'SPECIAL_ACTION',
      workflowIdOverride: workflowId,
      workflowVersionOverride: wf.version,
      snapshotDataAfter: snapshotAfter ?? null,
      expectUpdatedAt: record?.updatedAt?.toISOString() ?? null,
      ip,
      ua: req.headers.get('user-agent') ?? null,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('special-actions POST:', e)
    return NextResponse.json({ ok: false, error: e.message ?? '发起失败' }, { status: 500 })
  }
}