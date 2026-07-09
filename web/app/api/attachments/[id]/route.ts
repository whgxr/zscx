import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的附件ID' }, { status: 400 })
    }

    const attachment = await prisma.recordAttachment.findUnique({
      where: { id },
    })

    if (!attachment) {
      return NextResponse.json({ message: '附件不存在' }, { status: 404 })
    }

    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER' && attachment.uploadedBy !== user.id) {
      return NextResponse.json({ message: '无权限删除该附件' }, { status: 403 })
    }

    const filePath = path.join(process.cwd(), 'public', attachment.filePath)
    try {
      await unlink(filePath)
    } catch (e) {
      console.error('Delete attachment file error:', e)
    }

    await prisma.recordAttachment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete attachment error:', error)
    return NextResponse.json({ message: '删除失败' }, { status: 500 })
  }
}
