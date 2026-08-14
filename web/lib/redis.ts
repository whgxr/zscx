import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

declare global {
  var redisClient: Redis | undefined
}

export function getRedisClient(): Redis | null {
  if (global.redisClient) {
    return global.redisClient
  }

  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
      tls: process.env.REDIS_TLS === 'true' ? {
        rejectUnauthorized: false,
      } : undefined,
    })

    client.on('error', (err) => {
      console.warn('[Redis] Connection error:', err.message)
    })

    client.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })

    global.redisClient = client
    return client
  } catch (err) {
    console.warn('[Redis] Failed to create client:', err)
    return null
  }
}

export function getRedis() {
  return getRedisClient()
}

export async function closeRedis() {
  if (global.redisClient) {
    await global.redisClient.quit()
    global.redisClient = undefined
  }
}
