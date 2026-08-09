import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { triggerSyncForSurveyRecordIfNeeded } from '@/lib/levy-sync-detector'
import { tryLevySaveAutoTrigger } from '@/lib/approval-service'

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canView) {
        return NextResponse.json({ message: '无权限查看此表数据' }, { status: 403 })
      }
    }

    if (search) {
      const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
      const searchPattern = `%${escapedSearch}%`

      const statusCondition = status
        ? Prisma.sql`AND r.status = ${status}`
        : Prisma.empty

      const [recordsRaw, totalRaw] = await Promise.all([
        prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT 
            r.id, r.tableId, r.data, r.status, r.createdAt, r.updatedAt, r.createdBy, r.updatedBy,
            u.real_name AS creator_realName, u.username AS creator_username
          FROM DataRecord r
          LEFT JOIN User u ON r.createdBy = u.id
          WHERE r.tableId = ${table.id}
          ${statusCondition}
          AND CAST(r.data AS CHAR) LIKE ${searchPattern}
          ORDER BY r.createdAt DESC
          LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
        `),
        prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
          SELECT COUNT(*) AS total
          FROM DataRecord r
          WHERE r.tableId = ${table.id}
          ${statusCondition}
          AND CAST(r.data AS CHAR) LIKE ${searchPattern}
        `),
      ])

      const records = recordsRaw.map((row: any) => ({
        id: row.id,
        tableId: row.tableId,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        creator: row.creator_realName || row.creator_username
          ? { id: row.createdBy, realName: row.creator_realName, username: row.creator_username }
          : null,
      }))

      const total = Number(totalRaw[0]?.total) || 0

      return NextResponse.json({
        records,
        total,
        page,
        pageSize,
        fields: table.fields,
        table: {
          id: table.id,
          name: table.name,
          label: table.label,
        },
      })
    }

    const where: any = { tableId: table.id }

    if (status) {
      where.status = status
    }

    const [records, total] = await Promise.all([
      prisma.dataRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: {
            select: { id: true, realName: true, username: true },
          },
        },
      }),
      prisma.dataRecord.count({ where }),
    ])

    return NextResponse.json({
      records,
      total,
      page,
      pageSize,
      fields: table.fields,
      table: {
        id: table.id,
        name: table.name,
        label: table.label,
      },
    })
  } catch (error) {
    console.error('Get records error:', error)
    return NextResponse.json({ message: '获取数据失败' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: { fields: true },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canCreate) {
        return NextResponse.json({ message: '无权限添加数据' }, { status: 403 })
      }
    }

    if (user.role?.name === 'VIEWER') {
      return NextResponse.json({ message: '查看员无法添加数据' }, { status: 403 })
    }

    const body = await req.json()
    const { data, status = 'DRAFT' } = body

    const record = await prisma.dataRecord.create({
      data: {
        tableId: table.id,
        data,
        status,
        createdBy: user.id,
        updatedBy: user.id,
      } as any,
    })

    // v1.2.2+ 同步检测（调查表新建也可能触发：如初始就填了关键差异字段或默认值不同）
    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null
    const { snapshotId, syncRequestIds } = await triggerSyncForSurveyRecordIfNeeded({
      surveyTableId: table.id,
      surveyRecordId: record.id,
      newSurveyData: record.data as Record<string, any>,
      oldSurveyData: null,
      changedBy: user.id,
      changeType: 'CREATE',
      ipAddress,
      userAgent,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId: record.id,
        snapshotId: snapshotId ?? undefined,
        detail: { syncRequestIds } as any,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      },
    })

    // v1.2.2+ M2-T4: 若是征收模块 + 绑定了 LEVY_SAVE 触发流程，新建时也自动发起审批
    const levyTrigger = await tryLevySaveAutoTrigger({
      table: { id: table.id, categoryId: table.categoryId, approvalTriggerConfig: table.approvalTriggerConfig, featureFlags: table.featureFlags },
      recordId: record.id, initiatorId: user.id, ip: ipAddress, ua: userAgent,
    })

    return NextResponse.json({ record, levyTrigger: !levyTrigger.skipped ? { instanceId: (levyTrigger as any).instanceId, matched: (levyTrigger as any).matched } : null })
  } catch (error) {
    console.error('Create record error:', error)
    return NextResponse.json({ message: '创建数据失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canDelete) {
        return NextResponse.json({ message: '无权限删除数据' }, { status: 403 })
      }
    }

    const body = await req.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: '请选择要删除的记录' }, { status: 400 })
    }

    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    // v1.2.2+ 删除前先抓要删的记录 data 用于快照和同步
    const toDelete = await prisma.dataRecord.findMany({
      where: { id: { in: ids }, tableId: table.id },
      select: { id: true, data: true },
    })
    for (const r of toDelete) {
      await triggerSyncForSurveyRecordIfNeeded({
        surveyTableId: table.id,
        surveyRecordId: r.id,
        newSurveyData: {}, // DELETE：after = null/空
        oldSurveyData: (r.data as Record<string, any>) || null,
        changedBy: user.id,
        changeType: 'DELETE',
        ipAddress,
        userAgent,
      })
    }

    await prisma.dataRecord.deleteMany({
      where: {
        id: { in: ids },
        tableId: table.id,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'BATCH_DELETE_RECORDS',
        module: 'DATA',
        tableId: table.id,
        detail: { count: ids.length, deletedIds: ids } as any,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      },
    })

    return NextResponse.json({ message: '批量删除成功' })
  } catch (error) {
    console.error('Batch delete error:', error)
    return NextResponse.json({ message: '批量删除失败' }, { status: 500 })
  }
}
