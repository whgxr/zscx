"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export interface Tab {
  key: string
  label: string
  href: string
  closable: boolean
  element: React.ReactNode | null
}

interface TabsContextValue {
  tabs: Tab[]
  activeKey: string
  activeTab: Tab | undefined
  focusTab: (key: string) => void
  closeTab: (key: string) => void
  prepareLabel: (key: string, label: string) => void
  openOrFocus: (
    key: string,
    href: string,
    element: React.ReactNode,
    closable: boolean
  ) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

/** 静态路由 -> 标签标题 */
export const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/approval': '审批中心',
  '/dashboard/approval': '审批流程',
  '/dashboard/notifications': '通知管理',
  '/dashboard/tables': '项目管理',
  '/dashboard/categories': '分类管理',
  '/dashboard/users': '用户管理',
  '/dashboard/permissions': '权限管理',
  '/dashboard/export-templates': '导出模板设计',
  '/dashboard/settings': '系统设置',
  '/dashboard/integrations': '集成管理',
  '/dashboard/audit': '审计日志中心',
  '/dashboard/error-logs': '错误日志',
  '/dashboard/profile': '个人资料',
  '/dashboard/document-templates': '文档模板',
  '/dashboard/word-templates': 'Word 模板',
  '/dashboard/roles': '角色管理',
}

/** 根据 pathname + 查询参数解析标签唯一 key */
export function resolveKey(
  pathname: string,
  search: URLSearchParams | null
): string {
  if (pathname.startsWith('/dashboard/data/')) {
    const module = search?.get('module')
    return module ? `${pathname}?module=${module}` : pathname
  }
  if (pathname === '/approval') {
    const tab = search?.get('tab')
    return tab ? `${pathname}?tab=${tab}` : pathname
  }
  return pathname
}

/** 从 href 字符串解析标签 key（供侧边栏注册标题用） */
export function resolveKeyFromHref(href: string): string {
  try {
    const u = new URL(href, 'http://local')
    return resolveKey(u.pathname, u.searchParams)
  } catch {
    return href
  }
}

/** 无标题时的兜底标题 */
export function fallbackLabel(key: string): string {
  const path = key.split('?')[0]
  return ROUTE_TITLES[path] || (path.split('/').filter(Boolean).pop() || '页面')
}

export function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('useTabs must be used within TabsProvider')
  return ctx
}

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const router = useRouter()

  const initialKey = useMemo(() => resolveKey(pathname, search), [pathname, search])
  const initialHref = useMemo(
    () => `${pathname}${search ? `?${search.toString()}` : ''}`,
    [pathname, search]
  )

  // 首页（仪表盘）作为常驻标签；若首次进入其它页面则一并加入
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const home: Tab = {
      key: '/dashboard',
      label: '仪表盘',
      href: '/dashboard',
      closable: false,
      element: null,
    }
    if (initialKey === '/dashboard') return [home]
    return [
      home,
      {
        key: initialKey,
        label: fallbackLabel(initialKey),
        href: initialHref,
        closable: true,
        element: null,
      },
    ]
  })
  const [activeKey, setActiveKey] = useState<string>(initialKey)

  const tabsRef = useRef(tabs)
  tabsRef.current = tabs

  // 侧边栏预注册的动态标题（如数据表名）
  const labelsRef = useRef<Record<string, string>>({})

  const prepareLabel = useCallback((key: string, label: string) => {
    labelsRef.current[key] = label
    // 标签已存在时同步刷新标题（供页面自身在挂载时注册动态标题）
    setTabs(prev =>
      prev.map(t => (t.key === key && t.label !== label ? { ...t, label } : t))
    )
  }, [])

  const openOrFocus = useCallback(
    (
      key: string,
      href: string,
      element: React.ReactNode,
      closable: boolean
    ) => {
      const label = labelsRef.current[key]
      setTabs(prev => {
        const exists = prev.some(t => t.key === key)
        if (exists) {
          return prev.map(t =>
            t.key === key
              ? { ...t, element, href, label: label || t.label }
              : t
          )
        }
        return [
          ...prev,
          {
            key,
            href,
            label: label || fallbackLabel(key),
            closable,
            element,
          },
        ]
      })
      setActiveKey(key)
    },
    []
  )

  const focusTab = useCallback(
    (key: string) => {
      const t = tabsRef.current.find(item => item.key === key)
      if (!t) return
      setActiveKey(key)
      // 同步地址栏与标签状态，保证内容/刷新/侧边栏高亮与标签一致
      if (t.href && t.href !== window.location.pathname + window.location.search) {
        router.push(t.href)
      }
    },
    [router]
  )

  const closeTab = useCallback(
    (key: string) => {
      const current = tabsRef.current
      const idx = current.findIndex(t => t.key === key)
      if (idx === -1) return
      const next = current.filter(t => t.key !== key)
      const wasActive = key === activeKey
      setTabs(next)
      if (wasActive) {
        if (next.length) {
          const neighbor = next[Math.min(idx, next.length - 1)]
          setActiveKey(neighbor.key)
          router.push(neighbor.href)
        } else {
          setActiveKey('/dashboard')
          router.push('/dashboard')
        }
      }
    },
    [activeKey, router]
  )

  // 监听路由变化：跳转/刷新时始终聚焦当前路径标签
  useEffect(() => {
    setActiveKey(resolveKey(pathname, search))
  }, [pathname, search])

  const value = useMemo<TabsContextValue>(
    () => ({
      tabs,
      activeKey,
      activeTab: tabs.find(t => t.key === activeKey),
      focusTab,
      closeTab,
      prepareLabel,
      openOrFocus,
    }),
    [tabs, activeKey, focusTab, closeTab, prepareLabel, openOrFocus]
  )

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>
}
