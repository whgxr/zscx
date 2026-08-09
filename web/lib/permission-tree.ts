/**
 * v1.2.2 权限树构建工具
 *   结构：模块 (module) → 分类 (category) → 数据表 (table) → 操作 (tableOp)
 *   节点 id 约定（用于 Role.permissions 扁平集合存储）：
 *     module:{MODULE_KEY}
 *     category:{categoryId}
 *     table:{tableId}
 *     tableOp:{tableId}:{OP}
 *   OP ∈ {VIEW, CREATE, UPDATE, DELETE, EXPORT, PRINT, APPROVAL_INIT, APPROVAL_VIEW, SYNC}
 */
import { prisma } from './prisma'
import type { TableCategory, DataTable } from '@prisma/client'

export const MODULES = [
  { key: 'SURVEY', label: '调查模块', categoryMods: ['SURVEY', 'BOTH'] as const, description: '基础调查录入、修改、查看' },
  { key: 'LEVY', label: '征收模块', categoryMods: ['LEVY', 'BOTH'] as const, description: '征收管理、文书生成、同步审批' },
  { key: 'ADMIN', label: '系统模块', categoryMods: [], description: '后台管理（角色/用户/模板/设置/审批/日志）' },
] as const

export const TABLE_OPS = [
  { key: 'VIEW', label: '查看记录' },
  { key: 'CREATE', label: '新增记录' },
  { key: 'UPDATE', label: '编辑记录' },
  { key: 'DELETE', label: '删除记录' },
  { key: 'EXPORT', label: '导出 Excel' },
  { key: 'PRINT', label: '打印/文书' },
  { key: 'APPROVAL_INIT', label: '发起审批' },
  { key: 'APPROVAL_VIEW', label: '审批详情' },
  { key: 'SYNC', label: '同步调查↔征收' },
] as const

export const ADMIN_OPS = [
  { key: 'tables', label: '数据表管理' },
  { key: 'categories', label: '分类管理' },
  { key: 'users', label: '用户管理' },
  { key: 'roles', label: '角色管理' },
  { key: 'permissions', label: '权限分配' },
  { key: 'templates', label: '模板管理（Excel+Word）' },
  { key: 'approval', label: '审批流程管理' },
  { key: 'logs', label: '审计日志中心' },
  { key: 'errorLogs', label: '错误日志' },
  { key: 'notifications', label: '通知发布' },
  { key: 'settings', label: '系统设置' },
] as const

export type TreeNodeType = 'module' | 'category' | 'table' | 'tableOp' | 'adminOp'

export interface PermissionTreeNode {
  id: string
  type: TreeNodeType
  label: string
  moduleKey?: string
  categoryId?: number
  tableId?: number
  opKey?: string
  children?: PermissionTreeNode[]
}

export async function buildPermissionTree(): Promise<PermissionTreeNode[]> {
  // 顶级分类 + 其下所有表（按 module 划分）
  const allCats = await prisma.tableCategory.findMany({
    orderBy: [{ module: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: { tables: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
  }) as (TableCategory & { tables: DataTable[] })[]

  const roots: PermissionTreeNode[] = []

  for (const mod of MODULES) {
    const modId = `module:${mod.key}`
    const modNode: PermissionTreeNode = {
      id: modId, type: 'module', label: mod.label, moduleKey: mod.key,
      children: [],
    }

    if (mod.key === 'ADMIN') {
      modNode.children = ADMIN_OPS.map(op => ({
        id: `adminOp:${op.key}`,
        type: 'adminOp' as const,
        label: op.label,
        moduleKey: mod.key,
        opKey: op.key,
      }))
    } else {
      const cats = allCats.filter(c => mod.categoryMods.includes(c.module as any))
      for (const cat of cats) {
        const catId = `category:${cat.id}`
        const catNode: PermissionTreeNode = {
          id: catId, type: 'category', label: cat.name,
          moduleKey: mod.key, categoryId: cat.id,
          children: [],
        }
        for (const tbl of cat.tables) {
          const tblId = `table:${tbl.id}`
          const tblNode: PermissionTreeNode = {
            id: tblId, type: 'table', label: `${tbl.label} (${tbl.name})`,
            moduleKey: mod.key, categoryId: cat.id, tableId: tbl.id,
            children: [],
          }
          tblNode.children = TABLE_OPS.map(op => ({
            id: `tableOp:${tbl.id}:${op.key}`,
            type: 'tableOp' as const, label: op.label,
            moduleKey: mod.key, categoryId: cat.id, tableId: tbl.id,
            opKey: op.key,
          }))
          ;(catNode.children as PermissionTreeNode[]).push(tblNode)
        }
        if ((catNode.children as PermissionTreeNode[]).length) {
          ;(modNode.children as PermissionTreeNode[]).push(catNode)
        }
      }
    }
    roots.push(modNode)
  }
  return roots
}

/** 扁平化权限树，得到所有后代 id（用于从某个子节点向上向下反推） */
export function flattenNodeIds(node: PermissionTreeNode): string[] {
  const res: string[] = [node.id]
  for (const ch of node.children ?? []) res.push(...flattenNodeIds(ch))
  return res
}

/** 收集某节点所有祖先 id */
export function collectAncestorIds(tree: PermissionTreeNode[], nodeId: string): string[] {
  const ancestors: string[] = []
  const walk = (n: PermissionTreeNode, path: PermissionTreeNode[]): boolean => {
    if (n.id === nodeId) { ancestors.push(...path.map(p => p.id)); return true }
    for (const c of n.children ?? []) {
      if (walk(c, [...path, n])) return true
    }
    return false
  }
  for (const r of tree) if (walk(r, [])) break
  return ancestors
}

/** 三态计算：根据已选集合计算每个节点 state
 *   'checked' | 'indeterminate' | 'unchecked'
 */
export function computeCheckState(node: PermissionTreeNode, selected: Set<string>): 'checked' | 'indeterminate' | 'unchecked' {
  const kids = node.children ?? []
  if (!kids.length) return selected.has(node.id) ? 'checked' : 'unchecked'
  const childStates = kids.map(c => computeCheckState(c, selected))
  if (childStates.every(s => s === 'checked')) return 'checked'
  if (childStates.some(s => s === 'checked' || s === 'indeterminate')) return 'indeterminate'
  return 'unchecked'
}
