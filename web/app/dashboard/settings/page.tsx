import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
    redirect('/dashboard')
  }

  const stats = {
    tables: await prisma.dataTable.count(),
    users: await prisma.user.count(),
    records: await prisma.dataRecord.count(),
    files: await prisma.uploadedFile.count(),
    templates: await prisma.exportTemplate.count(),
    logs: await prisma.operationLog.count(),
  }

  return <SettingsClient userRole={user.role} stats={stats} />
}
