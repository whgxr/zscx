import type { Metadata } from "next"
import "../globals.css"

export const metadata: Metadata = {
  title: "房屋征收调查系统 - 移动端",
  description: "房屋征收调查数据管理系统移动端",
}

export default function H5Layout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}