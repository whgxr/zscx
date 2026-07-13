# ============================================================
# zscx-saas 项目初始化脚本
# 创建所有项目文件到 d:\开发征收项目\zscx-saas
# ============================================================

$base = "d:\开发征收项目\zscx-saas"

# 递归创建目录
function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Force -Path $path | Out-Null
    }
}

# 写入文件
function Write-File($path, $content) {
    $dir = Split-Path $path -Parent
    Ensure-Dir $dir
    $content | Out-File -FilePath $path -Encoding utf8
    Write-Host "  Created: $path"
}

Write-Host "=== Starting zscx-saas project scaffold ==="

# ==================== packages/shared ====================

Write-File "$base\packages\shared\package.json" @'
{
  "name": "@zscx/shared",
  "version": "2.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts",
    "clean": "rm -rf node_modules .turbo"
  },
  "dependencies": {
    "@prisma/client": "^5.18.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "prisma": "^5.18.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3"
  }
}
'@

Write-File "$base\packages\shared\tsconfig.json" @'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "prisma/**/*"]
}
'@

Write-File "$base\packages\shared\src\index.ts" @'
// @zscx/shared - 共享类型、常量和工具函数
export * from './types'
export * from './constants'
export * from './prisma'
'@

Write-File "$base\packages\shared\src\types.ts" @'
import { z } from 'zod'

// ==================== 通知渠道 ====================
export const NotificationChannel = {
  WECOM: 'WECOM',
  DINGTALK: 'DINGTALK',
  FEISHU: 'FEISHU',
  WECHAT: 'WECHAT',
  EMAIL: 'EMAIL',
} as const
export type NotificationChannel = typeof NotificationChannel[keyof typeof NotificationChannel]

export const CHANNEL_LABELS: Record<string, string> = {
  WECOM: '企业微信',
  DINGTALK: '钉钉',
  FEISHU: '飞书',
  WECHAT: '微信',
  EMAIL: '邮件',
}

// ==================== 通知参数 ====================
export interface NotificationParams {
  targetUserIds: string[]
  title: string
  content: string
  type: 'APPROVAL' | 'REJECT' | 'SUBMIT' | 'SYSTEM' | 'RETURNED'
  metadata?: {
    recordId?: number
    tableName?: string
    url?: string
    tenantCode?: string
  }
}

// ==================== 审批类型 ====================
export const ApproverType = {
  ROLE: 'ROLE',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  SPECIFIC_USER: 'SPECIFIC_USER',
} as const

export const APPROVER_TYPE_LABELS: Record<string, string> = {
  ROLE: '指定角色',
  DEPARTMENT_HEAD: '部门负责人',
  SPECIFIC_USER: '指定用户',
}

export const ApprovalAction = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
} as const

export const APPROVAL_ACTION_LABELS: Record<string, string> = {
  APPROVED: '通过',
  REJECTED: '驳回',
  RETURNED: '退回修改',
}

// ==================== 通知渠道配置 Schema ====================
export const wecomConfigSchema = z.object({
  corpId: z.string().min(1, '企业ID不能为空'),
  agentId: z.string().min(1, '应用ID不能为空'),
  secret: z.string().min(1, '应用Secret不能为空'),
})

export const dingtalkConfigSchema = z.object({
  appKey: z.string().min(1, 'AppKey不能为空'),
  appSecret: z.string().min(1, 'AppSecret不能为空'),
  webhookUrl: z.string().url('Webhook地址格式不正确').optional(),
})

export const feishuConfigSchema = z.object({
  appId: z.string().min(1, 'App ID不能为空'),
  appSecret: z.string().min(1, 'App Secret不能为空'),
  webhookUrl: z.string().url('Webhook地址格式不正确').optional(),
})

export const wechatConfigSchema = z.object({
  appId: z.string().min(1, 'AppID不能为空'),
  appSecret: z.string().min(1, 'AppSecret不能为空'),
  templateId: z.string().optional(), // 模板消息ID
})

export const emailConfigSchema = z.object({
  smtpHost: z.string().min(1, 'SMTP服务器不能为空'),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string().min(1, '邮箱账号不能为空'),
  smtpPass: z.string().min(1, '邮箱密码不能为空'),
  fromName: z.string().optional(),
})

export type WeComConfig = z.infer<typeof wecomConfigSchema>
export type DingTalkConfig = z.infer<typeof dingtalkConfigSchema>
export type FeishuConfig = z.infer<typeof feishuConfigSchema>
export type WeChatConfig = z.infer<typeof wechatConfigSchema>
export type EmailConfig = z.infer<typeof emailConfigSchema>
'@

Write-File "$base\packages\shared\src\constants.ts" @'
// 角色标签
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: '超级管理员',
  MANAGER: '管理员',
  USER: '录入员',
  VIEWER: '查看员',
}

// 记录状态标签
export const RECORD_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

// 记录状态颜色
export const RECORD_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-600',
  REVIEWED: 'bg-green-100 text-green-600',
  REJECTED: 'bg-red-100 text-red-600',
  ARCHIVED: 'bg-gray-200 text-gray-500',
}

// 缓存Key前缀
export const CACHE_KEYS = {
  USER_SESSION: 'session:',
  USER_PERMISSIONS: 'perm:',
  TENANT_CONFIG: 'tenant:',
  NOTIFICATION_LOCK: 'notify:lock:',
  APPROVAL_CACHE: 'approval:',
}
'@

Write-File "$base\packages\shared\src\prisma.ts" @'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
'@

