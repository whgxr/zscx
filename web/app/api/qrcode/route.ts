import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const url = searchParams.get('url')
    const sizeParam = searchParams.get('size')

    if (!url) {
      return NextResponse.json({ message: 'url 参数为必填项' }, { status: 400 })
    }

    let size = 200
    if (sizeParam) {
      size = parseInt(sizeParam, 10)
      if (isNaN(size) || size < 50 || size > 500) {
        return NextResponse.json(
          { message: 'size 参数必须在 50-500 之间' },
          { status: 400 }
        )
      }
    }

    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width: size,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    })
  } catch (error) {
    console.error('Generate QR code error:', error)
    return NextResponse.json({ message: '生成二维码失败' }, { status: 500 })
  }
}
