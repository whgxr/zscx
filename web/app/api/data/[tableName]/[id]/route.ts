import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
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
      if (!permission || !permission.canView) {
        return NextResponse.json({ message: '无权限查看此数据' }, { status: 403 })
      }
    }

    const recordId = parseInt(params.id)
    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
      include: {
        creator: { select: { id: true, realName: true, username: true } },
        files: true,
      },
    })

    if (!record || record.tableId !== table.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Get record error:', error)
    return NextResponse.json({ message: '获取数据失败' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
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
      if (!permission || !permission.canEdit) {
        return NextResponse.json({ message: '无权限编辑此数据' }, { status: 403 })
      }
    }

    if (user.role?.name === 'VIEWER') {
      return NextResponse.json({ message: '查看员无法编辑数据' }, { status: 403 })
    }

    const recordId = parseInt(params.id)
    const body = await req.json()
    const { data, status } = body

    const updateData: any = {
      data,
      updatedBy: user.id,
    }
    if (status) updateData.status = status

    const record = await prisma.dataRecord.update({
      where: { id: recordId },
      data: updateData,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId: record.id,
        detail: body,
      },
    })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Update record error:', error)
    return NextResponse.json({ message: '更新数据失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
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

    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canDelete) {
        return NextResponse.json({ message: '无权限删除此数据' }, { status: 403 })
      }
    }

    const recordId = parseInt(params.id)
    
    await prisma.uploadedFile.deleteMany({ where: { recordId } })
    
    await prisma.dataRecord.delete({
      where: { id: recordId },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete record error:', error)
    return NextResponse.json({ message: '删除数据失败' }, { status: 500 })
  }
}