Write-Host "`n=== packages/shared done ==="
Write-Host "`n=== Creating apps/server ==="

# ==================== apps/server ====================

Write-File "$base\apps\server\package.json" @'
{
  "name": "@zscx/server",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint",
    "clean": "rm -rf .next node_modules .turbo"
  },
  "dependencies": {
    "@zscx/shared": "workspace:*",
    "@prisma/client": "^5.18.0",
    "bcryptjs": "^2.4.3",
    "ioredis": "^5.4.1",
    "jsonwebtoken": "^9.0.2",
    "next": "14.2.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.10",
    "prisma": "^5.18.0",
    "typescript": "^5.5.3"
  }
}
'@

Write-File "$base\apps\server\tsconfig.json" @'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@

Write-File "$base\apps\server\next.config.js" @'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 纯 API 服务，不需要前端页面
  pageExtensions: [],
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'ioredis'],
  },
  output: 'standalone',
}

module.exports = nextConfig
'@

Write-File "$base\apps\server\.env" @'
DATABASE_URL="mysql://root:root123456@localhost:3308/zscx_saas?schema=public"
JWT_SECRET="zscx-saas-jwt-secret-change-in-production"
JWT_EXPIRES_IN="7d"
REDIS_URL="redis://localhost:6379"
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="zscx-saas"
MINIO_USE_SSL="false"
'@

# ==================== apps/server/lib ====================

Write-File "$base\apps\server\src\lib\prisma.ts" @'
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
'@

Write-File "$base\apps\server\src\lib\redis.ts" @'
import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null
    return Math.min(times * 200, 2000)
  },
  lazyConnect: true,
})

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis
}

// 缓存辅助函数
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const val = await redis.get(key)
      return val ? JSON.parse(val) : null
    } catch {
      return null
    }
  },

  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
    } catch (e) {
      console.error('[Redis] set error:', e)
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key)
    } catch (e) {
      console.error('[Redis] del error:', e)
    }
  },

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
    } catch (e) {
      console.error('[Redis] delPattern error:', e)
    }
  },
}
'@

Write-File "$base\apps\server\src\lib\auth.ts" @'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies, headers } from 'next/headers'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'zscx-saas-default-jwt-secret'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface JwtPayload {
  userId: number
  username: string
  roleId: number
  tenantId: number
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any)
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const cookieStore = cookies()
  let token = cookieStore.get('token')?.value

  if (!token) {
    const headerStore = headers()
    const authHeader = headerStore.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
  }

  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { role: true, tenant: true, department: true },
  })

  if (!user || user.status !== 'ACTIVE') return null
  return user
}

export function setTokenCookie(token: string) {
  const cookieStore = cookies()
  cookieStore.set('token', token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
}

export function clearTokenCookie() {
  const cookieStore = cookies()
  cookieStore.delete('token')
}
'@

Write-Host "`n=== Creating Notification Service ==="

# ==================== Notification Service ====================

Write-File "$base\apps\server\src\lib\notification\types.ts" @'
export interface NotificationChannel {
  name: string
  send(params: NotificationParams): Promise<boolean>
  test(config: any): Promise<{ success: boolean; message: string }>
}

export interface NotificationParams {
  targetUserIds: string[]
  title: string
  content: string
  type: 'APPROVAL' | 'REJECT' | 'SUBMIT' | 'SYSTEM' | 'RETURNED'
  metadata?: {
    recordId?: number
    tableName?: string
    url?: string
    tenantCode?: string
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\wecom.ts" @'
import { NotificationChannel, NotificationParams } from './types'

export class WeComChannel implements NotificationChannel {
  name = 'WECOM'

  async send(params: NotificationParams): Promise<boolean> {
    // TODO: 企业微信应用消息发送
    // 1. 获取 access_token
    // 2. 调用 /cgi-bin/message/send 发送 textcard 消息
    console.log(`[WeCom] Sending notification: ${params.title} to ${params.targetUserIds.join(',')}`)
    return true
  }

  async test(config: any): Promise<{ success: boolean; message: string }> {
    try {
      const { corpId, secret } = config
      const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`)
      const data = await res.json()
      if (data.errcode === 0) {
        return { success: true, message: '企业微信连接成功' }
      }
      return { success: false, message: `企业微信错误: ${data.errmsg}` }
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message}` }
    }
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\dingtalk.ts" @'
import { NotificationChannel, NotificationParams } from './types'

export class DingTalkChannel implements NotificationChannel {
  name = 'DINGTALK'

  async send(params: NotificationParams): Promise<boolean> {
    // TODO: 钉钉工作通知/机器人消息发送
    // 1. 机器人 Webhook: POST webhook_url
    // 2. 工作通知: 获取 access_token → 调用 /topapi/message/corpconversation/asyncsend_v2
    console.log(`[DingTalk] Sending notification: ${params.title} to ${params.targetUserIds.join(',')}`)
    return true
  }

  async test(config: any): Promise<{ success: boolean; message: string }> {
    try {
      if (config.webhookUrl) {
        const res = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msgtype: 'text', text: { content: '连接测试' } }),
        })
        const data = await res.json()
        if (data.errcode === 0) {
          return { success: true, message: '钉钉机器人连接成功' }
        }
        return { success: false, message: `钉钉错误: ${data.errmsg}` }
      }
      return { success: true, message: '钉钉配置已保存' }
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message}` }
    }
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\feishu.ts" @'
import { NotificationChannel, NotificationParams } from './types'

export class FeishuChannel implements NotificationChannel {
  name = 'FEISHU'

  async send(params: NotificationParams): Promise<boolean> {
    // TODO: 飞书消息卡片发送
    // 1. 获取 tenant_access_token
    // 2. 调用 /open-apis/im/v1/messages 发送 interactive 卡片消息
    console.log(`[Feishu] Sending notification: ${params.title} to ${params.targetUserIds.join(',')}`)
    return true
  }

  async test(config: any): Promise<{ success: boolean; message: string }> {
    try {
      const { appId, appSecret } = config
      const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      })
      const data = await res.json()
      if (data.tenant_access_token) {
        return { success: true, message: '飞书连接成功' }
      }
      return { success: false, message: `飞书错误: ${data.msg}` }
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message}` }
    }
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\wechat.ts" @'
import { NotificationChannel, NotificationParams } from './types'

