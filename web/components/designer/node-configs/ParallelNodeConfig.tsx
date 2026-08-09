/**
 * 并行节点配置表单
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

export function ParallelNodeConfig({ node, onChange }: Props) {
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
        <Label className="text-xs text-gray-500">等待模式</Label>
        <Select
          value={node.parallelWaitMode ?? 'ALL'}
          onValueChange={v => onChange({ parallelWaitMode: v as 'ALL' | 'ANY' })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">全部完成 (AND)</SelectItem>
            <SelectItem value="ANY">任一完成 (OR)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
