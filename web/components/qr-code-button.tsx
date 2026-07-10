"use client"

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface QrCodeButtonProps {
  tableName: string
  recordId: number
}

export function QrCodeButton({ tableName, recordId }: QrCodeButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const viewUrl = `${window.location.origin}/view/${tableName}/${recordId}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(viewUrl)
    } catch {
      // Fallback for older browsers / non-HTTPS
      const textarea = document.createElement('textarea')
      textarea.value = viewUrl
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title="查看二维码"
      >
        <QrCode className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>记录二维码</DialogTitle>
            <DialogDescription>
              扫描二维码查看记录详情
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 bg-white rounded-lg border">
              <QRCodeSVG
                value={viewUrl}
                size={200}
                level="M"
                includeMargin={false}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              记录编号：#{recordId}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="w-full"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  复制链接
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
