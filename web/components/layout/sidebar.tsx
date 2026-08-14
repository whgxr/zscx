"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Table2,
  Users,
  Settings,
  Building2,
  FileBarChart,
  ShieldCheck,
  Palette,
  Activity,
  FolderTree,
  GitBranch,
  Bell,
  ClipboardList,
  ClipboardCheck,
  Scale,
  FileSearch,
  AlertTriangle,
  Plug,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Role } from '@prisma/client'
import { resolveKeyFromHref, useTabs } from '@/components/layout/tabs-context'

interface SidebarProps {
  user: {
    id: number
    username: string
    realName: string
    role: { name: string } | null
    avatar?: string | null
  }
  tables: {
    id: number
    name: string
    label: string
    icon?: string | null
    category?: { id: number; name: string; module: string } | null
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

interface CollapsibleGroupProps {
  label: string
  icon?: React.ReactNode
  active?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleGroup({ label, icon, active, defaultOpen, children }: CollapsibleGroupProps) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  const isOpen = open || !!active

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
          isOpen && active
            ? "bg-primary/10 text-primary font-semibold"
            : "text-gray-500 hover:bg-gray-100 font-semibold"
        )}
      >
        {icon}
        <span className="text-xs uppercase tracking-wider flex-1 text-left">{label}</span>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  )
}

