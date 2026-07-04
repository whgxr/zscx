import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  FileText, 
  Users, 
  Database, 
  Upload,
  TrendingUp,
  Clock,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const [tableCount, userCount, recordCount, recentRecords] = await Promise.all([
    prisma.dataTable.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.dataRecord.count(),
    prisma.dataRecord.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { label: true } },
      },
    }),
  ])

  const stats = [
    { label: '数据表', value: tableCount, icon: Database, color: 'bg-blue-500' },
    { label: '数据记录', value: recordCount, icon: FileText, color: 'bg-green-500' },
    { label: '用户数', value: userCount, icon: Users, color: 'bg-purple-500' },
    { label: '今日新增', value: 0, icon: TrendingUp, color: 'bg-orange-500' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
        <p className="text-gray-500 mt-1">欢迎使用房屋征收调查系统</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">最近记录</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRecords.length > 0 ? (
              <div className="space-y-4">
                {recentRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">记录 #{record.id}</p>
                        <p className="text-xs text-gray-500">{record.table.label}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">{formatDateTime(record.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无记录</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">快捷操作</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <Upload className="w-8 h-8 text-blue-500 mb-2" />
                <p className="font-medium">导入数据</p>
                <p className="text-xs text-gray-500">批量导入Excel数据</p>
              </div>
              <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <FileText className="w-8 h-8 text-green-500 mb-2" />
                <p className="font-medium">导出报表</p>
                <p className="text-xs text-gray-500">导出数据为Excel/PDF</p>
              </div>
              <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <Database className="w-8 h-8 text-purple-500 mb-2" />
                <p className="font-medium">数据表管理</p>
                <p className="text-xs text-gray-500">自定义数据表结构</p>
              </div>
              <div className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <Users className="w-8 h-8 text-orange-500 mb-2" />
                <p className="font-medium">用户管理</p>
                <p className="text-xs text-gray-500">管理用户和权限</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
