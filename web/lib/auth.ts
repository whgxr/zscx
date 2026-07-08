import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies, headers } from 'next/headers'
import { prisma } from './prisma'
import { Role } from '@prisma/client'

const DEFAULT_JWT_SECRET = 'zscx-default-jwt-secret-change-in-production-env-2024'
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET

if (!process.env.JWT_SECRET) {
  console.warn('[WARNING] JWT_SECRET environment variable not set. Using default secret. This is insecure for production!')
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

async function getSessionTimeoutMinutes(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'sessionTimeout' },
    })
    const timeout = parseInt(setting?.value || '30', 10)
    return timeout
  } catch {
    return 30
  }
}

export interface JwtPayload {
  userId: number
  username: string
  roleId: number
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

export async function createUserSession(
  userId: number,
  username: string,
  roleId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<{ token: string; sessionId: number }> {
  await prisma.userSession.updateMany({
    where: {
      userId,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  })

  const token = generateToken({
    userId,
    username,
    roleId,
  })

  const session = await prisma.userSession.create({
    data: {
      userId,
      token,
      ipAddress,
      userAgent,
      isActive: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return { token, sessionId: session.id }
}

export async function validateSession(token: string): Promise<boolean> {
  const payload = verifyToken(token)
  if (!payload) return false

  const session = await prisma.userSession.findFirst({
    where: { token },
  })

  if (!session || !session.isActive) return false

  if (session.expiresAt && new Date() > session.expiresAt) {
    return false
  }

  const timeoutMinutes = await getSessionTimeoutMinutes()
  const lastActive = new Date(session.lastActiveAt).getTime()
  const now = Date.now()
  if (now - lastActive > timeoutMinutes * 60 * 1000) {
    return false
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  })

  return true
}

export async function invalidateUserSessions(userId: number): Promise<void> {
  await prisma.userSession.updateMany({
    where: {
      userId,
      isActive: true,
    },
    data: {
      isActive: false,
    },
  })
}

export async function getCurrentUser() {
  const cookieStore = cookies()
  let token = cookieStore.get('token')?.value

  // 小程序通过 Authorization header 发送 token
  if (!token) {
    const headerStore = headers()
    const authHeader = headerStore.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }
  }

  if (!token) return null

  const payload = verifyToken(token)
  if (!payload) return null

  const sessionValid = await validateSession(token)
  if (!sessionValid) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      role: true,
    },
  })

  if (!user || user.status !== 'ACTIVE') return null

  return user
}

export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('UNAUTHORIZED')
  }
  return user
}

export async function requireRole(...roles: Role[]) {
  const user = await requireAuth()
  if (!roles.includes(user.role)) {
    throw new Error('FORBIDDEN')
  }
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
