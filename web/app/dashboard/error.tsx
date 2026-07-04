"use client"

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">页面加载出错</h2>
        <p className="text-gray-500 mb-4">
          {error.message || '服务器端发生了错误，请查看日志或重试'}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            错误码: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            重试
          </Button>
          <Button onClick={() => window.location.href = '/dashboard'}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  )
}
