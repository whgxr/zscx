"use client"

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { TabsBar } from './tabs-bar'
import { resolveKey, useTabs } from './tabs-context'

/**
 * 主内容区：顶部标签栏 + 下方 keep-alive 页面面板。
 * 所有已打开标签的页面始终挂载，非活动标签通过 display:none 隐藏以保留其状态。
 */
export function TabPanes({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const { tabs, activeKey, openOrFocus } = useTabs()

  // 始终持有最新 children，供路由变化时捕获
  const childrenRef = useRef(children)
  childrenRef.current = children

  const key = resolveKey(pathname, search)
  const href = `${pathname}${search ? `?${search.toString()}` : ''}`

  // 路由变化：新增标签或聚焦已有标签，并捕获该路由的最新内容
  useEffect(() => {
    openOrFocus(key, href, childrenRef.current, key !== '/dashboard')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, href])

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabsBar />
      <main className="flex-1 overflow-auto bg-gray-50">
        {tabs.map(t => {
          const isActive = t.key === activeKey
          return (
            <div key={t.key} className={isActive ? 'h-full p-6' : 'hidden p-6'}>
              {isActive && t.element == null ? children : t.element}
            </div>
          )
        })}
      </main>
    </div>
  )
}
