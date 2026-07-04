import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import ExcelJS from 'exceljs'

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string; type: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role === 'USER' || user.role === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canExport) {
        return NextResponse.json({ message: '无权限导出' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const where: any = { tableId: table.id }
    if (status) where.status = status

    const records = await prisma.dataRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const listFields = table.fields.filter((f: any) => f.showInList)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(table.label)

    const headers = ['ID', ...listFields.map(f => f.label), '状态', '创建时间']
    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: i === 0 ? 'id' : i === headers.length - 1 ? 'createdAt' : i === headers.length - 2 ? 'status' : `field_${i-1}`,
      width: 15,
    }))

    worksheet.getRow(1).font = { bold: true }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5EDFE' },
    }

    const statusText: Record<string, string> = {
      DRAFT: '草稿',
      SUBMITTED: '已提交',
      REVIEWED: '已审核',
      REJECTED: '已驳回',
      ARCHIVED: '已归档',
    }

    records.forEach((record) => {
      const data = record.data as Record<string, any> || {}
      const rowData: any = {
        id: record.id,
        status: statusText[record.status] || record.status,
        createdAt: record.createdAt.toLocaleString('zh-CN'),
      }
      listFields.forEach((field, idx) => {
        rowData[`field_${idx}`] = data[field.name]?.toString() || ''
      })
      worksheet.addRow(rowData)
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(table.label)}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Export Excel error:', error)
    return NextResponse.json({ message: '导出失败' }, { status: 500 })
  }
}
