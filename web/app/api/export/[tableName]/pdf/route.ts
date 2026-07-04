import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export async function GET(
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
      take: 100,
    })

    const listFields = table.fields.filter(f => f.showInList)

    const doc = new jsPDF({
      orientation: listFields.length > 6 ? 'landscape' : 'portrait',
      unit: 'pt',
    })

    doc.setFontSize(16)
    doc.text(table.label, 40, 40)
    doc.setFontSize(10)
    doc.text(`导出时间: ${new Date().toLocaleString('zh-CN')}`, 40, 60)
    doc.text(`记录数: ${records.length}`, 40, 75)

    const statusText: Record<string, string> = {
      DRAFT: '草稿',
      SUBMITTED: '已提交',
      REVIEWED: '已审核',
      REJECTED: '已驳回',
      ARCHIVED: '已归档',
    }

    const headers = ['ID', ...listFields.map(f => f.label), '状态', '创建时间']
    const body = records.map(record => {
      const data = record.data as Record<string, any> || {}
      return [
        record.id.toString(),
        ...listFields.map(f => data[f.name]?.toString() || ''),
        statusText[record.status] || record.status,
        record.createdAt.toLocaleString('zh-CN'),
      ]
    })

    autoTable(doc, {
      head: [headers],
      body: body,
      startY: 90,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 40, right: 40 },
    })

    const buffer = doc.output('arraybuffer')

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(table.label)}_${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Export PDF error:', error)
    return NextResponse.json({ message: '导出失败' }, { status: 500 })
  }
}
