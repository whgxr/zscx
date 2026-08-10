import { prisma } from './prisma'
import { feishuService } from './feishu'
import { weworkService } from './wework'
import { dingtalkService } from './dingtalk'
import type {
  IntegrationConfig,
  IntegrationPlatform,
  IntegrationStatus,
  NotificationType,
  SendChannel,
} from '@prisma/client'

export interface SendResult {
  channel: SendChannel
  success: boolean
  errorMessage?: string
}

export interface NotificationRoutingOptions {
  type: NotificationType
  targetUserIds: number[]
  title: string
  content: string
  linkUrl?: string
  priority?: string
}

class IntegrationService {
  private platformMap: Record<string, {
    sendMessage: (userId: number, title: string, content: string) => Promise<boolean>
    sendApproval?: (userId: number, title: string, content: string, linkUrl: string) => Promise<boolean>
    loadConfig?: (config: IntegrationConfig | null) => Promise<void>
  }> = {
    FEISHU: {
      sendMessage: (userId, title, content) => feishuService.sendMessage(userId, title, content),
      sendApproval: (userId, title, content, linkUrl) => feishuService.sendApprovalNotification(userId, title, content, linkUrl),
    },
    WEWORK: {
      sendMessage: (userId, title, content) => weworkService.sendMessage(userId, title, content),
      sendApproval: (userId, title, content, linkUrl) => weworkService.sendApprovalNotification(userId, title, content, linkUrl),
    },
    DINGTALK: {
      sendMessage: (userId, title, content) => dingtalkService.sendMessage(userId, title, content),
      sendApproval: (userId, title, content, linkUrl) => dingtalkService.sendApprovalNotification(userId, title, content, linkUrl),
      loadConfig: (config) => dingtalkService.loadConfig(config),
    },
  }

  private channelToPlatform: Record<string, IntegrationPlatform> = {
    FEISHU: 'FEISHU',
    WEWORK: 'WEWORK',
    DINGTALK: 'DINGTALK',
  }

  async getConfig(platform: IntegrationPlatform): Promise<IntegrationConfig | null> {
    return prisma.integrationConfig.findUnique({ where: { platform } })
  }

  async getAllConfigs(): Promise<IntegrationConfig[]> {
    return prisma.integrationConfig.findMany({
      orderBy: { createdAt: 'asc' }
    })
  }

  async upsertConfig(data: {
    platform: IntegrationPlatform
    status?: IntegrationStatus
    appId?: string
    appSecret?: string
    webhookUrl?: string
    agentId?: string
    corpId?: string
    tenantId?: string
    extraConfig?: any
    notifyEnabled?: boolean
    approvalEnabled?: boolean
    notifyChannels?: any
  }): Promise<IntegrationConfig> {
    const updateData: any = { ...data }
    const createData: any = { ...data }
    if (data.extraConfig) {
      updateData.extraConfig = data.extraConfig
      createData.extraConfig = data.extraConfig
    }
    if (data.notifyChannels) {
      updateData.notifyChannels = data.notifyChannels
      createData.notifyChannels = data.notifyChannels
    }
    return prisma.integrationConfig.upsert({
      where: { platform: data.platform },
      update: updateData,
      create: createData,
    })
  }

  async deleteConfig(platform: IntegrationPlatform): Promise<void> {
    await prisma.integrationConfig.delete({ where: { platform } })
  }

  async testConnection(platform: IntegrationPlatform): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig(platform)
    if (!config || config.status !== 'ENABLED') {
      return { success: false, message: '该平台未启用或未配置' }
    }

    if (platform === 'DINGTALK') {
      return dingtalkService.testConnection()
    }

