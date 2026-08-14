/**
 * 专项动作审批 - 设计器元数据
 * GET /api/approval/special-actions/meta
 *   - 无参数：返回全部数据表 + 角色 + 各表字段（fieldsByTable）
 *   - ?tableId=: 仅返回指定表的字段
 * 供设计器"专项动作审批"配置面板使用（需审批管理权限）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) {
      return NextResponse.json({ ok: false, error: '无权限' }, { status: 403 })
    }
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    if (tableId) {
      const fields = await prisma.tableField.findMany({
        where: { tableId: Number(tableId) },
        select: { id: true, name: true, label: true, type: true },
        orderBy: { sortOrder: 'asc' },
      })
      return NextResponse.json({ ok: true, data: { fields } })
    }

    // 非明细子表（主表才可作为专项动作目标项目）
    const tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE', isDetailTable: false },
      select: { id: true, name: true, label: true },
      orderBy: { sortOrder: 'asc' },
    })
    const roles = await prisma.role.findMany({
      select: { id: true, name: true, label: true },
      orderBy: { sortOrder: 'asc' },
    })
    const allFields = await prisma.tableField.findMany({
      select: { id: true, tableId: true, name: true, label: true, type: true },
      orderBy: { sortOrder: 'asc' },
    })
    const fieldsByTable: Record<number, any[]> = {}
    for (const f of allFields) {
      ;(fieldsByTable[f.tableId] ??= []).push(f)
    }

    return NextResponse.json({ ok: true, data: { tables, roles, fieldsByTable } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '获取失败' }, { status: 500 })
  }
}