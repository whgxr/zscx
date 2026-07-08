import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

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

    const where: any = { tableId: table.id }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        {
          data: {
            path: [],
            string_contains: search,
          },
        },
      ]
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

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId: record.id,
      },
    })

    return NextResponse.json({ record })
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
        detail: { count: ids.length },
      },
    })

    return NextResponse.json({ message: '批量删除成功' })
  } catch (error) {
    console.error('Batch delete error:', error)
    return NextResponse.json({ message: '批量删除失败' }, { status: 500 })
  }
}
