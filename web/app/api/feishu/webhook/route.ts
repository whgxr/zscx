import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function verifyFeishuSignature(req: NextRequest, body: string): boolean {
  const appSecret = process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET
  if (!appSecret) {
    return false
  }

  const timestamp = req.headers.get('X-Lark-Request-Timestamp') || ''
  const nonce = req.headers.get('X-Lark-Request-Nonce') || ''
  const signature = req.headers.get('X-Lark-Signature') || ''

  if (!timestamp || !nonce || !signature) {
    return false
  }

  const stringToSign = `${timestamp}${nonce}${appSecret}${body}`
  const expectedSignature = crypto
    .createHash('sha256')
    .update(stringToSign)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text()

    if (!verifyFeishuSignature(req, bodyText)) {
      return NextResponse.json(
        { code: -1, message: 'Invalid signature' },
        { status: 401 }
      )
    }

    const body = JSON.parse(bodyText)
    const { type, challenge, event } = body

    if (type === 'url_verification') {
      return NextResponse.json({ challenge })
    }

    console.log('[Feishu Webhook] Received event:', { type, event: event?.type || 'unknown' })

    return NextResponse.json({ code: 0, message: 'success' })
  } catch (error) {
    console.error('[Feishu Webhook] Error:', error)
    return NextResponse.json(
      { code: -1, message: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ message: 'Feishu webhook endpoint is active' })
}
