import { NextRequest, NextResponse } from 'next/server'
import { dingtalkService } from '@/lib/dingtalk'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)

    const msgSignature = req.headers.get('x-dingtalk-signature')
    const timestamp = req.headers.get('x-dingtalk-timestamp')

    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'DINGTALK' }
    })

    if (!config || config.status !== 'ENABLED') {
      return NextResponse.json({ error: '钉钉集成未启用' }, { status: 403 })
    }

    const extraConfig = config.extraConfig as { webhookSecret?: string } | null

    if (extraConfig?.webhookSecret && msgSignature && timestamp) {
      const crypto = require('crypto')
      const webhookSecret = extraConfig.webhookSecret
      const stringToSign = `${timestamp}\n${webhookSecret}`
      const sign = crypto.createHmac('sha256', webhookSecret)
        .update(stringToSign)
        .digest('base64')
      if (sign !== msgSignature) {
        return NextResponse.json({ error: '签名验证失败' }, { status: 403 })
      }
    }

    const event = params.get('event') || JSON.parse(body).EventType || ''
    
    return NextResponse.json({ 
      errcode: 0, 
      errmsg: 'ok',
      event_handled: event 
    })
  } catch (error) {
    console.error('DingTalk webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const challenge = searchParams.get('challenge')
  if (challenge) {
    return NextResponse.json({ challenge })
  }
  return NextResponse.json({ status: 'ok' })
}