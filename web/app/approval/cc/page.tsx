'use client'

import { Suspense } from 'react'
import { InstancesView } from '../_components/instances-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">加载中…</div>}>
      <InstancesView scope="cc" title="抄送我的" subtitle="抄送给我知悉的流程" />
    </Suspense>
  )
}