export class WeChatChannel implements NotificationChannel {
  name = 'WECHAT'

  async send(params: NotificationParams): Promise<boolean> {
    // TODO: 微信公众号模板消息/小程序订阅消息
    // 1. 获取 access_token
    // 2. 调用 /cgi-bin/message/template/send 发送模板消息
    console.log(`[WeChat] Sending notification: ${params.title} to ${params.targetUserIds.join(',')}`)
    return true
  }

  async test(config: any): Promise<{ success: boolean; message: string }> {
    try {
      const { appId, appSecret } = config
      const res = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`)
      const data = await res.json()
      if (data.access_token) {
        return { success: true, message: '微信公众号连接成功' }
      }
      return { success: false, message: `微信错误: ${data.errmsg}` }
    } catch (e: any) {
      return { success: false, message: `连接失败: ${e.message}` }
    }
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\email.ts" @'
import { NotificationChannel, NotificationParams } from './types'

export class EmailChannel implements NotificationChannel {
  name = 'EMAIL'

  async send(params: NotificationParams): Promise<boolean> {
    // TODO: 邮件通知
    // 使用 nodemailer 发送邮件
    console.log(`[Email] Sending notification: ${params.title} to ${params.targetUserIds.join(',')}`)
    return true
  }

  async test(config: any): Promise<{ success: boolean; message: string }> {
    return { success: true, message: '邮件配置已保存（测试发送需安装 nodemailer）' }
  }
}
'@

Write-File "$base\apps\server\src\lib\notification\index.ts" @'
import { prisma } from '../prisma'
import { WeComChannel } from './wecom'
import { DingTalkChannel } from './dingtalk'
import { FeishuChannel } from './feishu'
import { WeChatChannel } from './wechat'
import { EmailChannel } from './email'
import { NotificationChannel, NotificationParams } from './types'

export type { NotificationChannel, NotificationParams }

// 渠道注册表
const channelRegistry: Record<string, NotificationChannel> = {
  WECOM: new WeComChannel(),
  DINGTALK: new DingTalkChannel(),
  FEISHU: new FeishuChannel(),
  WECHAT: new WeChatChannel(),
  EMAIL: new EmailChannel(),
}

export function getChannel(name: string): NotificationChannel | undefined {
  return channelRegistry[name]
}

export function getAllChannels(): { name: string; label: string }[] {
  return [
    { name: 'WECOM', label: '企业微信' },
    { name: 'DINGTALK', label: '钉钉' },
    { name: 'FEISHU', label: '飞书' },
    { name: 'WECHAT', label: '微信' },
    { name: 'EMAIL', label: '邮件' },
  ]
}

// 统一通知服务
export async function sendNotification(
  tenantId: number,
  type: NotificationParams['type'],
  title: string,
  content: string,
  targetUserIds: string[],
  metadata?: NotificationParams['metadata']
) {
  // 获取租户启用的通知渠道
  const configs = await prisma.notificationConfig.findMany({
    where: { tenantId, isEnabled: true },
  })

  const results: { channel: string; success: boolean; error?: string }[] = []

  for (const config of configs) {
    const channel = channelRegistry[config.channel]
    if (!channel) continue

    try {
      // 分布式锁：防止同一通知重复发送
      const lockKey = `notify:lock:${tenantId}:${type}:${metadata?.recordId || ''}`
      // 简化版：直接发送（生产环境应使用 Redis 分布式锁）

      const success = await channel.send({
        targetUserIds,
        title,
        content,
        type,
        metadata,
      })

      // 记录通知日志
      await prisma.notificationLog.create({
        data: {
          tenantId,
          userId: targetUserIds[0] ? parseInt(targetUserIds[0]) : 0,
          channel: config.channel,
          type,
          title,
          content,
          status: success ? 'SENT' : 'FAILED',
          metadata: metadata || {},
        },
      })

      results.push({ channel: config.channel, success })
    } catch (e: any) {
      results.push({ channel: config.channel, success: false, error: e.message })
    }
  }

  return results
}

// 测试通知渠道连接
export async function testChannel(channelName: string, config: any): Promise<{ success: boolean; message: string }> {
  const channel = channelRegistry[channelName]
  if (!channel) {
    return { success: false, message: `未知渠道: ${channelName}` }
  }
  return channel.test(config)
}
'@

Write-Host "`n=== Creating API Routes ==="

# ==================== API Routes ====================

# Auth API
Write-File "$base\apps\server\src\app\api\auth\login\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, generateToken, setTokenCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password, tenantCode } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ message: '请输入用户名和密码' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { role: true, tenant: true },
    })

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json({ message: '用户名或密码错误' }, { status: 401 })
    }

    if (tenantCode && user.tenant.code !== tenantCode) {
      return NextResponse.json({ message: '租户不匹配' }, { status: 401 })
    }

    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ message: '用户名或密码错误' }, { status: 401 })
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
      tenantId: user.tenantId,
    })

    setTokenCookie(token)

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        tenant: user.tenant,
        department: user.departmentId,
      },
      token,
    })
  } catch (e) {
    console.error('Login error:', e)
    return NextResponse.json({ message: '登录失败' }, { status: 500 })
  }
}
'@

