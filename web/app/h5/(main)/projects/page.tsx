import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProjectsClient } from './projects-client'

export default async function H5ProjectsPage() {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'

  // 管理员：直接取所有 ACTIVE 表；非管理员：按 TablePermission + 树形权限过滤
  let baseTables: { id: number; name: string; label: string; icon: string | null; description: string | null; categoryId: number | null; categoryName: string | null; categoryModule: string | null }[] = []

  const selectFields = { id: true, name: true, label: true, icon: true, description: true, categoryId: true } as const

  if (isAdmin) {
    const rows = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE', isDetailTable: false },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { ...selectFields, category: { select: { id: true, name: true, module: true } } },
    })
    baseTables = rows.map(t => ({
      id: t.id, name: t.name, label: t.label, icon: t.icon, description: t.description,
      categoryId: t.categoryId ?? null, categoryName: t.category?.name ?? null,
      categoryModule: t.category?.module ?? null,
    }))
  } else {
    const perms = await prisma.tablePermission.findMany({
      where: { userId: user.id, canView: true },
      include: {
        table: {
          select: { ...selectFields, category: { select: { id: true, name: true, module: true } }, status: true, isDetailTable: true },
        },
      },
    })
    const filtered = perms.filter(p => p.table.status === 'ACTIVE' && !p.table.isDetailTable)
    baseTables = filtered.map(p => ({
      id: p.table.id, name: p.table.name, label: p.table.label, icon: p.table.icon, description: p.table.description,
      categoryId: p.table.categoryId ?? null, categoryName: p.table.category?.name ?? null,
      categoryModule: p.table.category?.module ?? null,
    }))
    // 按树形权限（Role.permissions）进一步过滤 tableOp:X:VIEW / table:X
    const rolePerms = (user.role as any)?.permissions
    if (Array.isArray(rolePerms) && rolePerms.length) {
      const s = new Set(rolePerms)
      baseTables = baseTables.filter(t => s.has(`table:${t.id}`) || s.has(`tableOp:${t.id}:VIEW`))
    }
  }

  const tableIds = baseTables.map(t => t.id)
  const recordCounts = tableIds.length ? await prisma.dataRecord.groupBy({
    by: ['tableId'],
    where: { tableId: { in: tableIds } },
    _count: { id: true },
  }) : []
  const countMap: Record<number, number> = {}
  recordCounts.forEach(r => { countMap[r.tableId!] = r._count.id })

  // 草稿/审批中计数（简化：按 status 统计）
  const statusCounts: Record<number, { draft: number; approving: number; passed: number }> = {}
  if (tableIds.length) {
    const groups = await prisma.dataRecord.groupBy({
      by: ['tableId', 'status'],
      where: { tableId: { in: tableIds } },
      _count: { id: true },
    })
    for (const g of groups as any[]) {
      if (!statusCounts[g.tableId]) statusCounts[g.tableId] = { draft: 0, approving: 0, passed: 0 }
      if (g.status === 'DRAFT') statusCounts[g.tableId].draft = g._count.id
      else if (g.status === 'SUBMITTED' || g.status === 'UNDER_REVIEW') statusCounts[g.tableId].approving += g._count.id
      else if (g.status === 'APPROVED' || g.status === 'ACTIVE') statusCounts[g.tableId].passed = g._count.id
    }
  }

  return (
    <ProjectsClient
      user={user}
      tables={baseTables}
      recordCounts={countMap}
      statusCounts={statusCounts}
      isAdmin={isAdmin}
    />
  )
}
