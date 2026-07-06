import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { ErrorLogsClient } from './error-logs-client'

export default async function ErrorLogsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN') {
    redirect('/dashboard')
  }

  return <ErrorLogsClient />
}