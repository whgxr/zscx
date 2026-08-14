/**
 * 数据库驱动多选下拉组件
 *
 * 从数据库实时拉取用户 / 角色列表，供设计器配置节点时下拉选择（替代手动填写 ID）。
 * 使用 DropdownMenuCheckboxItem 实现多选。
 */
'use client'

import React, { useEffect, useState } from 'react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { ChevronDown, Loader2 } from 'lucide-react'

export type EntityKind = 'user' | 'role'

type Entity = { id: number; label: string }

/** 从数据库拉取用户 / 角色选项 */
export function useEntityOptions(kind: EntityKind) {
  const [options, setOptions] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        if (kind === 'role') {
          const r = await fetch('/api/roles')
          const d = await r.json()
          if (!cancelled && r.ok && Array.isArray(d.roles)) {
            setOptions(d.roles.map((x: any) => ({ id: x.id, label: x.label || x.name })))
          }
        } else {
          const r = await fetch('/api/users?pageSize=1000')
          const d = await r.json()
          if (!cancelled && r.ok && Array.isArray(d.users)) {
            setOptions(d.users.map((x: any) => ({
              id: x.id,
              label: x.realName ? `${x.realName} (@${x.username})` : `@${x.username}`,
            })))
          }
        }
      } catch (_) { /* ignore */ } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [kind])

  return { options, loading }
}

export function EntityMultiSelect({
  kind, selected, onChange, placeholder,
}: {
  kind: EntityKind
  selected: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
}) {
  const { options, loading } = useEntityOptions(kind)
  const selectedEntities = options.filter(o => selected.includes(o.id))
  const label = selectedEntities.length
    ? selectedEntities.map(e => e.label).join('、')
    : (placeholder ?? (kind === 'user' ? '选择用户' : '选择角色'))

  const toggle = (id: number) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-9 font-normal">
          <span className="truncate text-left flex-1 text-xs">
            {loading ? '加载中…' : label}
          </span>
          <ChevronDown className="h-4 w-4 ml-1 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-h-72 overflow-auto">
        <DropdownMenuLabel>{kind === 'user' ? '选择用户（可多选）' : '选择角色（可多选）'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading ? (
          <div className="px-2 py-3 text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />加载中…
          </div>
        ) : options.length === 0 ? (
          <div className="px-2 py-3 text-xs text-gray-400">暂无数据</div>
        ) : (
          options.map(o => (
            <DropdownMenuCheckboxItem
              key={o.id}
              checked={selected.includes(o.id)}
              onCheckedChange={() => toggle(o.id)}
            >
              <span className="truncate">{o.label}</span>
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
