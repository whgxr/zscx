"use client"

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, Loader2, Eye, EyeOff, MessageCircle, Smartphone, RefreshCw } from 'lucide-react'

interface LoginPlatform {
  platform: string
  enabled: boolean
}

const PLATFORM_CONFIG: Record<string, { name: string; icon: React.ComponentType<{ className?: string }> }> = {
  feishu: { name: '飞书', icon: MessageCircle },
  wework: { name: '企业微信', icon: Smartphone },
  dingtalk: { name: '钉钉', icon: MessageCircle }
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/h5/projects'
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

  const handleThirdPartyLogin = (platform: string) => {
    setError('')
    window.location.href = `/api/auth/third-party/${platform}`
  }

  const availablePlatforms = loginPlatforms.filter(p => p.enabled)

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
        router.push(redirectTo)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="text"
          placeholder="用户名或手机号"
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
          required
          className="h-12 text-base rounded-xl"
        />
      </div>
      <div className="relative">
        <Input
          type={showPassword ? 'text' : 'password'}
          placeholder="密码"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          required
          className="h-12 text-base rounded-xl pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5 text-gray-400" />
          ) : (
            <Eye className="w-5 h-5 text-gray-400" />
          )}
        </button>
      </div>
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="验证码"
          value={captchaCode}
          onChange={(e) => setCaptchaCode(e.target.value)}
          maxLength={4}
          autoComplete="off"
          className="h-12 text-base rounded-xl uppercase flex-1"
        />
        <button
          type="button"
          onClick={fetchCaptcha}
          title="点击刷新验证码"
          className="shrink-0 h-12 w-[120px] rounded-xl border overflow-hidden flex items-center justify-center bg-gray-50 cursor-pointer active:opacity-80"
        >
          {captchaImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={captchaImage} alt="验证码" className="h-full w-full object-cover" />
          ) : (
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
          )}
        </button>
      </div>
      {error && (
        <div className="text-sm text-red-500 bg-red-50 p-3 rounded-xl">
          {error}
        </div>
      )}
      <Button
        type="submit"
        className="w-full h-12 text-base rounded-xl"
        disabled={loading}
      >
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
        <div className="flex justify-center pt-2">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : availablePlatforms.length > 0 ? (
        <div className="pt-2">
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs text-gray-400">扫码登录</span>
            </div>
          </div>
          <div className="space-y-2">
            {availablePlatforms.map((platform) => {
              const config = PLATFORM_CONFIG[platform.platform]
              if (!config) return null
              const Icon = config.icon
              return (
                <Button
                  key={platform.platform}
                  type="button"
                  variant="outline"
                  className="w-full h-12 text-base rounded-xl"
                  onClick={() => handleThirdPartyLogin(platform.platform)}
                >
                  <Icon className="mr-2 h-5 w-5" />
                  {config.name}扫码登录
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
    </form>
  )
}

export default function H5LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-primary rounded-2xl shadow-lg mb-4">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">房屋征收调查系统</h1>
          <p className="text-gray-500 mt-2">移动端数据录入平台</p>
        </div>

        <Suspense fallback={<div className="text-center py-8 text-gray-400">加载中...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}