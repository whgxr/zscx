"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Users,
  Database,
  Upload,
  TrendingUp,
  Clock,
  BarChart3,
  Settings,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Save,
  RotateCcw,
  GripVertical,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import Link from 'next/link'

interface DashboardData {
  tableCount: number
  userCount: number
  onlineUserCount: number
  recordCount: number
  todayNewCount: number
  recentRecords: any[]
  tableRecordStats: any[]
  userRole: string
}

interface WidgetConfig {
  id: string
  type: string
  title: string
  colSpan: 1 | 2 | 4
  enabled: boolean
  order: number
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'total-projects', type: 'stat-total-projects', title: '总项目数', colSpan: 1, enabled: true, order: 0 },
  { id: 'total-records', type: 'stat-total-records', title: '数据记录数', colSpan: 1, enabled: true, order: 1 },
  { id: 'total-users', type: 'stat-total-users', title: '总用户数', colSpan: 1, enabled: true, order: 2 },
  { id: 'online-users', type: 'stat-online-users', title: '在线用户数', colSpan: 1, enabled: true, order: 3 },
  { id: 'today-new', type: 'stat-today-new', title: '今日新增', colSpan: 1, enabled: true, order: 4 },
  { id: 'project-data-chart', type: 'chart-project-data', title: '各项目数据量', colSpan: 2, enabled: true, order: 5 },
  { id: 'recent-records', type: 'list-recent-records', title: '最近记录', colSpan: 1, enabled: true, order: 6 },
  { id: 'quick-actions', type: 'card-quick-actions', title: '快捷操作', colSpan: 1, enabled: true, order: 7 },
]

const AVAILABLE_WIDGETS = [
  { type: 'stat-total-projects', title: '总项目数', category: '统计卡片', icon: Database },
  { type: 'stat-total-records', title: '数据记录数', category: '统计卡片', icon: FileText },
  { type: 'stat-total-users', title: '总用户数', category: '统计卡片', icon: Users },
  { type: 'stat-online-users', title: '在线用户数', category: '统计卡片', icon: Users },
  { type: 'stat-today-new', title: '今日新增', category: '统计卡片', icon: TrendingUp },
  { type: 'chart-project-data', title: '各项目数据量', category: '图表卡片', icon: BarChart3 },
  { type: 'list-recent-records', title: '最近记录', category: '列表卡片', icon: Clock },
  { type: 'card-quick-actions', title: '快捷操作', category: '卡片', icon: Upload },
]

interface DashboardClientProps {
  initialData: DashboardData
  initialConfig: WidgetConfig[] | null
}

