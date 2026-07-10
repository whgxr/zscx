import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function H5AdminUserDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  const targetUser = await prisma.user.findUnique({
    where: { id: parseInt(params.id) },
    include: { role: true },
  })

  if (!targetUser) return <div className="p-8 text-center text-gray-500">用户不存在</div>

  const roleLabels: Record<string, string> = { ADMIN: '超级管理员', MANAGER: '管理员', USER: '录入员', VIEWER: '查看员' }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <a href="/h5/admin/users" className="p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </a>
        <h1 className="text-lg font-semibold">用户详情</h1>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-bold text-2xl">{(targetUser.realName || targetUser.username).charAt(0)}</span>
          </div>
          <div>
            <h2 className="text-lg font-bold">{targetUser.realName || targetUser.username}</h2>
            <p className="text-sm text-gray-500">@{targetUser.username}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">手机号</p><p>{targetUser.phone || '-'}</p></div>
          <div><p className="text-xs text-gray-400">邮箱</p><p>{targetUser.email || '-'}</p></div>
          <div><p className="text-xs text-gray-400">角色</p><p>{roleLabels[targetUser.role?.name] || targetUser.role?.name}</p></div>
          <div><p className="text-xs text-gray-400">状态</p><p className={targetUser.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-500'}>
            {targetUser.status === 'ACTIVE' ? '正常' : '禁用'}
          </p></div>
          <div className="col-span-2"><p className="text-xs text-gray-400">创建时间</p><p>{new Date(targetUser.createdAt).toLocaleString('zh-CN')}</p></div>
        </div>
      </div>
    </div>
  )
}