import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function H5AdminTemplateDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  const template = await prisma.exportTemplate.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      table: { select: { label: true, name: true } },
    },
  })

  if (!template) return <div className="p-8 text-center text-gray-500">模板不存在</div>

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <a href="/h5/admin/templates" className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </a>
        <h1 className="text-lg font-semibold">{template.name}</h1>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <h3 className="text-sm font-medium mb-3">基本信息</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">类型</p><p>{template.category}</p></div>
          <div><p className="text-xs text-gray-400">关联表</p><p>{template.table?.label}</p></div>
          <div><p className="text-xs text-gray-400">模板ID</p><p>#{template.id}</p></div>
          <div><p className="text-xs text-gray-400">打印</p><p>{template.category?.includes('PRINT') ? '是' : '否'}</p></div>
          <div className="col-span-2">
            <p className="text-xs text-gray-400">创建时间</p>
            <p>{new Date(template.createdAt).toLocaleString('zh-CN')}</p>
          </div>
        </div>
      </div>

      {template.description && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-medium mb-3">描述</h3>
          <p className="text-sm text-gray-600">{template.description}</p>
        </div>
      )}
    </div>
  )
}