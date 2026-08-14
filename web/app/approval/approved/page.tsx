'use client'

import { Suspense } from 'react'
import { InstancesView } from '../_components/instances-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">加载中…</div>}>
      <InstancesView scope="approved" title="已审批" subtitle="我审批通过过的流程" />
    </Suspense>
  )
}
