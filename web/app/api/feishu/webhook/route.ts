import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { type, challenge, token, event } = body

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
