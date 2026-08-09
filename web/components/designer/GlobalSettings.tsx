/**
 * 全局设置组件
 */
'use client'

import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import type { DesignerGlobals } from './designer-types'
import type { CondExpr } from './designer-types'

type Props = {
  globals: DesignerGlobals
  onChange: (globals: DesignerGlobals) => void
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

/** 从 triggerCondition（数组 | {expressions,orExpressions} | null）里抽 AND 表达式数组 */
function getTriggerExpressions(tc: any): CondExpr[] {
  if (Array.isArray(tc)) return tc
  if (tc && typeof tc === 'object' && Array.isArray(tc.expressions)) return tc.expressions
  return []
}

export function GlobalSettings({ globals, onChange }: Props) {
  const exprs = getTriggerExpressions(globals.triggerCondition)

  const updateExprs = (newExprs: CondExpr[]) => {
    // 保持原有 orExpressions（若有）
    const orArrs =
      globals.triggerCondition && typeof globals.triggerCondition === 'object'
        ? (globals.triggerCondition as any).orExpressions
        : undefined
    if (newExprs.length === 0 && !orArrs) {
      const { triggerCondition, ...rest } = globals
      void triggerCondition
      onChange(rest as DesignerGlobals)
    } else {
      onChange({ ...globals, triggerCondition: { expressions: newExprs, orExpressions: orArrs } })
    }
  }

  const addExpr = () => updateExprs([...exprs, { field: '', op: 'eq', value: '' }])
  const removeExpr = (idx: number) => updateExprs(exprs.filter((_, i) => i !== idx))
  const updateExpr = (idx: number, partial: Partial<CondExpr>) => {
    const updated = [...exprs]
    updated[idx] = { ...updated[idx], ...partial }
    updateExprs(updated)
  }

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">全局设置</h3>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500">允许转签</Label>
        <Switch
          checked={globals.allowTransfer}
          onCheckedChange={v => onChange({ ...globals, allowTransfer: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-500">允许加签</Label>
        <Switch
          checked={globals.allowAddCountersign}
          onCheckedChange={v => onChange({ ...globals, allowAddCountersign: v })}
        />
      </div>

      <div>
        <Label className="text-xs text-gray-500">默认驳回策略</Label>
        <Select
          value={globals.onRejectDefault}
          onValueChange={v => onChange({ ...globals, onRejectDefault: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="REJECT_INSTANCE">驳回整单</SelectItem>
            <SelectItem value="GOTO_PREVIOUS">退回上一节点</SelectItem>
            <SelectItem value="RESTART">驳回重提</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-xs text-gray-500">全局超时（小时）</Label>
        <Input
          type="number"
          min={0}
          value={globals.timeout?.defaultHours ?? 0}
          onChange={e => {
            const h = Number(e.target.value) || 0
            onChange({
              ...globals,
              timeout: h > 0
                ? { defaultHours: h, defaultAction: globals.timeout?.defaultAction ?? 'AUTO_PASS' }
                : undefined,
            })
          }}
        />
      </div>

      <div className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-amber-700">流程启动条件</h4>
          <span className="text-[11px] text-gray-500">按条件匹配审批类型</span>
        </div>
        <p className="text-[11px] text-gray-500 mb-3">
          当记录字段满足下列条件时，才会使用本审批流程。条件越具体，匹配优先级越高。留空=通用类型。
        </p>

        <div className="space-y-2">
          <Label className="text-xs text-gray-500">条件表达式（AND 连接，所有都满足才命中）</Label>
          {exprs.length === 0 && (
            <div className="text-xs text-gray-400 italic py-2">未设置条件（通用）</div>
          )}
          {exprs.map((expr, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <Input
                value={expr.field}
                onChange={e => updateExpr(idx, { field: e.target.value })}
                placeholder="字段名"
                className="w-24 text-xs"
              />
              <Select value={expr.op} onValueChange={v => updateExpr(idx, { op: v as any })}>
                <SelectTrigger className="w-20 text-xs h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {!['empty', 'nempty'].includes(expr.op) && (
                <Input
                  value={(expr.value as any) ?? ''}
                  onChange={e => updateExpr(idx, { value: e.target.value })}
                  placeholder="值"
                  className="flex-1 text-xs"
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
    </div>
  )
}
