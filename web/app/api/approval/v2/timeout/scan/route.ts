import { NextResponse } from 'next/server'
import { timeoutScanService } from '@/lib/approval-service'

export async function POST() {
  const results = await timeoutScanService(500)
  return NextResponse.json({ ok: true, data: { handled: results.length, items: results } })
}
