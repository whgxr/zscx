import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const cloneTableSchema = z.object({
  name: z.string().min(1, '项目名不能为空').regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '项目名只能包含字母、数字和下划线，且以字母开头'),
  label: z.string().min(1, '显示名称不能为空'),
  description: z.string().optional(),
  icon: z.string().optional(),
  cloneFields: z.boolean().optional().default(true),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const sourceId = parseInt(params.id)
    if (isNaN(sourceId)) {
      return NextResponse.json({ message: '无效的源项目ID' }, { status: 400 })
    }

    const body = await req.json()
    const data = cloneTableSchema.parse(body)

    const sourceTable = await prisma.dataTable.findUnique({
      where: { id: sourceId },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!sourceTable) {
      return NextResponse.json({ message: '源项目不存在' }, { status: 404 })
    }

    const existing = await prisma.dataTable.findUnique({
      where: { name: data.name },
    })

    if (existing) {
      return NextResponse.json({ message: '项目名已存在' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const newTable = await tx.dataTable.create({
        data: {
          name: data.name,
          label: data.label,
          description: data.description || sourceTable.description,
          icon: data.icon || sourceTable.icon,
          status: sourceTable.status,
          sortOrder: sourceTable.sortOrder,
          createdBy: user.id,
        },
      })

      if (data.cloneFields && sourceTable.fields.length > 0) {
        const fieldsToCreate = sourceTable.fields.map((field) => ({
          tableId: newTable.id,
          name: field.name,
          label: field.label,
          type: field.type,
          required: field.required,
          unique: field.unique,
          sortOrder: field.sortOrder,
          description: field.description,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
          options: field.options,
          validation: field.validation,
          config: field.config,
          isSystem: false,
          showInList: field.showInList,
          showInForm: field.showInForm,
          showInSearch: field.showInSearch,
        }))

        await tx.tableField.createMany({
          data: fieldsToCreate as any[],
        })
      }

      return newTable
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CLONE_TABLE',
        module: 'TABLE',
        tableId: result.id,
        detail: {
          sourceId,
          sourceName: sourceTable.name,
          name: data.name,
          label: data.label,
          cloneFields: data.cloneFields,
        },
      },
    })

    return NextResponse.json({ table: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Clone table error:', error)
    return NextResponse.json({ message: '复制项目失败' }, { status: 500 })
  }
}
