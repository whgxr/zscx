import WorkspaceShell from '@/components/layout/workspace-shell'

export default function ApprovalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>
}