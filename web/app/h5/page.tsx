import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function H5Page() {
  const user = await getCurrentUser()
  if (user) {
    redirect('/h5/projects')
  }
  redirect('/h5/login')
}