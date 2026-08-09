"use client"

import React, { useCallback, useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Database, Folder, Shield, Layers } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

export interface PTreeNode {
  id: string
  type: 'module' | 'category' | 'table' | 'tableOp' | 'adminOp'
  label: string
  moduleKey?: string
  categoryId?: number
  tableId?: number
  opKey?: string
  children?: PTreeNode[]
}

interface PermissionTreeProps {
  tree: PTreeNode[]
  /** 已选 id 集合 */
  value: string[]
  onChange: (next: string[]) => void
  className?: string
}

const ICONS: Record<PTreeNode['type'], React.ComponentType<{ className?: string }>> = {
  module: Shield,
  category: Folder,
  table: Database,
  tableOp: Layers,
  adminOp: Layers,
}

const COLOR: Record<PTreeNode['type'], string> = {
  module: 'text-indigo-600',
  category: 'text-amber-600',
  table: 'text-emerald-600',
  tableOp: 'text-slate-500',
  adminOp: 'text-slate-500',
}

/** 三态计算：传入 Set<string> selected */
function checkStateOf(node: PTreeNode, selected: Set<string>): 'checked' | 'indeterminate' | 'unchecked' {
  const kids = node.children ?? []
  if (!kids.length) return selected.has(node.id) ? 'checked' : 'unchecked'
  const states = kids.map(k => checkStateOf(k, selected))
  if (states.every(s => s === 'checked')) return 'checked'
  if (states.some(s => s === 'checked' || s === 'indeterminate')) return 'indeterminate'
  return 'unchecked'
}

/** 该节点的所有后代 id（含自身） */
function descendantsOf(node: PTreeNode): string[] {
  const res: string[] = [node.id]
  for (const c of node.children ?? []) res.push(...descendantsOf(c))
  return res
}

function findNode(tree: PTreeNode[], id: string): PTreeNode | null {
  for (const r of tree) {
    if (r.id === id) return r
    if (r.children) { const ch = findNode(r.children, id); if (ch) return ch }
  }
  return null
}

function findParent(tree: PTreeNode[], id: string): PTreeNode | null {
  for (const r of tree) {
    if (!r.children) continue
    if (r.children.some(c => c.id === id)) return r
    const sub = findParent(r.children, id)
    if (sub) return sub
  }
  return null
}

/** 收集祖先 id 链（不含自身） */
function ancestorIds(tree: PTreeNode[], id: string): string[] {
  const path: string[] = []
  const walk = (n: PTreeNode, stack: string[]): boolean => {
    if (n.id === id) { path.push(...stack); return true }
    for (const c of n.children ?? []) if (walk(c, [...stack, n.id])) return true
    return false
  }
  for (const r of tree) if (walk(r, [])) break
  return path
}

function flatAllIds(tree: PTreeNode[]): string[] {
  const res: string[] = []
  const walk = (n: PTreeNode) => { res.push(n.id); for (const c of n.children ?? []) walk(c) }
  tree.forEach(walk)
  return res
}

export function PermissionTree({ tree, value, onChange, className }: PermissionTreeProps) {
  const selected = useMemo(() => new Set(value), [value])
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(flatAllIds(tree).slice(0, 300))
  )

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleNode = useCallback((node: PTreeNode, forceCheck: boolean) => {
    const next = new Set(selected)
    const desc = descendantsOf(node)
    const ancestors = ancestorIds(tree, node.id)

    if (forceCheck) {
      ancestors.forEach(a => next.add(a))
      desc.forEach(d => next.add(d))
    } else {
      desc.forEach(d => next.delete(d))
      // 清理祖先：如果某祖先的所有子都未选中，也取消该祖先
      let curId: string | null = node.id
      while (true) {
        const parent = findParent(tree, curId)
        if (!parent) break
        const siblings = parent.children ?? []
        const anySiblingStillSelected = siblings.some(sib => {
          if (sib.id === curId) return false
          return checkStateOf(sib, next) !== 'unchecked'
        })
        if (!anySiblingStillSelected) next.delete(parent.id)
        curId = parent.id
      }
    }
    onChange(Array.from(next))
  }, [selected, tree, onChange])

  return (
    <div className={'space-y-1 ' + (className ?? '')}>
      {tree.map(n => (
        <NodeRow
          key={n.id} node={n} level={0}
          expanded={expanded} onToggleExpand={toggleExpand}
          selected={selected} onToggleNode={toggleNode}
        />
      ))}
    </div>
  )
}

function NodeRow({ node, level, expanded, onToggleExpand, selected, onToggleNode }:
  {
    node: PTreeNode; level: number;
    expanded: Set<string>; onToggleExpand: (id: string) => void;
    selected: Set<string>; onToggleNode: (n: PTreeNode, forceCheck: boolean) => void;
  }
) {
  const hasChildren = !!node.children?.length
  const isOpen = expanded.has(node.id)
  const state = checkStateOf(node, selected)
  const Icon = ICONS[node.type] ?? Layers
  return (
    <div>
      <div className="flex items-center gap-2 py-1 hover:bg-slate-50 rounded px-1 group"
        style={{ paddingLeft: level * 18 + 2 }}>
        {hasChildren ? (
          <button onClick={() => onToggleExpand(node.id)} className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-700">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : <span className="w-5 h-5 inline-block" />}
        <Checkbox
          checked={state === 'checked' ? true : state === 'indeterminate' ? 'indeterminate' : false}
          onCheckedChange={(v: boolean) => onToggleNode(node, !!v)}
        />
        <Icon className={'w-4 h-4 ' + COLOR[node.type]} />
        <span className="text-sm text-slate-800 select-none">{node.label}</span>
        {hasChildren && <span className="text-[11px] text-slate-400 ml-1 group-hover:opacity-100 opacity-60">{node.children!.length}</span>}
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children!.map(c => (
            <NodeRow key={c.id} node={c} level={level + 1}
              expanded={expanded} onToggleExpand={onToggleExpand}
              selected={selected} onToggleNode={onToggleNode} />
          ))}
        </div>
      )}
    </div>
  )
}

export { checkStateOf, descendantsOf, findNode, findParent, ancestorIds }
