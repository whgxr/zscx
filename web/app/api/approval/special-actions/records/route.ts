/**
 * 专项动作审批 - 目标记录列表
 * GET /api/approval/special-actions/records?tableId=&scope=&keyword=&page=&pageSize=
 *   scope: JSON 数组条件 [{field,op,value}]（AND），用于限定可发起的数据范围
 * 返回指定目标项目（数据表）的记录列表，供"发起申请"选择目标记录。
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// 与 condition-evaluator evalOne 语义一致（仅用于过滤记录）
function matchExpr(expr: { field: string; op: string; value: string }, data: any): boolean {
  const raw = data?.[expr.field]
  switch (expr.op) {
    case 'eq': return String(raw ?? '') === String(expr.value ?? '')
    case 'ne': return String(raw ?? '') !== String(expr.value ?? '')
    case 'gt': return Number(raw) > Number(expr.value)
    case 'gte': return Number(raw) >= Number(expr.value)
    case 'lt': return Number(raw) < Number(expr.value)
    case 'lte': return Number(raw) <= Number(expr.value)
    case 'contains': return typeof raw === 'string' && raw.includes(String(expr.value ?? ''))
    case 'empty': return raw == null || raw === ''
    case 'nempty': return !(raw == null || raw === '')
    default: return true
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const tableId = Number(searchParams.get('tableId'))
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '100')))
    const keyword = searchParams.get('keyword') ?? undefined
    const scope = searchParams.get('scope')
    let scopeArr: { field: string; op: string; value: string }[] | null = null
    if (scope) {
      try { scopeArr = JSON.parse(scope) } catch { scopeArr = null }
    }
    if (!tableId) return NextResponse.json({ ok: false, error: '缺少 tableId' }, { status: 400 })

    const where: any = { tableId }
    const [rows, total] = await Promise.all([
      prisma.dataRecord.findMany({
        where,
        select: { id: true, data: true, status: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dataRecord.count({ where }),
    ])

    let data = rows as any[]
    // 数据范围过滤
    if (scopeArr && scopeArr.length) {
      data = data.filter(r => scopeArr!.every(e => matchExpr(e, r.data)))
    }
    if (keyword) {
      const kw = keyword.toLowerCase()
      data = data.filter(r => {
        const vals = Object.values(r.data ?? {}).map(String).join(' ').toLowerCase()
        return String(r.id).includes(kw) || vals.includes(kw)
      })
    }

    return NextResponse.json({ ok: true, data, total: data.length, page, pageSize })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '查询失败' }, { status: 500 })
  }
}