Write-File "$base\apps\server\src\app\api\auth\me\route.ts" @'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 })
  }
  return NextResponse.json({ user })
}
'@

Write-File "$base\apps\server\src\app\api\auth\logout\route.ts" @'
import { NextResponse } from 'next/server'
import { clearTokenCookie } from '@/lib/auth'

export async function POST() {
  clearTokenCookie()
  return NextResponse.json({ success: true })
}
'@

# Departments API
Write-File "$base\apps\server\src\app\api\departments\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const departments = await prisma.department.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { sortOrder: 'asc' },
      include: {
        manager: { select: { id: true, realName: true } },
        _count: { select: { users: true } },
      },
    })

    return NextResponse.json({ departments: buildTree(departments) })
  } catch (e) {
    console.error('Get departments error:', e)
    return NextResponse.json({ message: '获取部门列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { name, parentId, managerId, sortOrder } = await req.json()
    if (!name) return NextResponse.json({ message: '部门名称不能为空' }, { status: 400 })

    const dept = await prisma.department.create({
      data: { tenantId: user.tenantId, name, parentId: parentId || null, managerId: managerId || null, sortOrder: sortOrder || 0 },
    })

    return NextResponse.json({ department: dept })
  } catch (e) {
    console.error('Create department error:', e)
    return NextResponse.json({ message: '创建部门失败' }, { status: 500 })
  }
}

function buildTree(list: any[]) {
  const map = new Map()
  const roots: any[] = []
  list.forEach(item => { map.set(item.id, { ...item, children: [] }) })
  list.forEach(item => {
    const node = map.get(item.id)
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}
'@

Write-File "$base\apps\server\src\app\api\departments\[id]\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { name, parentId, managerId, sortOrder } = await req.json()
    const dept = await prisma.department.update({
      where: { id: parseInt(params.id) },
      data: { name, parentId: parentId || null, managerId: managerId || null, sortOrder },
    })

    return NextResponse.json({ department: dept })
  } catch (e) {
    console.error('Update department error:', e)
    return NextResponse.json({ message: '更新部门失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    const childCount = await prisma.department.count({ where: { parentId: id } })
    if (childCount > 0) {
      return NextResponse.json({ message: '请先删除子部门' }, { status: 400 })
    }

    await prisma.department.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Delete department error:', e)
    return NextResponse.json({ message: '删除部门失败' }, { status: 500 })
  }
}
'@

# Notification Config API
Write-File "$base\apps\server\src\app\api\notifications\config\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getAllChannels, testChannel } from '@/lib/notification'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const configs = await prisma.notificationConfig.findMany({
      where: { tenantId: user.tenantId },
    })

    const channels = getAllChannels().map(ch => {
      const cfg = configs.find(c => c.channel === ch.name)
      return {
        ...ch,
        isEnabled: cfg?.isEnabled || false,
        config: cfg?.config || null,
      }
    })

    return NextResponse.json({ channels })
  } catch (e) {
    console.error('Get notification config error:', e)
    return NextResponse.json({ message: '获取通知配置失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { channel, isEnabled, config } = await req.json()

    await prisma.notificationConfig.upsert({
      where: { tenantId_channel: { tenantId: user.tenantId, channel } },
      create: { tenantId: user.tenantId, channel, isEnabled, config },
      update: { isEnabled, config },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Update notification config error:', e)
    return NextResponse.json({ message: '更新通知配置失败' }, { status: 500 })
  }
}
'@

Write-File "$base\apps\server\src\app\api\notifications\test\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { testChannel } from '@/lib/notification'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { channel, config } = await req.json()
    const result = await testChannel(channel, config)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Test notification error:', e)
    return NextResponse.json({ message: '测试失败' }, { status: 500 })
  }
}
'@

# Approval API
Write-File "$base\apps\server\src\app\api\approval\flows\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')

    const flows = await prisma.approvalFlow.findMany({
      where: { tenantId: user.tenantId, ...(tableId ? { tableId: parseInt(tableId) } : {}) },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        table: { select: { id: true, name: true, label: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ flows })
  } catch (e) {
    console.error('Get approval flows error:', e)
    return NextResponse.json({ message: '获取审批流程失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { tableId, name, steps } = await req.json()
    if (!tableId || !name) {
      return NextResponse.json({ message: '参数不完整' }, { status: 400 })
    }

    const flow = await prisma.approvalFlow.create({
      data: {
        tenantId: user.tenantId,
        tableId,
        name,
        steps: {
          create: steps.map((s: any, i: number) => ({
            stepOrder: i + 1,
            approverType: s.approverType,
            approverId: s.approverId || null,
            approverRole: s.approverRole || null,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    })

    return NextResponse.json({ flow })
  } catch (e) {
    console.error('Create approval flow error:', e)
    return NextResponse.json({ message: '创建审批流程失败' }, { status: 500 })
  }
}
'@

Write-File "$base\apps\server\src\app\api\approval\pending\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const records = await prisma.dataRecord.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'SUBMITTED',
        approvalFlow: { steps: { some: { approverId: user.id } } },
      },
      include: {
        table: { select: { id: true, name: true, label: true } },
        creator: { select: { id: true, realName: true } },
        approvalFlow: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ records })
  } catch (e) {
    console.error('Get pending approvals error:', e)
    return NextResponse.json({ message: '获取待审批列表失败' }, { status: 500 })
  }
}
'@

Write-File "$base\apps\server\src\app\api\approval\action\route.ts" @'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { sendNotification } from '@/lib/notification'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const { recordId, action, comment } = await req.json()
    if (!recordId || !action) {
      return NextResponse.json({ message: '参数不完整' }, { status: 400 })
    }

    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
      include: { approvalFlow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } }, creator: true, table: true },
    })

    if (!record || record.tenantId !== user.tenantId) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    // 创建审批记录
    await prisma.approvalRecord.create({
      data: {
        recordId,
        stepId: record.approvalFlow?.steps[record.currentStep || 0]?.id || 0,
        approverId: user.id,
        action,
        comment: comment || null,
      },
    })

    // 更新记录状态
    let newStatus: string = record.status
    if (action === 'APPROVED') {
      const totalSteps = record.approvalFlow?.steps.length || 0
      const nextStep = (record.currentStep || 0) + 1
      if (nextStep >= totalSteps) {
        newStatus = 'REVIEWED'
      }
    } else if (action === 'REJECTED') {
      newStatus = 'REJECTED'
    } else if (action === 'RETURNED') {
      newStatus = 'DRAFT'
    }

    await prisma.dataRecord.update({
      where: { id: recordId },
      data: {
        status: newStatus as any,
        currentStep: action === 'APPROVED' ? (record.currentStep || 0) + 1 : record.currentStep,
      },
    })

    // 发送通知
    const notifyUserId = action === 'APPROVED' ? record.createdBy : record.createdBy
    await sendNotification(
      user.tenantId,
      action === 'APPROVED' ? 'APPROVAL' : 'REJECT',
      `审批${action === 'APPROVED' ? '通过' : '驳回'}`,
      `【${record.table.label}】记录已${action === 'APPROVED' ? '通过' : '驳回'}${comment ? `，原因：${comment}` : ''}`,
      [String(notifyUserId)],
      { recordId, tableName: record.table.name, tenantCode: '' }
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Approval action error:', e)
    return NextResponse.json({ message: '审批操作失败' }, { status: 500 })
  }
}
'@

