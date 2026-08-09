/**
 * 自定义 ReactFlow 节点组件
 *
 * 6 种节点类型的视觉组件，每种节点有不同颜色和图标。
 */
'use client'

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { NODE_COLORS, type DesignerNodeDef } from './designer-types'
import {
  Play, Square, UserCheck, Users, UserPlus,
  GitBranch, Layers, Mail,
} from 'lucide-react'

// ─── 图标映射 ──────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  START: Play,
  END: Square,
  APPROVER_SINGLE: UserCheck,
  APPROVER_COUNTERSIGN: Users,
  APPROVER_ORSIGN: UserPlus,
  CONDITION_BRANCH: GitBranch,
  PARALLEL: Layers,
  CC: Mail,
}

// ─── 通用节点外壳 ──────────────────────────────────────────────

function WorkflowNode({ data, selected }: NodeProps & { data: DesignerNodeDef }) {
  const color = NODE_COLORS[data.type] ?? '#6b7280'
  const Icon = ICON_MAP[data.type] ?? UserCheck
  const isStart = data.type === 'START'
  const isEnd = data.type === 'END'

  return (
    <div
      className={cn(
        'relative rounded-lg border-2 bg-white px-4 py-3 shadow-md transition-shadow min-w-[140px]',
        selected && 'ring-2 ring-blue-400 ring-offset-2',
      )}
      style={{ borderColor: color }}
    >
      {/* 入边 Handle */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !border-2 !bg-white"
          style={{ borderColor: color }}
        />
      )}

      {/* 节点头部：图标 + 类型标签 */}
      <div className="flex items-center gap-2 mb-1">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-full"
          style={{ backgroundColor: color + '20' }}
        >
          <Icon size={14} style={{ color }} />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color }}>
          {data.type.replace('APPROVER_', '').replace('_', ' ')}
        </span>
      </div>

      {/* 节点名称 */}
      <div className="text-sm font-semibold text-gray-800 truncate">
        {data.name}
      </div>

      {/* 补充信息 */}
      {data.type.startsWith('APPROVER_') && data.approver && (
        <div className="text-[11px] text-gray-500 mt-1">
          {data.approver.kind === 'ROLE' ? '按角色' : data.approver.kind === 'USER' ? '指定人' : data.approver.kind === 'FIELD' ? '按字段' : data.approver.kind}
          {data.approver.quorum && data.approver.quorum < 100 ? ` (${data.approver.quorum}%)` : ''}
        </div>
      )}
      {data.type === 'CONDITION_BRANCH' && (
        <div className="text-[11px] text-gray-500 mt-1">
          {data.condition?.expressions?.length ? `${data.condition.expressions.length} 个条件` : '无条件'}
        </div>
      )}
      {data.type === 'CC' && (
        <div className="text-[11px] text-gray-500 mt-1">
          {data.ccTargets?.kind ?? '未配置'}
        </div>
      )}

      {/* 出边 Handle */}
      {!isEnd && data.type !== 'CONDITION_BRANCH' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !border-2 !bg-white"
          style={{ borderColor: color }}
        />
      )}

      {/* 条件分支有两个 Handle */}
      {data.type === 'CONDITION_BRANCH' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!w-3 !h-3 !border-2 !bg-green-500"
            style={{ borderColor: '#22c55e', top: '30%' }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            className="!w-3 !h-3 !border-2 !bg-red-500"
            style={{ borderColor: '#ef4444', top: '70%' }}
          />
          <span className="absolute text-[9px] text-green-600 font-bold" style={{ right: -18, top: '20%' }}>T</span>
          <span className="absolute text-[9px] text-red-600 font-bold" style={{ right: -18, top: '60%' }}>F</span>
        </>
      )}
    </div>
  )
}

export const CustomNodes = {
  workflowNode: memo(WorkflowNode),
}
