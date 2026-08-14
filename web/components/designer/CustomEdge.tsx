/**
 * 自定义连线组件
 *
 * 为 ReactFlow 边提供更大的点击区域，使连线易于选中和删除。
 * 使用一条不可见的宽路径作为命中区域，叠加在可见的连线之上。
 */
'use client'

import React from 'react'
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  selected,
  ...props
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  return (
    <g className="group">
      {/* 不可见的宽路径 - 用于点击命中检测 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: 'pointer' }}
        className="react-flow__edge-interaction"
      />
      {/* 可见的连线 */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 1.5,
          stroke: selected ? '#3b82f6' : '#94a3b8',
        }}
        {...props}
      />
    </g>
  )
}