Write-Host "`n=== apps/server done ==="
Write-Host "`n=== Creating apps/web (Dashboard) ==="

# ==================== apps/web ====================

Write-File "$base\apps\web\package.json" @'
{
  "name": "@zscx/web",
  "version": "2.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002",
    "lint": "next lint",
    "clean": "rm -rf .next node_modules .turbo"
  },
  "dependencies": {
    "@zscx/shared": "workspace:*",
    "lucide-react": "^0.400.0",
    "next": "14.2.5",
    "next-themes": "^0.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tailwind-merge": "^2.3.0",
    "tailwindcss-animate": "^1.0.7",
    "zod": "^3.23.8",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "@radix-ui/react-dialog": "^1.1.1",
    "@radix-ui/react-dropdown-menu": "^2.1.1",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-select": "^2.1.1",
    "@radix-ui/react-separator": "^1.1.11",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-toast": "^1.2.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.39",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3"
  }
}
'@

Write-File "$base\apps\web\tsconfig.json" @'
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
'@

Write-File "$base\apps\web\next.config.js" @'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
    ]
  },
}

module.exports = nextConfig
'@

Write-File "$base\apps\web\tailwind.config.js" @'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: { extend: {} },
  plugins: [require('tailwindcss-animate')],
}
'@

Write-File "$base\apps\web\postcss.config.js" @'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
'@

Write-File "$base\apps\web\src\app\globals.css" @'
@tailwind base;
@tailwind components;
@tailwind utilities;
'@

Write-File "$base\apps\web\src\app\layout.tsx" @'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ZSCX SaaS - 管理后台',
  description: '房屋征收调查系统 SaaS 管理后台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
'@

Write-File "$base\apps\web\src\app\page.tsx" @'
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
'@

Write-File "$base\apps\web\src\app\dashboard\layout.tsx" @'
import Link from 'next/link'
import { Building2, Users, Shield, Bell, GitBranch, Database, Settings, LogOut } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: '概览', icon: Building2 },
  { href: '/dashboard/departments', label: '组织架构', icon: Users },
  { href: '/dashboard/projects', label: '项目管理', icon: Database },
  { href: '/dashboard/approval', label: '审批流程', icon: GitBranch },
  { href: '/dashboard/notifications', label: '通知配置', icon: Bell },
  { href: '/dashboard/permissions', label: '权限管理', icon: Shield },
  { href: '/dashboard/settings', label: '系统设置', icon: Settings },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <aside className="w-60 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold text-primary">ZSCX SaaS</h1>
          <p className="text-xs text-gray-400">房屋征收调查系统</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900">
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="p-3 border-t">
          <button className="flex items-center gap-3 px-3 py-2 text-sm text-red-500 rounded-lg hover:bg-red-50 w-full">
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
'@

