// Set DATABASE_URL BEFORE importing PrismaClient
// This is critical because PrismaClient validates env vars at import time
if (!process.env.DATABASE_URL) {
  console.warn('[Prisma] DATABASE_URL not found, setting default...')
  process.env.DATABASE_URL = 'mysql://zscx:zscx123456@mysql:3306/zscx?sslmode=disable'
}

import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

const createPrismaClient = () => {
  const url = process.env.DATABASE_URL
  console.log('[Prisma] Creating client with URL:', url ? url.substring(0, 40) + '...' : 'undefined')
  
  return new PrismaClient({
    log: ['error'],
    datasources: {
      db: { url: url || 'mysql://zscx:zscx123456@mysql:3306/zscx?sslmode=disable' },
    },
  })
}

export const prisma: PrismaClient = global.prisma || createPrismaClient()

// Always cache globally to avoid multiple engine loads
global.prisma = prisma