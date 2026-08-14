'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClipboardCheck, CheckCircle2, ArrowRightLeft, FolderKanban, Bell, FileDown, PlusCircle } from 'lucide-react'
import TodoPage from './todo/page'
import MinePage from './mine/page'
import { InstancesView } from './_components/instances-view'
import { ExportView } from './_components/export-view'
import { SpecialApplyPage } from './_components/special-apply'

function MyApproval() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = (searchParams.get('tab') as string) || 'todo'
  const setTab = (v: string) => router.replace(`/approval?tab=${v}`)

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">我的审批</h1>
        <p className="text-sm text-slate-500 mt-1">
          统一处理待审批、已审批、已转交、我发起的、抄送我的及我的导出
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="apply">
            <PlusCircle className="w-4 h-4 mr-1" />发起申请
          </TabsTrigger>
          <TabsTrigger value="todo">
            <ClipboardCheck className="w-4 h-4 mr-1" />待审批
          </TabsTrigger>
          <TabsTrigger value="approved">
            <CheckCircle2 className="w-4 h-4 mr-1" />已审批
          </TabsTrigger>
          <TabsTrigger value="transferred">
            <ArrowRightLeft className="w-4 h-4 mr-1" />已转交
          </TabsTrigger>
          <TabsTrigger value="mine">
            <FolderKanban className="w-4 h-4 mr-1" />我发起的
          </TabsTrigger>
          <TabsTrigger value="cc">
            <Bell className="w-4 h-4 mr-1" />抄送我的
          </TabsTrigger>
          <TabsTrigger value="export">
            <FileDown className="w-4 h-4 mr-1" />我的导出
          </TabsTrigger>
        </TabsList>
        <TabsContent value="apply" className="mt-4"><SpecialApplyPage /></TabsContent>
        <TabsContent value="todo" className="mt-4"><TodoPage /></TabsContent>
        <TabsContent value="approved" className="mt-4"><InstancesView scope="approved" title="已审批" subtitle="我审批通过过的流程" /></TabsContent>
        <TabsContent value="transferred" className="mt-4"><InstancesView scope="transferred" title="已转交" subtitle="我转签给他人的流程" /></TabsContent>
        <TabsContent value="mine" className="mt-4"><MinePage /></TabsContent>
        <TabsContent value="cc" className="mt-4"><InstancesView scope="cc" title="抄送我的" subtitle="抄送给我知悉的流程" /></TabsContent>
        <TabsContent value="export" className="mt-4"><ExportView /></TabsContent>
      </Tabs>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">加载中…</div>}>
      <MyApproval />
    </Suspense>
  )
}
