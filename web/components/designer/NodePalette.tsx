/**
 * 节点调色板组件
 *
 * 左侧面板，展示可拖拽到画布的节点类型列表。
 */
'use client'

import React from 'react'
import { PALETTE_ITEMS, type NodeType, NODE_COLORS } from './designer-types'
import {
  UserCheck, Users, UserPlus, GitBranch, Layers, Mail,
} from 'lucide-react'

const ICON_MAP: Record<string, React.ElementType> = {
  APPROVER_SINGLE: UserCheck,
  APPROVER_COUNTERSIGN: Users,
  APPROVER_ORSIGN: UserPlus,
  CONDITION_BRANCH: GitBranch,
  PARALLEL: Layers,
  CC: Mail,
}

type Props = {
  onAddNode: (type: NodeType) => void
}

export function NodePalette({ onAddNode }: Props) {
  return (
    <div className="w-52 border-r bg-gray-50/80 p-3 flex flex-col gap-2 overflow-y-auto shrink-0">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
        节点类型
      </h3>
      {PALETTE_ITEMS.map(item => {
        const Icon = ICON_MAP[item.type] ?? UserCheck
        const color = NODE_COLORS[item.type] ?? '#6b7280'
        return (
          <button
            key={item.type}
            onClick={() => onAddNode(item.type)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white hover:shadow-sm hover:border-blue-300 transition-all text-left group"
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ backgroundColor: color + '15' }}
            >
              <Icon size={16} style={{ color }} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800">{item.label}</div>
              <div className="text-[11px] text-gray-400">{item.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
