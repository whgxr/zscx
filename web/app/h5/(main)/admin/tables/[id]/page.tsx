import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function H5AdminTableDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  const table = await prisma.dataTable.findUnique({
    where: { id: parseInt(params.id) },
    include: { fields: { orderBy: { sortOrder: 'asc' } }, _count: { select: { records: true } } },
  })

  if (!table) return <div className="p-8 text-center text-gray-500">数据表不存在</div>

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <a href="/h5/admin/tables" className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </a>
        <h1 className="text-lg font-semibold">{table.label}</h1>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <h3 className="text-sm font-medium mb-3">基本信息</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">表名</p><p>{table.name}</p></div>
          <div><p className="text-xs text-gray-400">记录数</p><p>{table._count.records}</p></div>
          <div><p className="text-xs text-gray-400">状态</p><p>{table.status}</p></div>
          <div><p className="text-xs text-gray-400">明细表</p><p>{table.isDetailTable ? '是' : '否'}</p></div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-medium mb-3">字段列表 ({table.fields.length})</h3>
        <div className="space-y-2">
          {table.fields.map((field: any) => (
            <div key={field.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{field.label}</span>
                {field.required && <span className="text-red-400 text-xs">*</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{field.type}</span>
                <span className="text-xs text-gray-300">{field.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}