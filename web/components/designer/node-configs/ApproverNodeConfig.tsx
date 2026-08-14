/**
 * 审批人节点配置表单
 */
'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EntityMultiSelect } from '../EntityMultiSelect'
import type { DesignerNodeDef } from '../designer-types'

type Props = {
  node: DesignerNodeDef
  onChange: (updates: Partial<DesignerNodeDef>) => void
}

export function ApproverNodeConfig({ node, onChange }: Props) {
  const ap = node.approver ?? { kind: 'ROLE' as const }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">节点名称</Label>
        <Input
          value={node.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="审批人名称"
        />
      </div>

      <div>
        <Label className="text-xs text-gray-500">审批人来源</Label>
        <Select
          value={ap.kind}
          onValueChange={v => onChange({
            approver: { ...ap, kind: v as any, candidates: undefined, field: undefined },
          })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ROLE">按角色</SelectItem>
            <SelectItem value="USER">指定用户</SelectItem>
            <SelectItem value="FIELD">按记录字段</SelectItem>
            <SelectItem value="CREATOR">记录创建人</SelectItem>
            <SelectItem value="LAST_APPROVER">上一审批人</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {ap.kind === 'ROLE' && (
        <div>
          <Label className="text-xs text-gray-500">角色</Label>
          <EntityMultiSelect
            kind="role"
            selected={ap.candidates ?? []}
            onChange={ids => onChange({ approver: { ...ap, candidates: ids } })}
            placeholder="选择角色"
          />
        </div>
      )}

      {ap.kind === 'USER' && (
        <div>
          <Label className="text-xs text-gray-500">用户</Label>
          <EntityMultiSelect
            kind="user"
            selected={ap.candidates ?? []}
            onChange={ids => onChange({ approver: { ...ap, candidates: ids } })}
            placeholder="选择用户"
          />
        </div>
      )}

      {ap.kind === 'FIELD' && (
        <div>
          <Label className="text-xs text-gray-500">字段名</Label>
          <Input
            value={ap.field ?? ''}
            onChange={e => onChange({ approver: { ...ap, field: e.target.value } })}
            placeholder="fieldName"
          />
        </div>
      )}

      {node.type === 'APPROVER_COUNTERSIGN' && (
        <div>
          <Label className="text-xs text-gray-500">会签比例（%）</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={ap.quorum ?? 100}
            onChange={e => onChange({ approver: { ...ap, quorum: Number(e.target.value) || 100 } })}
          />
        </div>
      )}

      <div>
        <Label className="text-xs text-gray-500">驳回策略</Label>
        <Select
          value={node.onReject ?? 'REJECT_INSTANCE'}
          onValueChange={v => onChange({ onReject: v as any })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="REJECT_INSTANCE">驳回整单</SelectItem>
            <SelectItem value="GOTO_PREVIOUS">退回上一节点</SelectItem>
            <SelectItem value="GOTO_NODE">退回到指定节点</SelectItem>
            <SelectItem value="RESTART">驳回重提</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-gray-500">超时（小时，0=不限）</Label>
        <Input
          type="number"
          min={0}
          value={node.timeout?.hours ?? 0}
          onChange={e => {
            const h = Number(e.target.value) || 0
            onChange({ timeout: h > 0 ? { hours: h, action: 'AUTO_PASS' } : undefined })
          }}
        />
      </div>
    </div>
  )
}
