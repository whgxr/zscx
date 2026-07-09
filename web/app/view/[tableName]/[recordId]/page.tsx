import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { FieldType, RecordStatus } from '@prisma/client'

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT: { label: '草稿', color: 'text-gray-600', bg: 'bg-gray-100' },
  SUBMITTED: { label: '已提交', color: 'text-blue-600', bg: 'bg-blue-100' },
  REVIEWED: { label: '已审核', color: 'text-green-600', bg: 'bg-green-100' },
  REJECTED: { label: '已驳回', color: 'text-red-600', bg: 'bg-red-100' },
  ARCHIVED: { label: '已归档', color: 'text-yellow-600', bg: 'bg-yellow-100' },
}

function formatFieldValue(fieldType: FieldType, value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-gray-400">-</span>
  }

  switch (fieldType) {
    case FieldType.SWITCH:
      return value === true || value === 'true' || value === 1 ? '是' : '否'

    case FieldType.SELECT:
    case FieldType.RADIO:
      return String(value)

    case FieldType.MULTISELECT:
    case FieldType.CHECKBOX: {
      const arr: string[] = Array.isArray(value) ? value : []
      return arr.length > 0 ? arr.join('、') : <span className="text-gray-400">-</span>
    }

    case FieldType.UPLOAD_IMAGE: {
      const urls: string[] = Array.isArray(value) ? value : value ? [value] : []
      if (urls.length === 0) return <span className="text-gray-400">-</span>
      return (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, idx) => (
            <img
              key={idx}
              src={url}
              alt=""
              className="w-20 h-20 object-cover rounded border"
            />
          ))}
        </div>
      )
    }

    case FieldType.UPLOAD_FILE: {
      const fileUrls: string[] = Array.isArray(value) ? value : value ? [value] : []
      if (fileUrls.length === 0) return <span className="text-gray-400">-</span>
      return (
        <div className="space-y-1">
          {fileUrls.map((url, idx) => (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm block truncate"
            >
              {url.split('/').pop()}
            </a>
          ))}
        </div>
      )
    }

    case FieldType.MONEY:
      return typeof value === 'number'
        ? `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
        : String(value)

    case FieldType.DETAIL_TABLE: {
      const rows: Array<Record<string, any>> = Array.isArray(value) ? value : []
      if (rows.length === 0) return <span className="text-gray-400">-</span>
      return (
        <div className="text-sm text-gray-500">
          {rows.length} 条明细记录
        </div>
      )
    }

    default:
      return String(value)
  }
}

export default async function ViewRecordPage({
  params,
}: {
  params: { tableName: string; recordId: string }
}) {
  const { tableName, recordId } = params
  const recordIdNum = parseInt(recordId, 10)

  if (isNaN(recordIdNum)) {
    notFound()
  }

  const table = await prisma.dataTable.findUnique({
    where: { name: tableName },
    include: {
      fields: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!table) {
    notFound()
  }

  const record = await prisma.dataRecord.findUnique({
    where: { id: recordIdNum },
    include: {
      creator: {
        select: { id: true, realName: true, username: true },
      },
    },
  })

  if (!record || record.tableId !== table.id) {
    notFound()
  }

  const data = (record.data as Record<string, any>) || {}
  const status = statusConfig[record.status] || statusConfig.DRAFT
  const displayFields = table.fields.filter((f) => f.showInForm)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900">
              {table.label}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              {status.label}
            </span>
          </div>
          <div className="mt-1 text-sm text-gray-500">
            记录编号：#{record.id}
          </div>
        </div>

        {/* Fields Card */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-medium text-gray-700">记录详情</h2>
          </div>
          <div className="divide-y">
            {displayFields.map((field) => {
              const value = data[field.name]
              return (
                <div key={field.id} className="px-4 py-3">
                  <div className="text-xs text-gray-500 mb-1">
                    {field.label}
                  </div>
                  <div className="text-sm text-gray-900">
                    {formatFieldValue(field.type, value)}
                  </div>
                </div>
              )
            })}
            {displayFields.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                暂无字段信息
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 bg-white rounded-lg shadow-sm border px-4 py-3">
          <div className="flex flex-col gap-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>创建时间</span>
              <span>{new Date(record.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="flex justify-between">
              <span>更新时间</span>
              <span>{new Date(record.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
            {record.creator && (
              <div className="flex justify-between">
                <span>创建人</span>
                <span>{record.creator.realName || record.creator.username}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
