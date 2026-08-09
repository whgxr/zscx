"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardCheck, Bell, User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface H5BottomNavProps {
  user: {
    id: number
    username: string
    realName: string
    role: { name: string } | null
  }
  isAdmin: boolean
  unreadApproval?: number
  unreadNotif?: number
}

export function H5BottomNav({ user, isAdmin, unreadApproval = 0, unreadNotif = 0 }: H5BottomNavProps) {
  const pathname = usePathname()

  const navItems = [
    {
      label: '工作台',
      href: '/h5/projects',
      icon: LayoutDashboard,
      match: () => pathname === '/h5/projects' || pathname === '/h5' || pathname.startsWith('/h5/projects/'),
      badge: 0,
    },
    {
      label: '审批',
      href: '/h5/approval',
      icon: ClipboardCheck,
      match: () => pathname.startsWith('/h5/approval'),
      badge: unreadApproval,
    },
    {
      label: '通知',
      href: '/h5/notifications',
      icon: Bell,
      match: () => pathname.startsWith('/h5/notifications'),
      badge: unreadNotif,
    },
    {
      label: '我的',
      href: isAdmin ? '/h5/settings' : '/h5/profile',
      icon: User,
      match: () => (isAdmin
        ? pathname.startsWith('/h5/settings') || pathname.startsWith('/h5/admin')
        : pathname.startsWith('/h5/profile')),
      badge: 0,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.match()
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 px-3 py-1 min-w-[64px]",
                isActive ? "text-primary" : "text-gray-400"
              )}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px]">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