export function DashboardClient({ initialData, initialConfig }: DashboardClientProps) {
  const [data] = useState<DashboardData>(initialData)
  const [widgets, setWidgets] = useState<WidgetConfig[]>(initialConfig || DEFAULT_WIDGETS)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)

  const enabledWidgets = widgets
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)

  const disabledWidgets = widgets
    .filter(w => !w.enabled)
    .sort((a, b) => a.order - b.order)

  const getColSpanClass = (colSpan: number) => {
    switch (colSpan) {
      case 1: return 'col-span-1'
      case 2: return 'col-span-1 md:col-span-2'
      case 4: return 'col-span-1 md:col-span-2 lg:col-span-4'
      default: return 'col-span-1'
    }
  }

  const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
    setWidgets(prev => {
      const newWidgets = [...prev]
      const enabledList = newWidgets.filter(w => w.enabled).sort((a, b) => a.order - b.order)
      const currentIndex = enabledList.findIndex(w => w.id === widgetId)
      if (currentIndex === -1) return prev

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= enabledList.length) return prev

      const currentWidget = enabledList[currentIndex]
      const targetWidget = enabledList[targetIndex]

      const tempOrder = currentWidget.order
      newWidgets.find(w => w.id === currentWidget.id)!.order = targetWidget.order
      newWidgets.find(w => w.id === targetWidget.id)!.order = tempOrder

      return newWidgets
    })
  }

  const toggleWidget = (widgetId: string) => {
    setWidgets(prev => {
      const newWidgets = [...prev]
      const widget = newWidgets.find(w => w.id === widgetId)
      if (widget) {
        widget.enabled = !widget.enabled
      }
      return newWidgets
    })
  }

  const changeColSpan = (widgetId: string, colSpan: 1 | 2 | 4) => {
    setWidgets(prev => {
      const newWidgets = [...prev]
      const widget = newWidgets.find(w => w.id === widgetId)
      if (widget) {
        widget.colSpan = colSpan
      }
      return newWidgets
    })
  }

  const addWidget = (widgetType: string) => {
    const widgetInfo = AVAILABLE_WIDGETS.find(w => w.type === widgetType)
    if (!widgetInfo) return

    const existing = widgets.find(w => w.type === widgetType)
    if (existing) {
      toggleWidget(existing.id)
    } else {
      const newWidget: WidgetConfig = {
        id: `${widgetType}-${Date.now()}`,
        type: widgetType,
        title: widgetInfo.title,
        colSpan: widgetInfo.category === '统计卡片' ? 1 : 2,
        enabled: true,
        order: widgets.length,
      }
      setWidgets(prev => [...prev, newWidget])
    }
    setShowAddWidget(false)
  }

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/dashboard-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: widgets }),
      })
      if (res.ok) {
        setIsEditing(false)
        alert('配置保存成功')
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const cancelEdit = () => {
    if (initialConfig) {
      setWidgets(initialConfig)
    } else {
      setWidgets(DEFAULT_WIDGETS)
    }
    setIsEditing(false)
  }

  const quickActions = [
    {
      title: '导入数据',
      description: '批量导入Excel数据',
      icon: Upload,
      color: 'text-blue-500',
      href: '/dashboard/tables',
    },
    {
      title: '导出报表',
      description: '导出数据为Excel/PDF',
      icon: FileText,
      color: 'text-green-500',
      href: '/dashboard/export-templates',
    },
    {
      title: '项目管理',
      description: '自定义数据表结构',
      icon: Database,
      color: 'text-purple-500',
      href: '/dashboard/tables',
    },
    {
      title: '用户管理',
      description: '管理用户和权限',
      icon: Users,
      color: 'text-orange-500',
      href: '/dashboard/users',
      adminOnly: true,
    },
  ]

  const showQuickAction = (action: any) => {
    if (action.adminOnly && data.userRole !== 'ADMIN') return false
    return true
  }

  const renderWidgetContent = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'stat-total-projects':
        return (
          <StatCard
            label="总项目数"
            value={data.tableCount}
            icon={Database}
            color="bg-blue-500"
          />
        )
      case 'stat-total-records':
        return (
          <StatCard
            label="数据记录数"
            value={data.recordCount}
            icon={FileText}
            color="bg-green-500"
          />
        )
      case 'stat-total-users':
        return (
          <StatCard
            label="总用户数"
            value={data.userCount}
            icon={Users}
            color="bg-purple-500"
          />
        )
      case 'stat-online-users':
        return (
          <StatCard
            label="在线用户数"
            value={data.onlineUserCount}
            icon={Users}
            color="bg-cyan-500"
          />
        )
      case 'stat-today-new':
        return (
          <StatCard
            label="今日新增"
            value={data.todayNewCount}
            icon={TrendingUp}
            color="bg-orange-500"
          />
        )
      case 'chart-project-data':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                各项目数据量统计（前10）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.tableRecordStats.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const maxCount = Math.max(...data.tableRecordStats.map((s: any) => s.count))
                    return data.tableRecordStats.map((stat: any, index: number) => (
                      <div key={stat.tableId} className="flex items-center gap-3">
                        <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center text-xs font-medium text-gray-500">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700 truncate">{stat.tableLabel}</span>
                            <span className="text-sm text-gray-500 ml-2 flex-shrink-0">{stat.count} 条</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${maxCount > 0 ? (stat.count / maxCount) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>暂无数据</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      case 'list-recent-records':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">最近记录</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentRecords.length > 0 ? (
                <div className="space-y-4">
                  {data.recentRecords.map((record: any) => (
                    <div key={record.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">记录 #{record.id}</p>
                          <p className="text-xs text-gray-500">{record.table.label}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{formatDateTime(record.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>暂无记录</p>
                </div>
              )}
            </CardContent>
          </Card>
        )
      case 'card-quick-actions':
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">快捷操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {quickActions.filter(showQuickAction).map((action) => {
                  const Icon = action.icon
                  return (
                    <Link
                      key={action.title}
                      href={action.href}
                      className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors block"
                    >
                      <Icon className={`w-8 h-8 ${action.color} mb-2`} />
                      <p className="font-medium">{action.title}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </Link>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      default:
        return null
    }
  }

  const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
          <p className="text-gray-500 mt-1">欢迎使用房屋征收调查系统</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              自定义布局
            </Button>
          ) : (
            <>
              <Button onClick={cancelEdit} variant="outline" disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-2" />
                取消
              </Button>
              <Button onClick={saveConfig} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <Card className="border-dashed border-blue-300 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700">
                <Settings className="w-5 h-5" />
                <span className="font-medium">编辑模式</span>
                <span className="text-sm text-blue-600">— 拖拽或使用箭头调整顺序，选择列数</span>
              </div>
              <Button onClick={() => setShowAddWidget(!showAddWidget)} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                添加小组件
              </Button>
            </div>

            {showAddWidget && (
              <div className="mt-4 p-4 bg-white rounded-lg border">
                <p className="text-sm font-medium text-gray-700 mb-3">可选小组件</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {AVAILABLE_WIDGETS.map((widget) => {
                    const Icon = widget.icon
                    const isAdded = widgets.find(w => w.type === widget.type)?.enabled
                    return (
                      <button
                        key={widget.type}
                        onClick={() => addWidget(widget.type)}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          isAdded
                            ? 'border-green-300 bg-green-50'
                            : 'hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-1 ${isAdded ? 'text-green-600' : 'text-gray-600'}`} />
                        <p className="text-sm font-medium">{widget.title}</p>
                        <p className="text-xs text-gray-500">{widget.category}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {enabledWidgets.map((widget) => (
          <div key={widget.id} className={getColSpanClass(widget.colSpan)}>
            {isEditing ? (
              <div className="relative group">
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-gray-800 text-white px-2 py-1 rounded-md text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3" />
                  {widget.title}
                </div>
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <select
                    value={widget.colSpan}
                    onChange={(e) => changeColSpan(widget.id, parseInt(e.target.value) as 1 | 2 | 4)}
                    className="text-xs bg-white border rounded px-2 py-1"
                  >
                    <option value={1}>1列</option>
                    <option value={2}>2列</option>
                    <option value={4}>4列</option>
                  </select>
                  <button
                    onClick={() => moveWidget(widget.id, 'up')}
                    className="p-1 bg-white border rounded hover:bg-gray-100"
                    title="上移"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveWidget(widget.id, 'down')}
                    className="p-1 bg-white border rounded hover:bg-gray-100"
                    title="下移"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleWidget(widget.id)}
                    className="p-1 bg-white border rounded hover:bg-red-100 text-red-500"
                    title="移除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="opacity-90 ring-2 ring-blue-300 ring-offset-2 rounded-lg">
                  {renderWidgetContent(widget)}
                </div>
              </div>
            ) : (
              renderWidgetContent(widget)
            )}
          </div>
        ))}
      </div>

      {isEditing && disabledWidgets.length > 0 && (
        <Card className="border-dashed border-gray-300">
          <CardHeader>
            <CardTitle className="text-base text-gray-600">已隐藏的小组件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {disabledWidgets.map((widget) => (
                <button
                  key={widget.id}
                  onClick={() => toggleWidget(widget.id)}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4 text-green-600" />
                  {widget.title}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
