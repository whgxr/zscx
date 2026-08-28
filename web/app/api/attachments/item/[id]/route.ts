import { NextRequest, NextResponse } from 'next/server'
import { unlink, readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { getObjectBuffer, removeObject } from '@/lib/storage'

export const runtime = 'nodejs'

/** 读取附件内容：新文件从对象存储读，旧文件（filePath 以 /uploads/ 开头）从本地磁盘读 */
async function readAttachmentBuffer(attachment: { filePath: string; mimeType?: string | null }): Promise<Buffer> {
  if (attachment.filePath.startsWith('/uploads/')) {
    return readFile(path.join(process.cwd(), 'public', attachment.filePath))
  }
  return getObjectBuffer(attachment.filePath)
}

export async function GET(
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

    try {
      const fileBuffer = await readAttachmentBuffer(attachment)
      
      const headers = new Headers()
      headers.set('Content-Type', attachment.mimeType)
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`)
      headers.set('Content-Length', attachment.fileSize.toString())
      
      return new NextResponse(new Uint8Array(fileBuffer), { headers })
    } catch (e) {
      console.error('Read attachment file error:', e)
      return NextResponse.json({ message: '文件不存在' }, { status: 404 })
    }
  } catch (error) {
    console.error('Download attachment error:', error)
    return NextResponse.json({ message: '下载失败' }, { status: 500 })
  }
}

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

    // 附件删除权限控制：管理员/管理员角色可直接删除；其余用户必须具备该附件所属数据表的删除权限
    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: attachment.tableId } },
      })
      if (!permission || !permission.canDelete) {
        return NextResponse.json({ message: '无权限删除该附件' }, { status: 403 })
      }
    }

    if (attachment.filePath.startsWith('/uploads/')) {
      try {
        await unlink(path.join(process.cwd(), 'public', attachment.filePath))
      } catch (e) {
        console.error('Delete attachment file error:', e)
      }
    } else {
      // 对象存储中的文件：删除对象
      try {
        await removeObject(attachment.filePath)
      } catch (e) {
        console.error('Delete attachment object error:', e)
      }
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
