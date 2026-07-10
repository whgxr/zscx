import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5SettingsClient } from './settings-client'

export default async function H5SettingsPage() {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  if (user.role?.name !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center">
          <p className="text-gray-500 text-lg">仅管理员可访问</p>
          <p className="text-gray-400 text-sm mt-2">请联系系统管理员</p>
        </div>
      </div>
    )
  }

  // 获取统计数据
  const [tablesCount, usersCount, recordsCount, attachmentsCount] = await Promise.all([
    prisma.dataTable.count({ where: { isDetailTable: false } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.dataRecord.count(),
    prisma.recordAttachment.count(),
  ])

  // 获取当前设置
  const settings = await prisma.systemSetting.findMany()
  const settingsMap: Record<string, string> = {}
  settings.forEach(s => { settingsMap[s.key] = s.value })

  return (
    <H5SettingsClient
      user={user}
      stats={{ tables: tablesCount, users: usersCount, records: recordsCount, files: attachmentsCount }}
      settings={settingsMap}
    />
  )
}