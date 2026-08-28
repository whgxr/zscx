import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

/**
 * GET /api/export-templates/[id]/office-plugin/plugins.js
 * 提供 ONLYOFFICE 插件桥接脚本（window.Asc.plugin）。来源：DS 容器
 * /var/www/onlyoffice/documentserver/sdkjs-plugins/v1/plugins.js 的同源备份
 * public/plugins/zscx-field-insert/plugins.js。
 * 插件 index.html 位于同目录下相对引用 ./plugins.js，故走本路由保证同源可加载。
 */
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'plugins', 'zscx-field-insert', 'plugins.js')
    const content = fs.readFileSync(filePath, 'utf8')
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return new NextResponse(`Service Unavailable: ${e.message}`, {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' },
  })
}