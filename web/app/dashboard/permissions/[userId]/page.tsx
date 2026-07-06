import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PermissionManager } from './permission-manager'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'

export default async function PermissionsPage({
  params,
}: {
  params: { userId: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN') {
    redirect('/dashboard')
  }

  const targetUserId = parseInt(params.userId)

  let targetUser: any = null
  let permissions: any[] = []

  try {
    targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, realName: true, role: true },
    })

    if (!targetUser) {
      redirect('/dashboard/permissions')
    }

    const tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: {
        permissions: {
          where: { userId: targetUserId },
        },
      },
    })

    permissions = tables.map((table: any) => {
      const perm = table.permissions[0]
      return {
        tableId: table.id,
        tableName: table.name,
        tableLabel: table.label,
        canView: perm?.canView ?? false,
        canCreate: perm?.canCreate ?? false,
        canEdit: perm?.canEdit ?? false,
        canDelete: perm?.canDelete ?? false,
        canExportExcel: perm?.canExportExcel ?? perm?.canExport ?? false,
        canExportPdf: perm?.canExportPdf ?? perm?.canExport ?? false,
        canPrint: perm?.canPrint ?? false,
        canImport: perm?.canImport ?? false,
      }
    })
  } catch (err) {
    console.error('Permission detail page error:', err)
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/permissions">
            <Button variant="ghost">
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">权限管理</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-red-500 mb-2">数据加载失败</p>
            <p className="text-gray-500 text-sm mb-4">
              可能是数据库未同步，请在服务器执行：<br/>
              <code className="bg-gray-100 px-2 py-1 rounded mt-2 inline-block">
                docker exec zscx-web npx prisma db push
              </code>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <PermissionManager
      targetUser={{
        id: targetUser.id,
        username: targetUser.username,
        realName: targetUser.realName,
        role: targetUser.role?.name || targetUser.role?.label || '未知',
      }}
      initialPermissions={permissions}
    />
  )
}
