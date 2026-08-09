/**
 * 审批人解析器
 *
 * 根据 WorkflowNodeDef.approver 配置 + 上下文，解析出实际的审批人 userId 列表。
 * 所有配置统一从 jsonDefinition 中读取，不再依赖 ApprovalNode DB 字段。
 */
import type { Prisma } from '@prisma/client'
import type { WorkflowNodeDef, ApproverConfig, CcTarget } from './types'
import { deepParse } from './types'

export type EngineClient = Omit<
  import('@prisma/client').PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends' | '$transaction'
>

export type ResolverContext = {
  record: { data: any; createdBy: number | null }
  initiatorId: number | null
  lastApproverId: number | null
}

// ─── 内部工具 ──────────────────────────────────────────────────

async function userIdsByRoleIds(
  ctx: EngineClient | Prisma.TransactionClient,
  roleIds: number[]
): Promise<number[]> {
  if (!roleIds.length) return []
  const us = await (ctx as any).user.findMany({
    where: { roleId: { in: roleIds }, status: 'ACTIVE' },
    select: { id: true },
  })
  return us.map((u: { id: number }) => u.id)
}

function userIdsFromFieldValues(
  fields: string[],
  recordData: Record<string, any>
): number[] {
  const ids = new Set<number>()
  for (const f of fields) {
    const v = recordData[f]
    if (v == null) continue
    const arr = Array.isArray(v) ? v : [v]
    for (const x of arr) {
      const n =
        typeof x === 'number'
          ? x
          : typeof x === 'string'
            ? Number(x)
            : Number(x?.id ?? NaN)
      if (!Number.isNaN(n)) ids.add(n)
    }
  }
  return [...ids]
}

// ─── 公开 API ──────────────────────────────────────────────────

/**
 * 解析审批人 userId 列表
 *
 * @param ctx PrismaClient 或 TransactionClient
 * @param node WorkflowNodeDef（从 jsonDefinition.nodes 中取）
 * @param context 上下文（记录数据、发起人、上一审批人）
 */
export async function resolveApproverUserIds(
  ctx: EngineClient | Prisma.TransactionClient,
  node: WorkflowNodeDef,
  context: ResolverContext
): Promise<number[]> {
  const config = node.approver
  if (!config) return []

  const recordData: Record<string, any> = deepParse(context.record.data) ?? {}
  const ids = new Set<number>()

  switch (config.kind) {
    case 'ROLE': {
      const roleIds = (config.candidates ?? []).filter(Number.isFinite)
      const us = await userIdsByRoleIds(ctx, roleIds)
      us.forEach(id => ids.add(id))
      break
    }
    case 'USER': {
      (config.candidates ?? []).filter(Boolean).forEach(id => ids.add(id))
      break
    }
    case 'FIELD': {
      const fieldNames = config.field ? [config.field] : (config.candidates as any as string[]) ?? []
      userIdsFromFieldValues(fieldNames, recordData).forEach(id => ids.add(id))
      break
    }
    case 'CREATOR': {
      if (context.record.createdBy) ids.add(context.record.createdBy)
      else if (context.initiatorId) ids.add(context.initiatorId)
      break
    }
    case 'LAST_APPROVER': {
      if (context.lastApproverId) ids.add(context.lastApproverId)
      else if (context.initiatorId) ids.add(context.initiatorId)
      break
    }
    case 'DEPARTMENT': {
      // DEPARTMENT 目前当 userId 直接传入
      (config.candidates ?? []).forEach(id => ids.add(id))
      break
    }
  }

  return [...ids].sort((a, b) => a - b)
}

/**
 * 解析抄送人 userId 列表
 *
 * @param ctx PrismaClient 或 TransactionClient
 * @param ccTargets 抄送配置（来自 WorkflowNodeDef.ccTargets）
 * @param context 上下文
 */
export async function resolveCcUserIds(
  ctx: EngineClient | Prisma.TransactionClient,
  ccTargets: CcTarget | undefined,
  context: ResolverContext
): Promise<number[]> {
  if (!ccTargets) return []
  const t = ccTargets

  if (t.kind === 'ROLE' && Array.isArray(t.ids)) {
    return userIdsByRoleIds(ctx, t.ids)
  }
  if (t.kind === 'USER' && Array.isArray(t.ids)) {
    return t.ids.filter(Number.isFinite)
  }
  if (t.kind === 'FIELD' && (Array.isArray(t.ids) || t.field)) {
    const recordData: Record<string, any> = deepParse(context.record.data) ?? {}
    const fieldNames = t.field ? [t.field] : ((t.ids ?? []) as unknown as string[])
    return userIdsFromFieldValues(fieldNames, recordData)
  }
  return []
}
