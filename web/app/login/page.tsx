"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Loader2, Eye, EyeOff, MessageCircle, Smartphone, RefreshCw } from 'lucide-react'

interface LoginPlatform {
  platform: string
  enabled: boolean
}

const PLATFORM_CONFIG: Record<string, { name: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  feishu: { name: '飞书', icon: MessageCircle, color: 'bg-blue-500 hover:bg-blue-600' },
  wework: { name: '企业微信', icon: Smartphone, color: 'bg-green-500 hover:bg-green-600' },
  dingtalk: { name: '钉钉', icon: MessageCircle, color: 'bg-cyan-500 hover:bg-cyan-600' }
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loginPlatforms, setLoginPlatforms] = useState<LoginPlatform[]>([])
  const [platformsLoading, setPlatformsLoading] = useState(true)
  const [captchaId, setCaptchaId] = useState('')
  const [captchaImage, setCaptchaImage] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')

  const fetchCaptcha = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/captcha')
      if (res.ok) {
        const data = await res.json()
        setCaptchaId(data.captchaId)
        setCaptchaImage(data.image)
        setCaptchaCode('')
      }
    } catch (err) {
      console.error('Failed to load captcha:', err)
    }
  }, [])

  useEffect(() => {
    fetchCaptcha()
  }, [fetchCaptcha])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [])

  useEffect(() => {
    fetchPlatforms()
  }, [])

  const fetchPlatforms = async () => {
    try {
      const res = await fetch('/api/auth/third-party/platforms')
      if (res.ok) {
        const data = await res.json()
        setLoginPlatforms(data.platforms || [])
      }
    } catch (err) {
      console.error('Failed to fetch login platforms:', err)
    } finally {
      setPlatformsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          captchaId,
          captchaCode,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError(data.message || '登录失败')
        // 登录失败后刷新验证码
        fetchCaptcha()
      }
    } catch (err) {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleThirdPartyLogin = (platform: string) => {
    setError('')
    window.location.href = `/api/auth/third-party/${platform}`
  }

  const availablePlatforms = loginPlatforms.filter(p => p.enabled)

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
              <div className="space-y-2">
                <Label htmlFor="captcha">验证码</Label>
                <div className="flex gap-2">
                  <Input
                    id="captcha"
                    type="text"
                    placeholder="请输入验证码"
                    value={captchaCode}
                    onChange={(e) => setCaptchaCode(e.target.value)}
                    maxLength={4}
                    autoComplete="off"
                    className="uppercase flex-1"
                  />
                  <button
                    type="button"
                    onClick={fetchCaptcha}
                    title="点击刷新验证码"
                    className="shrink-0 h-10 w-[120px] rounded-md border overflow-hidden flex items-center justify-center bg-muted cursor-pointer hover:opacity-90"
                  >
                    {captchaImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={captchaImage} alt="验证码" className="h-full w-full object-cover" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
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

              {platformsLoading ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              ) : availablePlatforms.length > 0 ? (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">扫码登录</span>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {availablePlatforms.map((platform) => {
                      const config = PLATFORM_CONFIG[platform.platform]
                      if (!config) return null
                      const Icon = config.icon
                      return (
                        <Button
                          key={platform.platform}
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => handleThirdPartyLogin(platform.platform)}
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {config.name}扫码登录
                        </Button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </CardFooter>
          </form>
      </Card>
    </div>
  )
}
