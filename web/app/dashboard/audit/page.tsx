import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { AuditCenterClient } from './audit-client'

export default async function AuditPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const isAdmin = user.role?.name === 'ADMIN' || !!user.role?.canViewLogs
  if (!isAdmin) redirect('/dashboard')
  return <AuditCenterClient />
}