    return { success: true, message: `${platform} 平台配置验证通过（环境变量模式）` }
  }

  async getNotifyChannelsForType(
    config: IntegrationConfig,
    notificationType: NotificationType
  ): Promise<SendChannel[]> {
    const channelsConfig: Record<string, string[]> = config.notifyChannels
      ? (typeof config.notifyChannels === 'string'
          ? JSON.parse(config.notifyChannels)
          : config.notifyChannels)
      : {}

    const typeChannels = channelsConfig[notificationType] || channelsConfig['DEFAULT']

    if (!typeChannels) {
      return config.notifyEnabled ? [config.platform as SendChannel] : []
    }

    return typeChannels as SendChannel[]
  }

  async getActivePlatformConfigsForNotification(
    notificationType: NotificationType
  ): Promise<{ config: IntegrationConfig; channels: SendChannel[] }[]> {
    const configs = await prisma.integrationConfig.findMany({
      where: {
        status: 'ENABLED',
        notifyEnabled: true,
      }
    })

    const results: { config: IntegrationConfig; channels: SendChannel[] }[] = []

    for (const config of configs) {
      const channels = await this.getNotifyChannelsForType(config, notificationType)
      if (channels.length > 0) {
        results.push({ config, channels })
      }
    }

    return results
  }

  async routeNotification(options: NotificationRoutingOptions): Promise<SendResult[]> {
    const results: SendResult[] = []
    const { type, targetUserIds, title, content, linkUrl, priority } = options

    const activeConfigs = await this.getActivePlatformConfigsForNotification(type)

    for (const { config, channels } of activeConfigs) {
      const platform = config.platform

      if (platform === 'DINGTALK' && config.extraConfig) {
        const extra = typeof config.extraConfig === 'string'
          ? JSON.parse(config.extraConfig)
          : config.extraConfig
        if (extra?.webhookUrl) {
          const webhookResult = await dingtalkService.sendWebhookMessage(
            extra.webhookUrl, title, content
          )
          results.push({
            channel: 'DINGTALK',
            success: webhookResult,
            errorMessage: webhookResult ? undefined : 'Webhook 发送失败',
          })
        }
      }

      for (const userId of targetUserIds) {
        try {
          const handler = this.platformMap[platform]
          if (!handler) continue

          let success: boolean
          if (type === 'APPROVAL' && linkUrl && handler.sendApproval) {
            success = await handler.sendApproval(userId, title, content, linkUrl)
          } else {
            success = await handler.sendMessage(userId, title, content)
          }

          results.push({
            channel: platform as SendChannel,
            success,
            errorMessage: success ? undefined : `${platform} 用户 ${userId} 发送失败`,
          })
        } catch (error: any) {
          results.push({
            channel: platform as SendChannel,
            success: false,
            errorMessage: error.message || '发送异常',
          })
        }
      }
    }

    return results
  }

  async sendNotificationViaConfig(
    platform: IntegrationPlatform,
    userId: number,
    title: string,
    content: string,
    linkUrl?: string,
    isApproval: boolean = false
  ): Promise<SendResult> {
    const config = await this.getConfig(platform)
    if (!config || config.status !== 'ENABLED') {
      return { channel: platform as SendChannel, success: false, errorMessage: '平台未启用' }
    }

    try {
      const handler = this.platformMap[platform]
      if (!handler) {
        return { channel: platform as SendChannel, success: false, errorMessage: '未知平台' }
      }

      let success: boolean
      if (isApproval && linkUrl && handler.sendApproval) {
        success = await handler.sendApproval(userId, title, content, linkUrl)
      } else {
        success = await handler.sendMessage(userId, title, content)
      }

      return {
        channel: platform as SendChannel,
        success,
        errorMessage: success ? undefined : '发送失败',
      }
    } catch (error: any) {
      return {
        channel: platform as SendChannel,
        success: false,
        errorMessage: error.message || '发送异常',
      }
    }
  }

  async getUserBindings(platform: IntegrationPlatform) {
    return prisma.userThirdPartyBinding.findMany({
      where: { platform },
      include: { user: { select: { realName: true, username: true } } },
    })
  }

  async getAllUserBindings() {
    return prisma.userThirdPartyBinding.findMany({
      include: { user: { select: { realName: true, username: true, id: true } } },
      orderBy: [{ platform: 'asc' }, { user: { realName: 'asc' } }],
    })
  }

  async getUsersWithoutBinding(platform: IntegrationPlatform) {
    const boundUserIds = await prisma.userThirdPartyBinding
      .findMany({ where: { platform }, select: { userId: true } })
      .then(bindings => bindings.map(b => b.userId))

    return prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        id: { notIn: boundUserIds },
      },
      select: { id: true, realName: true, username: true },
      orderBy: { realName: 'asc' },
    })
  }
}

export const integrationService = new IntegrationService()