export function Sidebar({ user, tables }: SidebarProps) {
  const pathname = usePathname()
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const currentModule = searchParams.get('module') || ''
  const { prepareLabel } = useTabs()

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  const isSuperAdmin = user.role?.name === 'ADMIN'

  const isProjectActive = tables.some(
    t => pathname.startsWith(`/dashboard/data/${t.name}`)
  )
  const isApprovalActive = pathname.startsWith('/approval')
  const isApprovalMgmtActive = pathname.startsWith('/dashboard/approval')
  const isNotificationActive = pathname.startsWith('/dashboard/notifications')
  const isSystemActive =
    pathname.startsWith('/dashboard/tables') ||
    pathname.startsWith('/dashboard/categories') ||
    pathname.startsWith('/dashboard/users') ||
    pathname.startsWith('/dashboard/permissions') ||
    pathname.startsWith('/dashboard/export-templates') ||
    pathname.startsWith('/dashboard/settings') ||
    pathname.startsWith('/dashboard/integrations') ||
    pathname.startsWith('/dashboard/audit') ||
    pathname.startsWith('/dashboard/error-logs')

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gradient-to-br from-primary/5 to-transparent">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-sm">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight text-gray-900">征收调查系统</h1>
            <p className="text-xs text-gray-400 mt-0.5">数据管理平台</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        <div className="mb-2">
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

        <CollapsibleGroup
          label="项目管理"
          icon={<FolderTree className="w-4 h-4" />}
          active={isProjectActive}
          defaultOpen={isProjectActive}
        >
          {(() => {
            const surveyTables = tables.filter(t => !t.category?.module || t.category?.module === 'SURVEY' || t.category?.module === 'BOTH')
            const levyTables = tables.filter(t => t.category?.module === 'LEVY' || t.category?.module === 'BOTH' || t.category?.module === 'SURVEY' || !t.category?.module)

            const renderTable = (table: typeof tables[0], module: 'survey' | 'levy') => {
              const isActive = pathname.startsWith(`/dashboard/data/${table.name}`) && currentModule === module
              const href = `/dashboard/data/${table.name}?module=${module}`
              const label = `${table.label}（${module === 'survey' ? '调查' : '征收'}）`
              return (
                <Link
                  key={`${table.id}-${module}`}
                  href={href}
                  onClick={() => prepareLabel(resolveKeyFromHref(href), label)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                    isActive
                      ? module === 'survey'
                        ? "bg-blue-50 text-blue-600 font-medium"
                        : "bg-orange-50 text-orange-600 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  {table.icon && iconMap[table.icon] ? iconMap[table.icon] : <Table2 className="w-5 h-5" />}
                  {table.label}
                  <span className={cn(
                    "ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium",
                    module === 'survey' ? "bg-blue-100 text-blue-500" : "bg-orange-100 text-orange-500"
                  )}>
                    {module === 'survey' ? '调查' : '征收'}
                  </span>
                </Link>
              )
            }

            return (
              <div className="space-y-3">
                {surveyTables.length > 0 && (
                  <div>
                    <p className="text-xs text-blue-500 font-medium px-3 mb-1 flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" /> 调查
                    </p>
                    {surveyTables.map(t => renderTable(t, 'survey'))}
                  </div>
                )}
                {levyTables.length > 0 && (
                  <div>
                    <p className="text-xs text-orange-500 font-medium px-3 mb-1 flex items-center gap-1">
                      <Scale className="w-3.5 h-3.5" /> 征收
                    </p>
                    {levyTables.map(t => renderTable(t, 'levy'))}
                  </div>
                )}
                {surveyTables.length === 0 && levyTables.length === 0 && (
                  <p className="px-3 py-4 text-xs text-gray-400 text-center">
                    暂无项目，请先在「项目管理」中创建数据表
                  </p>
                )}
              </div>
            )
          })()}
        </CollapsibleGroup>

        <CollapsibleGroup
          label="审批中心"
          icon={<ClipboardCheck className="w-4 h-4" />}
          active={isApprovalActive}
          defaultOpen={isApprovalActive}
        >
          <Link
            href="/approval"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
              isApprovalActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <ClipboardCheck className="w-5 h-5" />
            我的审批
          </Link>
        </CollapsibleGroup>

        {isAdmin && (
          <CollapsibleGroup
            label="审批管理"
            icon={<GitBranch className="w-4 h-4" />}
            active={isApprovalMgmtActive}
            defaultOpen={isApprovalMgmtActive}
          >
            <Link
              href="/dashboard/approval"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/approval')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <GitBranch className="w-5 h-5" />
              审批流程
            </Link>
          </CollapsibleGroup>
        )}

        <CollapsibleGroup
          label="通知中心"
          icon={<Bell className="w-4 h-4" />}
          active={isNotificationActive}
          defaultOpen={isNotificationActive}
        >
          <Link
            href="/dashboard/notifications"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
              pathname.startsWith('/dashboard/notifications')
                ? "bg-primary/10 text-primary font-medium"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <Bell className="w-5 h-5" />
            通知管理
          </Link>
        </CollapsibleGroup>

        {isAdmin && (
          <CollapsibleGroup
            label="系统管理"
            icon={<Settings className="w-4 h-4" />}
            active={isSystemActive}
            defaultOpen={isSystemActive}
          >
            <Link
              href="/dashboard/tables"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/tables')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Table2 className="w-5 h-5" />
              项目管理
            </Link>
            <Link
              href="/dashboard/categories"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/categories')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <FolderTree className="w-5 h-5" />
              分类管理
            </Link>
            <Link
              href="/dashboard/users"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
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
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/permissions')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <ShieldCheck className="w-5 h-5" />
              权限管理
            </Link>
            <Link
              href="/dashboard/export-templates"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/export-templates')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Palette className="w-5 h-5" />
              导出模板设计
            </Link>
            <Link
              href="/dashboard/settings"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/settings')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Settings className="w-5 h-5" />
              系统设置
            </Link>
            <Link
              href="/dashboard/integrations"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                pathname.startsWith('/dashboard/integrations')
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <Plug className="w-5 h-5" />
              集成管理
            </Link>
            {isSuperAdmin && (
              <>
                <Link
                  href="/dashboard/audit"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                    pathname.startsWith('/dashboard/audit')
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <FileSearch className="w-5 h-5" />
                  审计日志中心
                </Link>
                <Link
                  href="/dashboard/error-logs"
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 pl-6 rounded-lg text-sm transition-colors",
                    pathname.startsWith('/dashboard/error-logs')
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <AlertTriangle className="w-5 h-5" />
                  错误日志
                </Link>
              </>
            )}
          </CollapsibleGroup>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 bg-gray-50/60">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center ring-2 ring-white shadow-sm">
            <span className="text-sm font-medium text-gray-600">
              {user.realName?.charAt(0) || user.username.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.realName || user.username}
            </p>
            <p className="text-xs text-gray-500">
              {user.role?.name === 'ADMIN' && '超级管理员'}
              {user.role?.name === 'MANAGER' && '管理员'}
              {user.role?.name === 'USER' && '录入员'}
              {user.role?.name === 'VIEWER' && '查看员'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
