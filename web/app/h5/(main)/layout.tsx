import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/notification-service'
import { H5BottomNav } from './bottom-nav'

export default async function H5MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/h5/login')
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'

  // 我的待办审批计数（当前分配给我的 PENDING 节点实例）
  const unreadApproval = await prisma.approvalNodeInstance.count({
    where: { status: 'PENDING', assigneeId: user.id },
  }).catch(() => 0)

  // 未读通知
  const unreadNotif = await notificationService.getUnreadCount(user.id).catch(() => 0)

  // tables 仅在需要时被 page.tsx 自身再查，这里不做重复查询以保持 SSR 轻量

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>
      <H5BottomNav user={user} isAdmin={isAdmin} unreadApproval={unreadApproval} unreadNotif={unreadNotif} />
    </div>
  )
}
