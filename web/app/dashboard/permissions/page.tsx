import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Users } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Shield } from 'lucide-react'
import { UserStatus } from '@prisma/client'

export default async function PermissionsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN') {
    redirect('/dashboard')
  }

  let users: any[] = []
  try {
    users = await prisma.user.findMany({
      where: {
        role: { name: { in: ['USER', 'VIEWER'] } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        realName: true,
        role: true,
        status: true,
        _count: {
          select: { tablePermissions: true },
        },
      },
    })
  } catch (err) {
    console.error('Permissions page query error:', err)
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
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

  const roleLabels: Record<string, string> = {
    USER: '录入员',
    VIEWER: '查看员',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">权限管理</h1>
          <p className="text-gray-500 mt-1">为用户分配数据表权限</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>已分配表数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length > 0 ? (
                users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.realName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{roleLabels[u.role?.name] || u.role?.label || '未知'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'destructive'}>
                        {u.status === 'ACTIVE' ? '启用' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>{u._count.tablePermissions} 个</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/permissions/${u.id}`}>
                        <Button variant="ghost" size="sm">
                          <Shield className="w-4 h-4 mr-1" />
                          设置权限
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无需要分配权限的用户</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
