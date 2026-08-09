/**
 * 抄送节点配置表单
 */
'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DesignerNodeDef } from '../designer-types'

type Props = {
  node: DesignerNodeDef
  onChange: (updates: Partial<DesignerNodeDef>) => void
}

export function CCNodeConfig({ node, onChange }: Props) {
  const cc = node.ccTargets

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">节点名称</Label>
        <Input
          value={node.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </div>

      <div>
        <Label className="text-xs text-gray-500">抄送对象类型</Label>
        <Select
          value={cc?.kind ?? 'USER'}
          onValueChange={v => onChange({
            ccTargets: { kind: v as any, ids: cc?.ids, field: cc?.field },
          })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="USER">指定用户</SelectItem>
            <SelectItem value="ROLE">按角色</SelectItem>
            <SelectItem value="FIELD">按字段</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(cc?.kind === 'USER' || cc?.kind === 'ROLE' || !cc) && (
        <div>
          <Label className="text-xs text-gray-500">ID 列表（逗号分隔）</Label>
          <Input
            value={(cc?.ids ?? []).join(',')}
            onChange={e => {
              const ids = e.target.value.split(',').map(Number).filter(Number.isFinite)
              onChange({ ccTargets: { kind: cc?.kind ?? 'USER', ids } })
            }}
            placeholder="1,2,3"
          />
        </div>
      )}

      {cc?.kind === 'FIELD' && (
        <div>
          <Label className="text-xs text-gray-500">字段名</Label>
          <Input
            value={cc.field ?? ''}
            onChange={e => onChange({ ccTargets: { kind: 'FIELD', field: e.target.value } })}
            placeholder="fieldName"
          />
        </div>
      )}
    </div>
  )
}
