/**
 * 条件分支节点配置表单
 */
'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import type { DesignerNodeDef, CondExpr } from '../designer-types'

type Props = {
  node: DesignerNodeDef
  onChange: (updates: Partial<DesignerNodeDef>) => void
}

const OPS = [
  { value: 'eq', label: '等于' },
  { value: 'ne', label: '不等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: '包含' },
  { value: 'empty', label: '为空' },
  { value: 'nempty', label: '不为空' },
]

export function ConditionNodeConfig({ node, onChange }: Props) {
  const exprs = node.condition?.expressions ?? []

  const updateExprs = (newExprs: CondExpr[]) => {
    onChange({ condition: { ...node.condition, expressions: newExprs } })
  }

  const addExpr = () => {
    updateExprs([...exprs, { field: '', op: 'eq', value: '' }])
  }

  const removeExpr = (idx: number) => {
    updateExprs(exprs.filter((_, i) => i !== idx))
  }

  const updateExpr = (idx: number, partial: Partial<CondExpr>) => {
    const updated = [...exprs]
    updated[idx] = { ...updated[idx], ...partial }
    updateExprs(updated)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">节点名称</Label>
        <Input
          value={node.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-gray-500">条件表达式（AND）</Label>
        {exprs.map((expr, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <Input
              value={expr.field}
              onChange={e => updateExpr(idx, { field: e.target.value })}
              placeholder="字段"
              className="w-20 text-xs"
            />
            <Select value={expr.op} onValueChange={v => updateExpr(idx, { op: v as any })}>
              <SelectTrigger className="w-20 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!['empty', 'nempty'].includes(expr.op) && (
              <Input
                value={expr.value ?? ''}
                onChange={e => updateExpr(idx, { value: e.target.value })}
                placeholder="值"
                className="w-16 text-xs"
              />
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeExpr(idx)}>
              <Trash2 size={12} />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addExpr} className="text-xs">
          + 添加条件
        </Button>
      </div>
    </div>
  )
}
