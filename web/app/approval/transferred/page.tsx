'use client'

import { Suspense } from 'react'
import { InstancesView } from '../_components/instances-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">加载中…</div>}>
      <InstancesView scope="transferred" title="已转交" subtitle="我转签给他人的流程" />
    </Suspense>
  )
}
