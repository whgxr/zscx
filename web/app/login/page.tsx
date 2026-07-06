"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2, QrCode, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showWeChat, setShowWeChat] = useState(false)
  const [weChatQrCode, setWeChatQrCode] = useState('')
  const [weChatLoading, setWeChatLoading] = useState(false)
  const [weChatPolling, setWeChatPolling] = useState(false)
  const [weChatStatus, setWeChatStatus] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(data.message || '登录失败')
      }
    } catch (err) {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleWeChatLogin = async () => {
    setWeChatLoading(true)
    try {
      const res = await fetch('/api/auth/wechat/qrcode', {
        method: 'GET',
      })
      if (res.ok) {
        const data = await res.json()
        setWeChatQrCode(data.qrcode)
        setShowWeChat(true)
        setWeChatStatus('请使用微信扫码登录')
        startWeChatPolling(data.state)
      } else {
        setError('获取微信二维码失败')
      }
    } catch (err) {
      setError('微信登录暂不可用')
    } finally {
      setWeChatLoading(false)
    }
  }

  const startWeChatPolling = async (state: string) => {
    setWeChatPolling(true)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/wechat/callback?state=${state}`, {
          method: 'GET',
        })
        const data = await res.json()
        if (data.success) {
          clearInterval(interval)
          setWeChatPolling(false)
          setWeChatStatus('登录成功，正在跳转...')
          router.push('/dashboard')
          router.refresh()
        } else if (data.status === 'scanned') {
          setWeChatStatus('已扫码，请在手机上确认')
        } else if (data.status === 'expired') {
          clearInterval(interval)
          setWeChatPolling(false)
          setWeChatStatus('二维码已过期，请重新获取')
        }
      } catch (err) {
        console.error('WeChat polling error:', err)
      }
    }, 2000)

    return () => clearInterval(interval)
  }

  useEffect(() => {
    return () => {
      setWeChatPolling(false)
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">房屋征收调查系统</CardTitle>
          <CardDescription>请登录您的账户</CardDescription>
        </CardHeader>
        
        {showWeChat ? (
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">{weChatStatus}</p>
              {weChatQrCode && (
                <div className="flex justify-center">
                  <img src={weChatQrCode} alt="微信登录二维码" className="w-64 h-64" />
                </div>
              )}
              {weChatPolling && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  等待扫码...
                </div>
              )}
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setShowWeChat(false)}>
                返回密码登录
              </Button>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">用户名或手机号</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="请输入用户名或手机号"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请输入密码"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-md"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Eye className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登录中...
                  </>
                ) : (
                  '登 录'
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleWeChatLogin}
                disabled={weChatLoading}
              >
                <QrCode className="mr-2 h-4 w-4" />
                {weChatLoading ? '加载中...' : '微信扫码登录'}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  )
}
