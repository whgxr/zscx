"use client"

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationCenter } from '@/components/notification-center'
import { Role } from '@prisma/client'

interface HeaderProps {
  user: {
    id: number
    username: string
    realName: string
    role: Role
    avatar?: string | null
  }
}

export function Header({ user }: HeaderProps) {
  const router = useRouter()
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const formatDate = () => {
    const now = new Date()
    const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
    return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${week}`
  }

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/auth/check', {
          method: 'GET',
          cache: 'no-store',
        })
        if (!res.ok) {
          if (checkIntervalRef.current) {
            clearInterval(checkIntervalRef.current)
          }
          alert('您的账号已在其他设备登录，您已被下线')
          router.push('/login')
          router.refresh()
        }
      } catch (err) {
        console.error('Session check error:', err)
      }
    }

    checkIntervalRef.current = setInterval(checkSession, 30000)

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [router])

  const handleLogout = async () => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current)
    }
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <div>
          <h2 className="text-base font-semibold text-gray-800 leading-tight">
            欢迎回来，{user.realName || user.username}
          </h2>
          <p className="text-xs text-gray-400" suppressHydrationWarning>{formatDate()}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <NotificationCenter onNavigate={(url) => router.push(url)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-gray-600">
                  {user.realName?.charAt(0) || user.username.charAt(0)}
                </span>
              </div>
              <span className="hidden md:inline text-sm">
                {user.realName || user.username}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>我的账户</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
              <User className="w-4 h-4 mr-2" />
              个人资料
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="w-4 h-4 mr-2" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
