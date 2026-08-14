/**
 * 专项动作审批配置（v1.2.3+）
 *
 * 设计审批流程时，直接选择"要执行什么动作"：
 *  - 动作类型（动作类型：新增记录 / 修改记录 / 删除记录 / 审查复核）
 *  - 目标项目（数据表）
 *  - 目标字段（可编辑字段，仅修改动作需要）
 *  - 可编辑数据范围（限定可发起的数据范围，条件表达式）
 *  - 可见角色（有权限的才会在审批中心显示该流程申请）
 */
'use client'

import React, { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type SpecialAction = {
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW'
  targetTableId: number | null
  targetTableLabel?: string
  editableFields: { name: string; label: string }[]
  dataScope: { field: string; op: string; value: string }[]
  visibleRoleIds: number[]
}

const ACTION_TYPES = [
  { value: 'CREATE', label: '新增记录', desc: '该动作用于新增某项目的数据记录' },
  { value: 'UPDATE', label: '修改记录', desc: '该动作用于修改某项目已有数据的指定字段' },
  { value: 'DELETE', label: '删除记录', desc: '该动作用于删除某项目的数据记录' },
  { value: 'REVIEW', label: '审查复核', desc: '该动作用于对某项目数据进行审查复核' },
]

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

type TableMeta = { id: number; name: string; label: string }
type FieldMeta = { id: number; name: string; label: string; type: string }
type RoleMeta = { id: number; name: string; label: string }

type Props = {
  value: SpecialAction | null | undefined
  onChange: (v: SpecialAction | null) => void
}

export function SpecialActionSettings({ value, onChange }: Props) {
  const [tables, setTables] = useState<TableMeta[]>([])
  const [fields, setFields] = useState<FieldMeta[]>([])
  const [roles, setRoles] = useState<RoleMeta[]>([])
  const [loading, setLoading] = useState(false)

  const sa: SpecialAction = value ?? {
    actionType: 'CREATE',
    targetTableId: null,
    editableFields: [],
    dataScope: [],
    visibleRoleIds: [],
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const meta = await fetch('/api/approval/special-actions/meta').then(x => x.json()).then(x => x.data ?? {})
        setTables(meta.tables ?? [])
        setRoles(meta.roles ?? [])
        if (value?.targetTableId) {
          setFields(meta.fieldsByTable?.[value.targetTableId] ?? [])
        }
      } finally { setLoading(false) }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadFields(tableId: number) {
    const meta = await fetch('/api/approval/special-actions/meta?tableId=' + tableId).then(x => x.json()).then(x => x.data ?? {})
    setFields(meta.fields ?? [])
  }

  function patch(p: Partial<SpecialAction>) {
    onChange({ ...sa, ...p })
  }

  function onTableChange(tableId: number) {
    const tbl = tables.find(t => t.id === tableId)
    patch({
      targetTableId: tableId,
      targetTableLabel: tbl?.label,
      editableFields: [],
      dataScope: [],
    })
    loadFields(tableId)
  }

  const toggleField = (f: FieldMeta) => {
    const exists = sa.editableFields.some(e => e.name === f.name)
    patch({
      editableFields: exists
        ? sa.editableFields.filter(e => e.name !== f.name)
        : [...sa.editableFields, { name: f.name, label: f.label }],
    })
  }

  const toggleRole = (roleId: number) => {
    const exists = sa.visibleRoleIds.includes(roleId)
    patch({
      visibleRoleIds: exists
        ? sa.visibleRoleIds.filter(id => id !== roleId)
        : [...sa.visibleRoleIds, roleId],
    })
  }

  const updateScope = (idx: number, p: Partial<{ field: string; op: string; value: string }>) => {
    const arr = [...sa.dataScope]
    arr[idx] = { ...arr[idx], ...p }
    patch({ dataScope: arr })
  }

  const isActionConfigured = sa.actionType && sa.targetTableId

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-semibold text-indigo-700">专项动作审批</h4>
          <Badge variant="outline" className="text-[10px] h-5 bg-indigo-50 text-indigo-600 border-indigo-200">取代触发绑定</Badge>
        </div>
        <p className="text-[11px] text-gray-500">
          设计流程时直接选择要执行的专项动作（新增/修改/删除/审查某项目数据），无需再绑定表级触发事件。
        </p>
      </div>

      {/* 动作类型 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">动作类型（要干什么）</Label>
        <Select value={sa.actionType} onValueChange={v => patch({ actionType: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-gray-400">{ACTION_TYPES.find(a => a.value === sa.actionType)?.desc}</p>
      </div>

      {/* 目标项目 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">目标项目（数据表）</Label>
        <Select value={sa.targetTableId != null ? String(sa.targetTableId) : ''} onValueChange={v => onTableChange(Number(v))}>
          <SelectTrigger><SelectValue placeholder="选择项目/数据表" /></SelectTrigger>
          <SelectContent>
            {tables.length === 0 && <div className="px-2 py-2 text-[11px] text-gray-400">暂无数据表</div>}
            {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 目标字段（新增/修改动作） */}
      {(sa.actionType === 'CREATE' || sa.actionType === 'UPDATE') && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">
            {sa.actionType === 'CREATE' ? '可填写字段（新增时录入这些字段）' : '可编辑字段（勾选后审批发起时仅可编辑这些字段）'}
          </Label>
          {!sa.targetTableId ? (
            <div className="text-[11px] text-gray-400 italic">请先选择目标项目</div>
          ) : (
            <>
              {fields.length === 0 && <div className="text-[11px] text-gray-400 italic">该项目暂无字段</div>}
              <div className="flex flex-wrap gap-1.5">
                {fields.map(f => {
                  const on = sa.editableFields.some(e => e.name === f.name)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleField(f)}
                      className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                        on ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  )
                })}
              </div>
              {sa.editableFields.length === 0 && (
                <div className="text-[11px] text-amber-600">未勾选任何字段，发起时将无法填写内容</div>
              )}
            </>
          )}
        </div>
      )}

      {/* 可编辑数据范围 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-500">可编辑数据范围（限定可发起的记录）</Label>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => patch({ dataScope: [...sa.dataScope, { field: '', op: 'eq', value: '' }] })}>
            <Plus className="w-3 h-3 mr-1" />条件
          </Button>
        </div>
        {sa.dataScope.length === 0 && (
          <div className="text-[11px] text-gray-400 italic">未设置范围 = 该项目下所有数据均可发起</div>
        )}
        {sa.dataScope.map((expr, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <Select value={expr.field} onValueChange={v => updateScope(idx, { field: v })}>
              <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="字段" /></SelectTrigger>
              <SelectContent>
                {fields.map(f => <SelectItem key={f.id} value={f.name}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={expr.op} onValueChange={v => updateScope(idx, { op: v })}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {!['empty', 'nempty'].includes(expr.op) && (
              <Input value={expr.value} onChange={e => updateScope(idx, { value: e.target.value })} placeholder="值" className="flex-1 h-8 text-xs" />
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => patch({ dataScope: sa.dataScope.filter((_, i) => i !== idx) })}>
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            </Button>
          </div>
        ))}
      </div>

      {/* 可见角色 */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">可见角色（有权限的角色才在审批中心显示本流程申请）</Label>
        {roles.length === 0 && <div className="text-[11px] text-gray-400 italic">暂无角色</div>}
        <div className="flex flex-wrap gap-1.5">
          {roles.map(r => {
            const on = sa.visibleRoleIds.includes(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRole(r.id)}
                className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  on ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
        {sa.visibleRoleIds.length === 0 && (
          <div className="text-[11px] text-amber-600">未勾选任何角色，默认仅管理员可见本流程申请</div>
        )}
      </div>

      {loading && <div className="text-xs text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />加载中…</div>}

      {!isActionConfigured && (
        <div className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1">
          请设置动作类型和目标项目，审批中心才会展示该流程申请。
        </div>
      )}
    </div>
  )
}