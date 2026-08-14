import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createCaptchaId, generateCaptchaCode, saveCaptcha } from '@/lib/captcha-store'

// 防止该 GET 路由在构建时被静态化（验证码每次都要随机生成）
export const dynamic = 'force-dynamic'
export const revalidate = 0

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const CHAR_COLORS = ['#d62d20', '#0057e7', '#008744', '#f7b731', '#8e44ad', '#e84393', '#fa8231']
const BG_COLORS = ['#fef9e7', '#eafaf1', '#eaf2f8', '#fdf2e9', '#f5eef8']

function generateCaptchaSvg(code: string): string {
  const width = 130
  const height = 44
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
  parts.push(`<rect width="${width}" height="${height}" fill="${BG_COLORS[randomInt(0, BG_COLORS.length - 1)]}"/>`)

  // 干扰线
  for (let i = 0; i < 5; i++) {
    const color = CHAR_COLORS[randomInt(0, CHAR_COLORS.length - 1)]
    parts.push(
      `<line x1="${randomInt(0, width)}" y1="${randomInt(0, height)}" x2="${randomInt(0, width)}" y2="${randomInt(0, height)}" stroke="${color}" stroke-width="${randomInt(1, 2)}" opacity="0.45"/>`
    )
  }
  // 干扰点
  for (let i = 0; i < 30; i++) {
    const color = CHAR_COLORS[randomInt(0, CHAR_COLORS.length - 1)]
    parts.push(
      `<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" r="${randomInt(1, 2)}" fill="${color}" opacity="0.35"/>`
    )
  }
  // 字符（随机旋转、位置、颜色）
  const charWidth = width / code.length
  for (let i = 0; i < code.length; i++) {
    const x = Math.round(charWidth * i + charWidth / 2)
    const y = randomInt(28, 36)
    const rotation = randomInt(-28, 28)
    const color = CHAR_COLORS[randomInt(0, CHAR_COLORS.length - 1)]
    parts.push(
      `<text x="${x}" y="${y}" font-size="${randomInt(24, 28)}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="bold" fill="${color}" text-anchor="middle" transform="rotate(${rotation} ${x} ${y})">${code[i]}</text>`
    )
  }
  parts.push('</svg>')
  return parts.join('')
}

export async function GET(req: NextRequest) {
  try {
    const code = generateCaptchaCode(4)
    const captchaId = createCaptchaId()
    await saveCaptcha(captchaId, code)

    const svg = generateCaptchaSvg(code)
    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()

    return NextResponse.json({
      captchaId,
      image: `data:image/png;base64,${pngBuffer.toString('base64')}`,
    })
  } catch (error) {
    console.error('Generate captcha error:', error)
    return NextResponse.json({ message: '验证码生成失败' }, { status: 500 })
  }
}
