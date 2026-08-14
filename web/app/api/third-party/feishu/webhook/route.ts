import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const challenge = searchParams.get('challenge')
    const type = searchParams.get('type')

    if (challenge) {
      return NextResponse.json({ challenge })
    }

    if (type === 'url_verification') {
      const token = searchParams.get('token')
      return NextResponse.json({ challenge: token || '' })
    }

    return NextResponse.json({ code: 0, msg: 'Feishu webhook endpoint is working' })
  } catch (error) {
    console.error('Feishu webhook GET error:', error)
    return NextResponse.json({ code: -1, msg: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, challenge, event, token } = body

    if (type === 'url_verification' && challenge) {
      return NextResponse.json({ challenge })
    }

    if (event) {
      console.log('Feishu webhook event:', JSON.stringify({
        type: event.type,
        open_id: event.open_id,
        event_id: event.event_id,
      }))
    }

    return NextResponse.json({ code: 0, msg: 'success' })
  } catch (error) {
    console.error('Feishu webhook POST error:', error)
    return NextResponse.json({ code: -1, msg: 'Internal server error' }, { status: 500 })
  }
}