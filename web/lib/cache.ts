import { getRedis } from './redis'

const DEFAULT_TTL = 300

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return null

  try {
    const value = await redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export async function cacheSet(key: string, value: any, ttl: number = DEFAULT_TTL, tags?: string[]): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const serialized = JSON.stringify(value)
    if (tags && tags.length > 0) {
      const pipeline = redis.pipeline()
      pipeline.setex(key, ttl, serialized)
      for (const tag of tags) {
        pipeline.sadd(`cache:tag:${tag}`, key)
      }
      await pipeline.exec()
    } else {
      await redis.setex(key, ttl, serialized)
    }
  } catch {
  }
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    await redis.del(key)
  } catch {
  }
}

export async function cacheDeleteByPattern(pattern: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch {
  }
}

export async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL,
  tags?: string[]
): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) {
    return cached
  }

  const value = await fetcher()
  await cacheSet(key, value, ttl, tags)
  return value
}

export async function invalidateByTag(tag: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return

  try {
    const keySet = `cache:tag:${tag}`
    const keys = await redis.smembers(keySet)
    if (keys.size > 0) {
      const keyArray = Array.from(keys) as string[]
      await redis.del(...keyArray)
      await redis.del(keySet)
    }
  } catch {
  }
}

export async function invalidateByTags(tags: string[]): Promise<void> {
  return Promise.all(tags.map((tag) => invalidateByTag(tag)))
}

export function cacheKey(...parts: string[]): string {
  return `cache:${parts.join(':')}`
}
