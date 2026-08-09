import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import {
  createRecordSnapshot,
} from '@/lib/snapshot-utils'
import { parseLevyRelationConfig } from '@/lib/levy-sync-detector'

const submitSchema = z.object({
  tableId: z.number(),
  recordId: z.number(),
})

// GET /api/sync-requests  —— 查询当前用户的同步请求（简略版）
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100)

    const [items, total] = await Promise.all([
      prisma.dataSyncRequest.findMany({
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: {
          requestedBy: user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
            ? undefined
            : user.id,
        },
        include: {
          surveyTable: { select: { id: true, label: true } },
          levyTable: { select: { id: true, label: true } },
          requester: { select: { id: true, realName: true } },
        },
      }),
      prisma.dataSyncRequest.count({
        where: {
          requestedBy: user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
            ? undefined
            : user.id,
        },
      }),
    ])

    return NextResponse.json({ items, total, page, pageSize })
  } catch (error) {
    console.error('[api/sync-requests GET] error:', error)
    return NextResponse.json({ message: '查询失败' }, { status: 500 })
  }
}

// POST /api/sync-requests
// H5/PC 详情页"同步"按钮调用：根据 tableId+recordId 触发调查 → 征收 同步请求
// 逻辑：1. 找到所有引用该调查表(targetTableId=tableId)的 LEVY_RELATION 字段（即征收表里配置的调查引用字段）
//       2. 对每个对应 levyTableId 创建 DataSyncRequest(PENDING)，附带当前调查记录的 snapshot
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = submitSchema.parse(await req.json())

    const surveyTable = await prisma.dataTable.findUnique({
      where: { id: body.tableId },
      select: { id: true, name: true, label: true, status: true },
    })
    if (!surveyTable || surveyTable.status !== 'ACTIVE') {
      return NextResponse.json({ message: '调查表不存在' }, { status: 400 })
    }

    const surveyRecord = await prisma.dataRecord.findUnique({
      where: { id: body.recordId },
      select: { id: true, tableId: true, data: true, status: true },
    })
    if (!surveyRecord || surveyRecord.tableId !== surveyTable.id) {
      return NextResponse.json({ message: '调查记录不存在' }, { status: 400 })
    }

    // 查找所有"引用该调查表"的 LEVY_RELATION 字段
    const allRelationFields = await prisma.tableField.findMany({
      where: { type: 'LEVY_RELATION' },
      select: { id: true, tableId: true, name: true, config: true },
    })

    const levyRelations: Array<{ levyTableId: number; fieldName: string }> = []
    for (const f of allRelationFields) {
      const cfg = parseLevyRelationConfig(f.config)
      if (cfg && cfg.targetTableId === surveyTable.id) {
        levyRelations.push({ levyTableId: f.tableId, fieldName: f.name })
      }
    }

    if (levyRelations.length === 0) {
      return NextResponse.json(
        { message: '该调查表未配置 LEVY_RELATION（征收引用字段）。请在征收表字段设计器中添加 LEVY_RELATION 类型字段并指向当前调查表。' },
        { status: 400 }
      )
    }

    // 生成调查记录快照
    const sData = (surveyRecord.data ?? {}) as Record<string, any>
    const snapshot = await createRecordSnapshot({
      tableId: surveyTable.id,
      recordId: surveyRecord.id,
      beforeData: sData,
      afterData: sData,
      changedBy: user.id,
      changeType: 'UPDATE',
      metadata: { side: 'survey', syncTrigger: 'manual' },
    })

    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    const createdRequests: number[] = []

    for (const rel of levyRelations) {
      const levyTable = await prisma.dataTable.findUnique({
        where: { id: rel.levyTableId },
        select: { id: true, label: true },
      })
      if (!levyTable) continue

      // 查询该 levyTable 中是否已经存在引用该调查记录的征收记录
      const existingLevyRecords = await prisma.dataRecord.findMany({
        where: { tableId: rel.levyTableId },
        select: { id: true, data: true },
      })
      let matchedLevyRecordId: number | null = null
      for (const lr of existingLevyRecords) {
        const lrData = (lr.data ?? {}) as Record<string, any>
        const val = lrData[rel.fieldName] ?? lrData[`${rel.fieldName}_id`] ?? null
        if (val && (Number(val) === surveyRecord.id || val === String(surveyRecord.id))) {
          matchedLevyRecordId = lr.id
          break
        }
      }

      // 查是否已存在 PENDING/APPROVED 同步请求（避免重复提交）
      const existing = await prisma.dataSyncRequest.findFirst({
        where: {
          surveyTableId: surveyTable.id,
          surveyRecordId: surveyRecord.id,
          levyTableId: rel.levyTableId,
          status: { in: ['PENDING'] },
        },
      })
      if (existing) {
        createdRequests.push(existing.id)
        continue
      }

      // 若未找到匹配的征收记录，先创建一条空壳征收记录（仅回填 LEVY_RELATION 指向的调查记录 id），
      // 审核通过时再覆盖/追加其它字段。
      let levyRecordIdVal = matchedLevyRecordId
      if (!levyRecordIdVal) {
        const levyShell = await prisma.dataRecord.create({
          data: {
            tableId: rel.levyTableId,
            data: { [rel.fieldName]: surveyRecord.id } as any,
            status: 'DRAFT',
            createdBy: user.id,
            updatedBy: user.id,
          },
        })
        levyRecordIdVal = levyShell.id
      }

      // 找 relationFieldId（可选），用于后续回写时精准定位字段
      let relationFieldId: number | undefined = undefined
      try {
        const rf = await prisma.tableField.findFirst({
          where: { tableId: rel.levyTableId, type: 'LEVY_RELATION', name: rel.fieldName },
          select: { id: true },
        })
        if (rf) relationFieldId = rf.id
      } catch {}

      const syncReq = await prisma.dataSyncRequest.create({
        data: {
          source: 'SURVEY',
          surveyTableId: surveyTable.id,
          surveyRecordId: surveyRecord.id,
          levyTableId: rel.levyTableId,
          levyRecordId: levyRecordIdVal,
          relationFieldId,
          snapshotId: snapshot.id,
          fieldDiffs: {},
          status: 'PENDING',
          requestedBy: user.id,
        },
      })
      createdRequests.push(syncReq.id)

      // 如果调查记录已有状态字段，标记为 SYNC_PENDING
      try {
        if ((surveyRecord.status as string) !== 'DELETED') {
          await prisma.dataRecord.update({
            where: { id: surveyRecord.id },
            data: { status: 'SYNC_PENDING' },
          })
        }
      } catch {
        // 忽略更新失败（可能 status 类型不匹配）
      }
    }

    // 写入审计日志
    try {
      await prisma.operationLog.create({
        data: {
          action: 'SYNC_REQUEST.SUBMIT',
          module: 'SYNC',
          tableId: surveyTable.id,
          recordId: surveyRecord.id,
          userId: user.id,
          detail: `提交调查↔征收同步请求 (${createdRequests.length} 条待审核)` as any,
          ipAddress,
          userAgent,
          syncRequestId: createdRequests[0] ?? null,
        },
      })
    } catch {
      // 审计日志不影响主流程
    }

    return NextResponse.json({
      ok: true,
      syncRequestIds: createdRequests,
      count: createdRequests.length,
      message: `已提交 ${createdRequests.length} 条同步请求至征收端审核`,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    console.error('[api/sync-requests POST] error:', error)
    return NextResponse.json({ message: '提交同步请求失败' }, { status: 500 })
  }
}
