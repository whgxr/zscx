import { getRedis } from './redis'

// ========== 内存兜底存储（Redis 不可用时使用） ==========
interface MemoryEntry {
  value: string
  expiresAt: number
}
const memoryStore = new Map<string, MemoryEntry>()

function memorySet(key: string, value: string, ttlSec: number): void {
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
  // 简单清理过期项，防止内存无限增长
  if (memoryStore.size > 10000) {
    const now = Date.now()
    for (const [k, v] of memoryStore) {
      if (now > v.expiresAt) memoryStore.delete(k)
    }
  }
}

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key)
    return null
  }
  return entry.value
}

function memoryGetAndDelete(key: string): string | null {
  const value = memoryGet(key)
  if (value !== null) memoryStore.delete(key)
  return value
}

function memoryDelete(key: string): void {
  memoryStore.delete(key)
}

// ========== 图形验证码 ==========
// 去掉易混淆字符：0/O、1/I/L
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CAPTCHA_TTL_SEC = 300 // 验证码有效期 5 分钟

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function generateCaptchaCode(length = 4): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CAPTCHA_CHARS[randomInt(0, CAPTCHA_CHARS.length - 1)]
  }
  return code
}

export function createCaptchaId(): string {
  return `cap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export async function saveCaptcha(captchaId: string, code: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.setex(`captcha:${captchaId}`, CAPTCHA_TTL_SEC, code)
      return
    } catch {
      // fallback to memory
    }
  }
  memorySet(`captcha:${captchaId}`, code, CAPTCHA_TTL_SEC)
}

export async function verifyCaptcha(captchaId: string, code: string): Promise<boolean> {
  if (!captchaId || !code) return false
  const normalized = code.trim().toUpperCase()
  if (!normalized) return false

  const redis = getRedis()
  if (redis) {
    try {
      const key = `captcha:${captchaId}`
      const stored = await redis.get(key)
      // 一次性使用：无论校验结果如何都立即删除，防止重放
      await redis.del(key)
      if (!stored) return false
      return stored.trim().toUpperCase() === normalized
    } catch {
      // fallback to memory
    }
  }
  const stored = memoryGetAndDelete(`captcha:${captchaId}`)
  if (!stored) return false
  return stored.trim().toUpperCase() === normalized
}

// ========== 登录防暴力破解 ==========
export const MAX_LOGIN_ATTEMPTS = 5 // 窗口内最大失败次数
export const LOGIN_WINDOW_SECONDS = 600 // 失败计数窗口 10 分钟
export const LOGIN_LOCK_SECONDS = 300 // 锁定时间 5 分钟

/**
 * 检查用户名或 IP 是否已被锁定。
 * @returns 剩余锁定秒数，0 表示未锁定
 */
export async function checkLoginLocked(username: string, ip: string): Promise<number> {
  const keys = [`login:lock:u:${username}`, ip ? `login:lock:ip:${ip}` : ''].filter(Boolean)
  let maxLock = 0

  const redis = getRedis()
  if (redis) {
    try {
      for (const key of keys) {
        const ttl = await redis.ttl(key)
        if (ttl > 0 && ttl > maxLock) maxLock = ttl
      }
      return maxLock
    } catch {
      // fallback to memory
    }
  }

  for (const key of keys) {
    const lockUntil = parseInt(memoryGet(key) || '0', 10)
    const remaining = Math.ceil((lockUntil - Date.now()) / 1000)
    if (remaining > 0 && remaining > maxLock) maxLock = remaining
  }
  return maxLock
}

/**
 * 记录一次登录失败，达到阈值后锁定（用户名 + IP 双维度）。
 * @returns 是否已触发锁定
 */
export async function recordLoginFailure(username: string, ip: string): Promise<boolean> {
  const keys = [`login:fail:u:${username}`, ip ? `login:fail:ip:${ip}` : ''].filter(Boolean)

  const redis = getRedis()
  if (redis) {
    try {
      for (const key of keys) {
        const count = await redis.incr(key)
        if (count === 1) {
          await redis.expire(key, LOGIN_WINDOW_SECONDS)
        }
        if (count >= MAX_LOGIN_ATTEMPTS) {
          await redis.setex(key.replace('login:fail:', 'login:lock:'), LOGIN_LOCK_SECONDS, '1')
          await redis.del(key)
        }
      }
      return true
    } catch {
      // fallback to memory
    }
  }

  for (const key of keys) {
    const count = parseInt(memoryGet(key) || '0', 10) + 1
    memorySet(key, String(count), LOGIN_WINDOW_SECONDS)
    if (count >= MAX_LOGIN_ATTEMPTS) {
      memorySet(key.replace('login:fail:', 'login:lock:'), String(Date.now() + LOGIN_LOCK_SECONDS * 1000), LOGIN_LOCK_SECONDS)
      memoryDelete(key)
    }
  }
  return true
}

/**
 * 登录成功后清除失败记录与锁定状态。
 */
export async function clearLoginFailures(username: string, ip: string): Promise<void> {
  const keys = [
    `login:fail:u:${username}`,
    `login:lock:u:${username}`,
    ip ? `login:fail:ip:${ip}` : '',
    ip ? `login:lock:ip:${ip}` : '',
  ].filter(Boolean)

  const redis = getRedis()
  if (redis) {
    try {
      if (keys.length > 0) await redis.del(...keys)
      return
    } catch {
      // fallback to memory
    }
  }
  for (const key of keys) {
    memoryDelete(key)
  }
}
