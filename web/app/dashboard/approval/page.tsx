import { ApprovalClient } from './approval-client'
import { getCurrentUser } from '@/lib/auth'

export default async function ApprovalPage() {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  return <ApprovalClient user={user} />
}