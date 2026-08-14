'use client'

import { Suspense } from 'react'
import { ExportView } from '../_components/export-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">加载中…</div>}>
      <ExportView />
    </Suspense>
  )
}
