import { prisma } from './prisma'
import { NotificationService } from './notification-service'

/** 找出表中"要求先上传图片才能录入"的门禁字段（config.requireImageUpload === true） */
export function findGateField(fields: any[]): any | undefined {
  return fields.find((f) => (f.config as any)?.requireImageUpload === true)
}

export function isEmptyFieldValue(v: any): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** 解析对该数据表具有"编辑及以上"权限的用户 id（直接表权限 + 角色树权限 + 管理员/经理角色） */
export async function getTableEditableUserIds(tableId: number): Promise<number[]> {
  const ids = new Set<number>()

  const directPerms = await prisma.tablePermission.findMany({
    where: { tableId, canEdit: true },
    select: { userId: true },
  })
  directPerms.forEach((p) => ids.add(p.userId))

  const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } })
  const roleIds: number[] = []
  for (const r of roles) {
    const perms: string[] = Array.isArray(r.permissions) ? (r.permissions as string[]) : []
    const editable =
      r.name === 'ADMIN' ||
      r.name === 'MANAGER' ||
      perms.includes(`table:${tableId}`) ||
      perms.includes(`tableOp:${tableId}:UPDATE`)
    if (editable) roleIds.push(r.id)
  }

  if (roleIds.length) {
    const users = await prisma.user.findMany({
      where: { roleId: { in: roleIds }, status: 'ACTIVE' },
      select: { id: true },
    })
    users.forEach((u) => ids.add(u.id))
  }

  return Array.from(ids)
}

export interface GateImageNotifyContext {
  table: { id: number; name: string; label: string; fields: any[] }
  /** 更新前的 data（新建记录时省略，视为空前值） */
  prevData?: any
  record: { id: number; data: any }
}

/** 若门禁图片字段由空→有值，则通知该表所有可编辑用户前往录入 */
export async function notifyGateImageUploadedIfNeeded(ctx: GateImageNotifyContext): Promise<void> {
  const gateField = findGateField(ctx.table.fields)
  if (!gateField) return

  const wasEmpty = !ctx.prevData || isEmptyFieldValue(ctx.prevData[gateField.name])
  const nowHas = !isEmptyFieldValue(ctx.record.data?.[gateField.name])
  if (!wasEmpty || !nowHas) return

  const targetUserIds = await getTableEditableUserIds(ctx.table.id)
  if (!targetUserIds.length) return

  const label = gateField.label || '门牌地址'
  const notificationService = new NotificationService()
  await notificationService.createNotification({
    type: 'BUSINESS',
    title: `${ctx.table.label}：图片已上传，请录入数据`,
    content: `「${label}」图片已上传，请前往填写并录入该户数据。`,
    targetType: 'USER',
    targetUserIds,
    linkUrl: `/dashboard/data/${ctx.table.name}/${ctx.record.id}?mode=edit`,
    linkParams: { tableName: ctx.table.name, recordId: ctx.record.id },
  })
}