import { prisma } from './prisma'
import type { Notification, NotificationType, TargetType, NotificationPriority } from '@prisma/client'
import { integrationService } from './integration-service'

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
        // targetUserIds / linkParams 为 Json 字段，直接传数组/对象，由 Prisma 序列化，避免双重编码
        targetUserIds: options.targetUserIds,
        priority: options.priority || 'NORMAL',
        linkUrl: options.linkUrl,
        linkParams: options.linkParams,
        createdBy: options.createdBy,
        expiredAt: options.expiredAt
      }
    })

    await this.sendNotification(notification)

    return notification
  }

  private async sendNotification(notification: Notification) {
    const users = await this.getTargetUsers(notification)
    const title = notification.title
    const content = notification.content
    const linkUrl = notification.linkUrl || undefined

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

    if (users.length > 0) {
      try {
        const thirdPartyResults = await integrationService.routeNotification({
          type: notification.type,
          targetUserIds: users.map(u => u.id),
          title,
          content,
          linkUrl,
          priority: notification.priority,
        })

        for (const result of thirdPartyResults) {
          if (!result.success && result.errorMessage) {
            console.warn(`[Notification] ${result.channel} 发送失败: ${result.errorMessage}`)
          }
        }
      } catch (error) {
        console.error('[Notification] 第三方路由异常:', error)
      }
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
          const raw = notification.targetUserIds as any
          // 兼容数组与字符串两种存储形态（历史数据可能被双重 encode 为字符串）
          const userIds: number[] = Array.isArray(raw)
            ? raw
            : typeof raw === 'string'
              ? JSON.parse(raw)
              : []
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
        // USER 类型通知无法用 Json contains 在 MySQL 上可靠过滤，先全量取出，再在后处理中按 targetUserIds 判断是否发给当前用户
        { targetType: 'USER' },
      ],
      // expiredAt 为 NULL 表示永久有效，必须显式包含；否则 Prisma 的 NOT(col < now)
      // 会因为 SQL 三值逻辑把 NULL 行过滤掉，导致所有未设置过期时间的通知都收不到
      AND: [
        {
          OR: [
            { expiredAt: null },
            { expiredAt: { gte: new Date() } },
          ],
        },
      ],
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
      // 这里不走 skip/take，而是取稍大一点再后处理过滤 USER 类型，避免 JSON where 兼容性问题
      take: pageSize * 5,
    })

    // 后处理：过滤掉 targetType=USER 但当前 userId 不在 targetUserIds 里的记录
    const filtered = notifications.filter((n: any) => {
      if (n.targetType !== 'USER') return true
      try {
        const raw = n.targetUserIds as any
        // 兼容数组与字符串两种存储形态（历史数据可能被双重 encode 为字符串）
        const ids: number[] = Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : []
        return ids.includes(userId)
      } catch {
        return false
      }
    }).slice(0, pageSize)

    const notificationIds = filtered.map(n => n.id)
    const readRecords = await prisma.notificationRead.findMany({
      where: { notificationId: { in: notificationIds }, userId },
      select: { notificationId: true, readAt: true, isDeleted: true }
    })

    const readMap = new Map(readRecords.map(r => [r.notificationId, r]))

    return filtered
      .map(n => ({
        ...n,
        isRead: !!readMap.get(n.id)?.readAt,
        isDeleted: !!readMap.get(n.id)?.isDeleted,
        readAt: readMap.get(n.id)?.readAt
      }))
      // 过滤掉用户已删除的通知，避免删除后刷新又重新出现
      .filter(n => !n.isDeleted)
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
    await prisma.notificationRead.updateMany({
      where: { notificationId, userId },
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
      linkUrl: `/approval?tab=todo`
    })
  }
}

export const notificationService = new NotificationService()