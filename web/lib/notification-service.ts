import { prisma } from './prisma'
import type { Notification, NotificationType, TargetType, NotificationPriority } from '@prisma/client'

export interface CreateNotificationOptions {
  type: NotificationType
  title: string
  content: string
  targetType: TargetType
  targetRoleId?: number
  targetUserIds?: number[]
  priority?: NotificationPriority
  linkUrl?: string
  linkParams?: Record<string, any>
  createdBy?: number
  expiredAt?: Date
}

export class NotificationService {
  async createNotification(options: CreateNotificationOptions): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        type: options.type,
        title: options.title,
        content: options.content,
        targetType: options.targetType,
        targetRoleId: options.targetRoleId,
        targetUserIds: options.targetUserIds ? JSON.stringify(options.targetUserIds) : undefined,
        priority: options.priority || 'NORMAL',
        linkUrl: options.linkUrl,
        linkParams: options.linkParams ? JSON.stringify(options.linkParams) : undefined,
        createdBy: options.createdBy,
        expiredAt: options.expiredAt
      }
    })

    await this.sendNotification(notification)

    return notification
  }

  private async sendNotification(notification: Notification) {
    const users = await this.getTargetUsers(notification)

    for (const user of users) {
      await prisma.notificationRead.create({
        data: {
          notificationId: notification.id,
          userId: user.id
        }
      })

      await prisma.notificationSendLog.create({
        data: {
          notificationId: notification.id,
          userId: user.id,
          channel: 'INTERNAL',
          status: 'SUCCESS',
          sentAt: new Date()
        }
      })
    }
  }

  private async getTargetUsers(notification: Notification): Promise<{ id: number }[]> {
    switch (notification.targetType) {
      case 'ALL':
        return prisma.user.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true }
        })

      case 'ROLE':
        if (notification.targetRoleId) {
          return prisma.user.findMany({
            where: { roleId: notification.targetRoleId, status: 'ACTIVE' },
            select: { id: true }
          })
        }
        return []

      case 'USER':
        if (notification.targetUserIds) {
          const userIds = JSON.parse(JSON.stringify(notification.targetUserIds)) as number[]
          return prisma.user.findMany({
            where: { id: { in: userIds }, status: 'ACTIVE' },
            select: { id: true }
          })
        }
        return []

      default:
        return []
    }
  }

  async getNotifications(userId: number, options?: {
    type?: NotificationType
    page?: number
    pageSize?: number
    includeRead?: boolean
  }) {
    const page = options?.page || 1
    const pageSize = options?.pageSize || 20

    const where: any = {
      OR: [
        { targetType: 'ALL' },
        { targetType: 'USER', targetUserIds: { contains: `[${userId}]` } }
      ],
      expiredAt: { not: { lt: new Date() } }
    }

    if (options?.type) {
      where.type = options.type
    }

    const roleIds = await prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true }
    }).then(u => u?.roleId ? [u.roleId] : [])

    if (roleIds.length > 0) {
      where.OR.push({ targetType: 'ROLE', targetRoleId: { in: roleIds } })
    }

    const notifications = await prisma.notification.findMany({
      where,
      include: {
        creator: { select: { realName: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })

    const notificationIds = notifications.map(n => n.id)
    const readRecords = await prisma.notificationRead.findMany({
      where: { notificationId: { in: notificationIds }, userId },
      select: { notificationId: true, readAt: true, isDeleted: true }
    })

    const readMap = new Map(readRecords.map(r => [r.notificationId, r]))

    return notifications.map(n => ({
      ...n,
      isRead: !!readMap.get(n.id)?.readAt,
      isDeleted: !!readMap.get(n.id)?.isDeleted,
      readAt: readMap.get(n.id)?.readAt
    }))
  }

  async getUnreadCount(userId: number): Promise<number> {
    const notifications = await this.getNotifications(userId, { pageSize: 1000 })
    return notifications.filter(n => !n.isRead && !n.isDeleted).length
  }

  async markAsRead(notificationId: number, userId: number) {
    await prisma.notificationRead.upsert({
      where: {
        notificationId_userId: { notificationId, userId }
      },
      update: { readAt: new Date() },
      create: { notificationId, userId, readAt: new Date() }
    })
  }

  async markAllAsRead(userId: number) {
    const notifications = await this.getNotifications(userId, { pageSize: 1000 })
    const unreadIds = notifications.filter(n => !n.isRead).map(n => n.id)

    await prisma.notificationRead.updateMany({
      where: { notificationId: { in: unreadIds }, userId },
      data: { readAt: new Date() }
    })
  }

  async deleteNotification(notificationId: number, userId: number) {
    await prisma.notificationRead.update({
      where: { notificationId_userId: { notificationId, userId } },
      data: { isDeleted: true }
    })
  }

  async publishSystemNotification(options: {
    title: string
    content: string
    targetType: 'ALL' | 'ROLE' | 'USER'
    targetRoleId?: number
    targetUserIds?: number[]
    priority?: NotificationPriority
  }, userId: number) {
    return this.createNotification({
      type: 'SYSTEM',
      title: options.title,
      content: options.content,
      targetType: options.targetType,
      targetRoleId: options.targetRoleId,
      targetUserIds: options.targetUserIds,
      priority: options.priority,
      createdBy: userId
    })
  }

  async createApprovalNotification(instanceId: number, assigneeIds: number[]) {
    const instance = await prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        table: { select: { label: true } },
        initiator: { select: { realName: true } }
      }
    })

    if (!instance) {
      throw new Error('Approval instance not found')
    }

    return this.createNotification({
      type: 'APPROVAL',
      title: '您有一条新的审批待办',
      content: `${instance.initiator?.realName || '未知用户'}提交的"${instance.table.label}"需要您审批，请及时处理。`,
      targetType: 'USER',
      targetUserIds: assigneeIds,
      priority: 'HIGH',
      linkUrl: `/dashboard/approval/${instanceId}`
    })
  }
}

export const notificationService = new NotificationService()