Write-File "$base\apps\web\src\app\dashboard\page.tsx" @'
export default function DashboardPage() {
  const stats = [
    { label: '租户数', value: '--', color: 'bg-blue-500' },
    { label: '用户数', value: '--', color: 'bg-green-500' },
    { label: '项目数', value: '--', color: 'bg-purple-500' },
    { label: '记录数', value: '--', color: 'bg-orange-500' },
  ]

  return (
    <div>
      <h2 className="text-xl font-bold mb-6">系统概览</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm">
            <div className={`w-3 h-3 rounded-full ${s.color} mb-2`} />
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-base font-semibold mb-4">快速入口</h3>
        <div className="grid grid-cols-3 gap-4">
          <a href="/dashboard/departments" className="p-4 border rounded-xl hover:border-primary hover:bg-primary/5">
            <h4 className="font-medium">组织架构</h4>
            <p className="text-sm text-gray-500 mt-1">管理部门的组织结构</p>
          </a>
          <a href="/dashboard/projects" className="p-4 border rounded-xl hover:border-primary hover:bg-primary/5">
            <h4 className="font-medium">项目管理</h4>
            <p className="text-sm text-gray-500 mt-1">创建和管理数据项目</p>
          </a>
          <a href="/dashboard/notifications" className="p-4 border rounded-xl hover:border-primary hover:bg-primary/5">
            <h4 className="font-medium">通知配置</h4>
            <p className="text-sm text-gray-500 mt-1">配置微信/钉钉/飞书通知</p>
          </a>
        </div>
      </div>
    </div>
  )
}
'@

# Notification Config Page
Write-File "$base\apps\web\src\app\dashboard\notifications\page.tsx" @'
'use client'

import { useState, useEffect } from 'react'
import { Bell, Power, Settings, Loader2, CheckCircle, XCircle } from 'lucide-react'

const channelMeta: Record<string, { label: string; desc: string; icon: string }> = {
  WECOM: { label: '企业微信', desc: '通过企业微信应用发送工作通知', icon: '🔷' },
  DINGTALK: { label: '钉钉', desc: '通过钉钉机器人或工作通知发送消息', icon: '🔶' },
  FEISHU: { label: '飞书', desc: '通过飞书机器人发送交互式卡片消息', icon: '🔵' },
  WECHAT: { label: '微信', desc: '通过公众号模板消息或小程序订阅消息', icon: '🟢' },
  EMAIL: { label: '邮件', desc: '通过SMTP邮件服务器发送通知', icon: '📧' },
}

