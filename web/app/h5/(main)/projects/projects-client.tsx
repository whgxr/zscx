"use client"

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Table2, Building2, FileText, ChevronRight, 
  LayoutDashboard, Users, FolderOpen, TrendingUp
} from 'lucide-react'

interface ProjectsClientProps {
  user: any
  tables: { id: number; name: string; label: string; icon?: string | null; description?: string | null }[]
  recordCounts: Record<number, number>
  isAdmin: boolean
}

const iconMap: Record<string, React.ReactNode> = {
  home: <LayoutDashboard className="w-6 h-6" />,
  table: <Table2 className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  building: <Building2 className="w-6 h-6" />,
  file: <FileText className="w-6 h-6" />,
}

export function ProjectsClient({ user, tables, recordCounts, isAdmin }: ProjectsClientProps) {
  const router = useRouter()

  const totalRecords = Object.values(recordCounts).reduce((sum, c) => sum + c, 0)

  return (
    <div className="px-4 pt-4 pb-4">
      {/* 头部 */}
      <div className="bg-primary rounded-2xl p-5 mb-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm opacity-80">欢迎回来</p>
            <h1 className="text-xl font-bold mt-0.5">{user.realName || user.username}</h1>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold">
              {(user.realName || user.username).charAt(0)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <FolderOpen className="w-4 h-4 opacity-70" />
            <span className="text-sm">{tables.length} 个项目</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 opacity-70" />
            <span className="text-sm">{totalRecords} 条记录</span>
          </div>
        </div>
      </div>

      {/* 项目列表 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">项目列表</h2>
        <span className="text-xs text-gray-400">{tables.length} 个项目</span>
      </div>

      {tables.length === 0 ? (
        <div className="text-center py-16">
          <FolderOpen className="w-16 h-16 mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500">暂无可用项目</p>
          <p className="text-gray-400 text-sm mt-1">联系管理员分配权限</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tables.map((table) => {
            const count = recordCounts[table.id] || 0
            return (
              <Card
                key={table.id}
                className="border-0 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => router.push(`/h5/projects/${table.name}`)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    {table.icon && iconMap[table.icon] ? (
                      iconMap[table.icon]
                    ) : (
                      <Table2 className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{table.label}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs h-5">
                        {count} 条记录
                      </Badge>
                      {table.description && (
                        <span className="text-xs text-gray-400 truncate">{table.description}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}