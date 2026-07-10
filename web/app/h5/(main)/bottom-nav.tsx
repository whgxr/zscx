"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FolderOpen, Settings, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface H5BottomNavProps {
  user: {
    id: number
    username: string
    realName: string
    role: { name: string } | null
  }
  isAdmin: boolean
}

export function H5BottomNav({ user, isAdmin }: H5BottomNavProps) {
  const pathname = usePathname()

  const navItems = [
    {
      label: '首页',
      href: '/h5/projects',
      icon: Home,
      active: pathname === '/h5/projects' || pathname === '/h5',
    },
    {
      label: '项目',
      href: '/h5/projects',
      icon: FolderOpen,
      active: pathname.startsWith('/h5/projects/'),
    },
    ...(isAdmin ? [{
      label: '设置',
      href: '/h5/settings',
      icon: Settings,
      active: pathname.startsWith('/h5/settings') || pathname.startsWith('/h5/admin'),
    }] : []),
    {
      label: '我的',
      href: '/h5/profile',
      icon: User,
      active: pathname.startsWith('/h5/profile'),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.active
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => {
                if (item.href === '#') {
                  e.preventDefault()
                  // 我的页面 - 显示用户信息弹窗或跳转
                  alert(`${user.realName || user.username}\n角色：${user.role?.name === 'ADMIN' ? '超级管理员' : user.role?.name === 'MANAGER' ? '管理员' : user.role?.name === 'USER' ? '录入员' : '查看员'}`)
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-3 py-1 min-w-[64px]",
                isActive ? "text-primary" : "text-gray-400"
              )}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}