export default function NotificationsPage() {
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [activeChannel, setActiveChannel] = useState<string | null>(null)
  const [configForms, setConfigForms] = useState<Record<string, any>>({})

  useEffect(() => {
    fetch('/api/notifications/config')
      .then(r => r.json())
      .then(data => {
        setChannels(data.channels || [])
        const forms: Record<string, any> = {}
        data.channels?.forEach((ch: any) => {
          forms[ch.name] = ch.config || {}
        })
        setConfigForms(forms)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (channel: string, enabled: boolean) => {
    setSaving(channel)
    await fetch('/api/notifications/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, isEnabled: enabled, config: configForms[channel] }),
    })
    setChannels(prev => prev.map(ch => ch.name === channel ? { ...ch, isEnabled: enabled } : ch))
    setSaving(null)
  }

  const handleSaveConfig = async (channel: string) => {
    setSaving(channel)
    await fetch('/api/notifications/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, isEnabled: channels.find(c => c.name === channel)?.isEnabled, config: configForms[channel] }),
    })
    setSaving(null)
    setActiveChannel(null)
  }

  const handleTest = async (channel: string) => {
    setTesting(channel)
    const res = await fetch('/api/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, config: configForms[channel] }),
    })
    const data = await res.json()
    alert(data.success ? `测试成功: ${data.message}` : `测试失败: ${data.message}`)
    setTesting(null)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">加载中...</div>

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">通知配置</h2>
      <p className="text-sm text-gray-500 mb-6">配置多渠道通知，数据提交后自动推送到对应平台</p>

      <div className="space-y-4">
        {channels.map((ch: any) => {
          const meta = channelMeta[ch.name] || { label: ch.name, desc: '', icon: '📌' }
          return (
            <div key={ch.name} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{meta.icon}</span>
                  <div>
                    <h3 className="font-medium">{meta.label}</h3>
                    <p className="text-sm text-gray-500">{meta.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveChannel(activeChannel === ch.name ? null : ch.name)}
                    className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5" />配置
                  </button>
                  <button
                    onClick={() => handleToggle(ch.name, !ch.isEnabled)}
                    disabled={saving === ch.name}
                    className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${
                      ch.isEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {saving === ch.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                    {ch.isEnabled ? '已启用' : '已禁用'}
                  </button>
                </div>
              </div>

              {activeChannel === ch.name && (
                <div className="border-t p-4 bg-gray-50">
                  {ch.name === 'WECOM' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">企业ID (CorpId)</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="ww..." value={configForms[ch.name]?.corpId || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], corpId: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">应用ID (AgentId)</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="1000001" value={configForms[ch.name]?.agentId || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], agentId: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">应用Secret</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" type="password" placeholder="****" value={configForms[ch.name]?.secret || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], secret: e.target.value } })} />
                      </div>
                      <p className="text-xs text-gray-400">在企业微信管理后台 → 应用管理 → 自建应用 中获取以上信息</p>
                    </div>
                  )}
                  {ch.name === 'DINGTALK' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">AppKey</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="ding..." value={configForms[ch.name]?.appKey || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appKey: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">AppSecret</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" type="password" placeholder="****" value={configForms[ch.name]?.appSecret || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appSecret: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">机器人Webhook地址（可选）</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." value={configForms[ch.name]?.webhookUrl || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], webhookUrl: e.target.value } })} />
                      </div>
                      <p className="text-xs text-gray-400">在钉钉开放平台 → 应用开发 中创建应用获取AppKey和AppSecret</p>
                    </div>
                  )}
                  {ch.name === 'FEISHU' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">App ID</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="cli_..." value={configForms[ch.name]?.appId || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appId: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">App Secret</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" type="password" placeholder="****" value={configForms[ch.name]?.appSecret || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appSecret: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">机器人Webhook地址（可选）</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." value={configForms[ch.name]?.webhookUrl || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], webhookUrl: e.target.value } })} />
                      </div>
                      <p className="text-xs text-gray-400">在飞书开放平台 → 创建企业自建应用 中获取App ID和App Secret</p>
                    </div>
                  )}
                  {ch.name === 'WECHAT' && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium">AppID</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="wx..." value={configForms[ch.name]?.appId || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appId: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">AppSecret</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" type="password" placeholder="****" value={configForms[ch.name]?.appSecret || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], appSecret: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">模板消息ID（可选）</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="用于公众号模板消息" value={configForms[ch.name]?.templateId || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], templateId: e.target.value } })} />
                      </div>
                      <p className="text-xs text-gray-400">在微信公众平台 → 开发 → 基本配置 中获取AppID和AppSecret</p>
                    </div>
                  )}
                  {ch.name === 'EMAIL' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium">SMTP服务器</label>
                          <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="smtp.example.com" value={configForms[ch.name]?.smtpHost || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], smtpHost: e.target.value } })} />
                        </div>
                        <div>
                          <label className="text-sm font-medium">端口</label>
                          <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="587" type="number" value={configForms[ch.name]?.smtpPort || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], smtpPort: parseInt(e.target.value) } })} />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">邮箱账号</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" placeholder="user@example.com" value={configForms[ch.name]?.smtpUser || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], smtpUser: e.target.value } })} />
                      </div>
                      <div>
                        <label className="text-sm font-medium">邮箱密码/授权码</label>
                        <input className="w-full h-10 px-3 text-sm border rounded-lg mt-1" type="password" placeholder="****" value={configForms[ch.name]?.smtpPass || ''} onChange={e => setConfigForms({ ...configForms, [ch.name]: { ...configForms[ch.name], smtpPass: e.target.value } })} />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleSaveConfig(ch.name)}
                      disabled={saving === ch.name}
                      className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-1"
                    >
                      {saving === ch.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      保存配置
                    </button>
                    <button
                      onClick={() => handleTest(ch.name)}
                      disabled={testing === ch.name}
                      className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 flex items-center gap-1"
                    >
                      {testing === ch.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      测试连接
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
'@

Write-Host "`n=== apps/web done ==="
Write-Host "`n=== Creating Docker Compose ==="

# ==================== Docker Compose ====================

Write-File "$base\docker\docker-compose.yml" @'
version: '3.8'

services:
  # MySQL 5.5 兼容数据库
  mysql:
    image: mysql:5.7
    container_name: zscx-saas-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root123456
      MYSQL_DATABASE: zscx_saas
      MYSQL_CHARSET: utf8mb4
      MYSQL_COLLATION: utf8mb4_unicode_ci
    ports:
      - "3308:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./mysql/init.sql:/docker-entrypoint-initdb.d/init.sql
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max_allowed_packet=256M
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis 缓存
  redis:
    image: redis:7-alpine
    container_name: zscx-saas-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
      - ./redis/redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # MinIO 对象存储
  minio:
    image: minio/minio:latest
    container_name: zscx-saas-minio
    restart: unless-stopped
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Server
  server:
    build:
      context: ..
      dockerfile: docker/Dockerfile.server
    container_name: zscx-saas-server
    restart: unless-stopped
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: mysql://root:root123456@mysql:3306/zscx_saas?schema=public
      JWT_SECRET: zscx-saas-jwt-secret-change-in-production
      JWT_EXPIRES_IN: 7d
      REDIS_URL: redis://redis:6379
      MINIO_ENDPOINT: minio
      MINIO_PORT: "9000"
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_BUCKET: zscx-saas
      MINIO_USE_SSL: "false"
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy

  # Web Dashboard
  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile.web
    container_name: zscx-saas-web
    restart: unless-stopped
    ports:
      - "3002:3002"
    environment:
      API_URL: http://server:3001
    depends_on:
      - server

  # H5 Mobile
  h5:
    build:
      context: ..
      dockerfile: docker/Dockerfile.h5
    container_name: zscx-saas-h5
    restart: unless-stopped
    ports:
      - "3003:3003"
    environment:
      API_URL: http://server:3001
    depends_on:
      - server

volumes:
  mysql_data:
  redis_data:
  minio_data:
'@

Write-File "$base\docker\redis\redis.conf" @'
# Redis 配置文件
port 6379
bind 0.0.0.0
protected-mode no

# 内存管理
maxmemory 256mb
maxmemory-policy allkeys-lru

# 持久化
save 900 1
save 300 10
save 60 10000
dbfilename dump.rdb
dir /data

# 日志
loglevel notice
logfile ""
'@

Write-File "$base\docker\Dockerfile.server" @'
FROM node:20-alpine AS base

# 安装依赖
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
RUN corepack enable && pnpm install --frozen-lockfile

# 构建
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm turbo run build --filter=@zscx/server

# 运行
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/server/.next/standalone ./
COPY --from=builder /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=builder /app/packages/shared/prisma ./packages/shared/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3001
CMD ["node", "apps/server/server.js"]
'@

Write-File "$base\docker\Dockerfile.web" @'
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm turbo run build --filter=@zscx/web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3002
CMD ["node", "apps/web/server.js"]
'@

Write-File "$base\docker\Dockerfile.h5" @'
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/h5/package.json ./apps/h5/
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm turbo run build --filter=@zscx/h5

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/h5/.next/standalone ./
COPY --from=builder /app/apps/h5/.next/static ./apps/h5/.next/static
COPY --from=builder /app/apps/h5/public ./apps/h5/public

EXPOSE 3003
CMD ["node", "apps/h5/server.js"]
'@

Write-File "$base\docker\mysql\init.sql" @'
-- MySQL 初始化脚本
CREATE DATABASE IF NOT EXISTS zscx_saas DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
'@

Write-Host "`n=== Creating Database Init Script ==="

# ==================== DB Init Script ====================

Write-File "$base\scripts\db-init.js" @'
// 数据库初始化脚本（MySQL 5.5 兼容）
const { execSync } = require('child_process')
const path = require('path')

const sharedDir = path.join(__dirname, '..', 'packages', 'shared')

console.log('[DB Init] Generating Prisma client...')
execSync('npx prisma generate', { cwd: sharedDir, stdio: 'inherit' })

console.log('[DB Init] Running migration...')
execSync('npx prisma migrate dev --name init', { cwd: sharedDir, stdio: 'inherit' })

console.log('[DB Init] Seeding data...')
execSync('npx tsx prisma/seed.ts', { cwd: sharedDir, stdio: 'inherit' })

console.log('[DB Init] Done!')
'@

Write-File "$base\packages\shared\prisma\seed.ts" @'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 创建默认租户
  const tenant = await prisma.tenant.upsert({
    where: { code: 'default' },
    update: {},
    create: { name: '默认租户', code: 'default' },
  })

  // 创建角色
  const roles = [
    { name: 'ADMIN', label: '超级管理员', canManageTables: true, canManageUsers: true, canManagePermissions: true, canManageTemplates: true, canManageDepartments: true, canManageApproval: true, canManageSettings: true, canViewLogs: true, isSystem: true, sortOrder: 1 },
    { name: 'MANAGER', label: '管理员', canManageTables: true, canManageUsers: true, canManagePermissions: true, canManageTemplates: true, canManageDepartments: false, canManageApproval: true, canManageSettings: false, canViewLogs: true, isSystem: true, sortOrder: 2 },
    { name: 'USER', label: '录入员', canManageTables: false, canManageUsers: false, canManagePermissions: false, canManageTemplates: false, canManageDepartments: false, canManageApproval: false, canManageSettings: false, canViewLogs: false, isSystem: true, sortOrder: 3 },
    { name: 'VIEWER', label: '查看员', canManageTables: false, canManageUsers: false, canManagePermissions: false, canManageTemplates: false, canManageDepartments: false, canManageApproval: false, canManageSettings: false, canViewLogs: false, isSystem: true, sortOrder: 4 },
  ]

  const createdRoles: Record<string, any> = {}
  for (const role of roles) {
    const r = await prisma.role.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    })
    createdRoles[role.name] = r
  }

  // 创建超级管理员
  const passwordHash = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      realName: '系统管理员',
      phone: '13800000000',
      roleId: createdRoles.ADMIN.id,
      tenantId: tenant.id,
      status: 'ACTIVE',
    },
  })

  // 创建默认部门
  const dept = await prisma.department.create({
    data: { tenantId: tenant.id, name: '默认部门', sortOrder: 0 },
  })

  console.log('Seed completed!')
  console.log('  Default admin: admin / admin123')
  console.log('  Tenant code: default')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
