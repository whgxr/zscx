"use client"

import { X, Home } from 'lucide-react'
import { useTabs } from './tabs-context'
import { cn } from '@/lib/utils'

export function TabsBar() {
  const { tabs, activeKey, focusTab, closeTab } = useTabs()

  return (
    <div className="h-11 shrink-0 bg-white border-b border-gray-200 flex items-center gap-1.5 px-3 overflow-x-auto scrollbar-thin">
      {tabs.map(t => {
        const active = t.key === activeKey
        const isHome = t.key === '/dashboard'
        return (
          <div
            key={t.key}
            onClick={() => focusTab(t.key)}
            title={t.label}
            className={cn(
              'group flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-md text-[13px] cursor-pointer whitespace-nowrap transition-colors border',
              active
                ? 'bg-primary/10 text-primary border-primary/25 font-medium'
                : 'text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
            )}
          >
            {isHome ? (
              <Home className="w-3.5 h-3.5" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
            )}
            <span className="max-w-[160px] truncate">{t.label}</span>
            {t.closable ? (
              <button
                type="button"
                aria-label={`关闭 ${t.label}`}
                onClick={e => {
                  e.stopPropagation()
                  closeTab(t.key)
                }}
                className="rounded p-0.5 text-gray-400 hover:bg-black/10 hover:text-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="w-5" />
            )}
          </div>
        )
      })}
    </div>
  )
}
