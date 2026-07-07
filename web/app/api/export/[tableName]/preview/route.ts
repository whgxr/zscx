import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ExportType } from '@prisma/client'

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

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

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || (!permission.canExportExcel && !permission.canExportPdf)) {
        return NextResponse.json({ message: '无权限预览' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const templateId = searchParams.get('templateId')
    const useTemplate = searchParams.get('useTemplate') === 'true'

    const where: any = { tableId: table.id }
    if (status) where.status = status

    const records = await prisma.dataRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    let selectedFields = table.fields.filter((f: any) => f.showInList)

    if (templateId && useTemplate) {
      const exportTemplate = await prisma.exportTemplate.findUnique({
        where: { id: parseInt(templateId) },
      })
      const config = exportTemplate?.config as any
      if (config?.fields) {
        const fieldNames = config.fields.map((f: any) => f.name)
        selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
        selectedFields.sort((a: any, b: any) => {
          return fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name)
        })
      } else if (config?.grid) {
        const fieldNames: string[] = []
        config.grid.forEach((row: any[]) => {
          row.forEach((cell: any) => {
            if (cell?.value && cell.value.includes('{{') && cell.value.includes('}}')) {
              const match = cell.value.match(/\{\{([^}]+)\}\}/)
              if (match && match[1]) {
                const fieldName = match[1].trim()
                if (!['id', 'status', 'createdAt', 'createTime', 'updatedAt', 'updateTime'].includes(fieldName)) {
                  if (!fieldNames.includes(fieldName)) {
                    fieldNames.push(fieldName)
                  }
                }
              }
            }
          })
        })
        if (fieldNames.length > 0) {
          selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
          selectedFields.sort((a: any, b: any) => {
            return fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name)
          })
        }
      }
    }

    const headers = ['ID', ...selectedFields.map((f: any) => f.label), '状态', '创建时间']
    const rows = records.map(record => {
      const data = record.data as Record<string, any> || {}
      return [
        record.id.toString(),
        ...selectedFields.map((f: any) => data[f.name]?.toString() || ''),
        statusText[record.status] || record.status,
        new Date(record.createdAt).toLocaleString('zh-CN'),
      ]
    })

    return NextResponse.json({
      headers,
      rows,
      total: records.length,
      tableName: table.label,
    })
  } catch (error: any) {
    console.error('Preview error:', error)
    return NextResponse.json({ message: '预览失败' }, { status: 500 })
  }
}