'@

Write-Host "`n=== Creating .env file ==="

Write-File "$base\.env" @'
# 数据库
DATABASE_URL="mysql://root:root123456@localhost:3308/zscx_saas?schema=public"

# JWT
JWT_SECRET="zscx-saas-jwt-secret-change-in-production"
JWT_EXPIRES_IN="7d"

# Redis
REDIS_URL="redis://localhost:6379"

# MinIO
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="zscx-saas"
MINIO_USE_SSL="false"

# 企业微信
WECOM_CORP_ID=""
WECOM_AGENT_ID=""
WECOM_SECRET=""

# 钉钉
DINGTALK_APP_KEY=""
DINGTALK_APP_SECRET=""

# 飞书
FEISHU_APP_ID=""
FEISHU_APP_SECRET=""

# 微信
WECHAT_APP_ID=""
WECHAT_APP_SECRET=""
'@

Write-Host "`n=== Creating .gitignore ==="

Write-File "$base\.gitignore" @'
node_modules/
.next/
dist/
.env
.env.local
*.log
.turbo
coverage/
'@

Write-Host "`n============================================"
Write-Host "  zscx-saas project scaffold complete!"
Write-Host "============================================"
Write-Host "  Next steps:"
Write-Host "  1. cd d:\\开发征收项目\\zscx-saas"
Write-Host "  2. corepack enable && pnpm install"
Write-Host "  3. docker compose -f docker/docker-compose.yml up -d"
Write-Host "  4. pnpm run db:init"
Write-Host "  5. pnpm run dev"
Write-Host "============================================"