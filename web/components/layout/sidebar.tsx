"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Table2, 
  Users, 
  Settings, 
  Building2,
  FileBarChart,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Role } from '@prisma/client'

interface SidebarProps {
  user: {
    id: number
    username: string
    realName: string
    role: Role
    avatar?: string | null
  }
  tables: {
    id: number
    name: string
    label: string
    icon?: string | null
  }[]
}

const iconMap: Record<string, React.ReactNode> = {
  home: <LayoutDashboard className="w-5 h-5" />,
  table: <Table2 className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
  building: <Building2 className="w-5 h-5" />,
  file: <FileBarChart className="w-5 h-5" />,
}

export function Sidebar({ user, tables }: SidebarProps) {
  const pathname = usePathname()

  const isAdmin = user.role === 'ADMIN' || user.role === 'MANAGER'

  return (
    <aside className="w-64 bg-white border-r flex flex-col">
      <div className="p-4 border-b">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg">征收调查系统</h1>
            <p className="text-xs text-gray-500">数据管理平台</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            主菜单
          </p>
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              pathname === '/dashboard'
                ? "bg-primary/10 text-primary font-medium"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <LayoutDashboard className="w-5 h-5" />
            仪表盘
          </Link>
        </div>

        <div className="mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
            数据管理
          </p>
          {tables.map((table) => (
            <Link
              key={table.id}
              href={`/dashboard/data/${table.name}`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith(`/dashboard/data/${table.name}`)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {table.icon && iconMap[table.icon] ? iconMap[table.icon] : <Table2 className="w-5 h-5" />}
              {table.label}
            </Link>
          ))}
        </div>

        {isAdmin && (
          <div className="mb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">
              系统管理
            </p>
            <Link
              href="/dashboard/tables"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/tables')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Table2 className="w-5 h-5" />
              数据表管理
            </Link>
            <Link
              href="/dashboard/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/users')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Users className="w-5 h-5" />
              用户管理
            </Link>
            <Link
              href="/dashboard/permissions"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/permissions')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <ShieldCheck className="w-5 h-5" />
              权限管理
            </Link>
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/settings')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Settings className="w-5 h-5" />
              系统设置
            </Link>
          </div>
        )}
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-gray-600">
              {user.realName?.charAt(0) || user.username.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.realName || user.username}
            </p>
            <p className="text-xs text-gray-500">
              {user.role === 'ADMIN' && '超级管理员'}
              {user.role === 'MANAGER' && '管理员'}
              {user.role === 'USER' && '录入员'}
              {user.role === 'VIEWER' && '查看员'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
