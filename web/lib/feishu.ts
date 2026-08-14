import axios from 'axios'
import { prisma } from './prisma'
import type { IntegrationConfig, UserThirdPartyBinding } from '@prisma/client'

interface FeishuUserInfo {
  open_id: string
  user_id: string
  union_id?: string
  avatar_url?: string
  name?: string
  email?: string
}

interface FeishuTokenResponse {
  code: number
  msg: string
  data?: {
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
    refresh_expires_in: number
    scope: string
  }
}

interface FeishuAppAccessToken {
  code: number
  msg: string
  app_access_token: string
  expires_in: number
}

export class FeishuService {
  private clientId: string = ''
  private clientSecret: string = ''
  private appAccessToken: string = ''
  private appTokenExpireTime: number = 0

  constructor() {
    this.clientId = process.env.FEISHU_CLIENT_ID || ''
    this.clientSecret = process.env.FEISHU_CLIENT_SECRET || ''
  }

  async loadConfig(config: IntegrationConfig | null): Promise<void> {
    if (config?.appId) {
      this.clientId = config.appId
    }
    if (config?.appSecret) {
      this.clientSecret = config.appSecret
    }
    this.appAccessToken = ''
    this.appTokenExpireTime = 0
  }

  async loadConfigFromDB(): Promise<void> {
    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'FEISHU' }
    })
    await this.loadConfig(config)
  }

  get hasCredentials(): boolean {
    return !!(this.clientId && this.clientSecret)
  }

  private async getAppAccessToken(): Promise<string> {
    if (Date.now() < this.appTokenExpireTime && this.appAccessToken) {
      return this.appAccessToken
    }

    if (!this.hasCredentials) {
      await this.loadConfigFromDB()
    }

    if (!this.hasCredentials) {
      throw new Error('飞书 AppID/AppSecret 未配置')
    }

    const response = await axios.post<FeishuAppAccessToken>(
      'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal',
      {
        app_id: this.clientId,
        app_secret: this.clientSecret
      }
    )

    const data = response.data
    if (data.code !== 0) {
      throw new Error(`获取 app_access_token 失败: ${data.msg}`)
    }

    this.appAccessToken = data.app_access_token
    this.appTokenExpireTime = Date.now() + (data.expires_in - 60) * 1000

    return this.appAccessToken
  }

  getOAuthAuthorizeUrl(redirectUri: string, state: string = ''): string {
    if (!this.clientId) {
      throw new Error('飞书 AppID 未配置')
    }

    const params = new URLSearchParams({
      app_id: this.clientId,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      scope: 'contact:user.base:readonly'
    })
    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`
  }

  async getUserAccessToken(code: string): Promise<{ accessToken: string; refreshToken: string; scope: string }> {
    if (!this.hasCredentials) {
      await this.loadConfigFromDB()
    }

    if (!this.hasCredentials) {
      throw new Error('飞书 AppID/AppSecret 未配置')
    }

    const appAccessToken = await this.getAppAccessToken()

    const response = await axios.post<FeishuTokenResponse>(
      'https://open.feishu.cn/open-apis/authen/v1/access_token',
      {
        grant_type: 'authorization_code',
        code
      },
      {
        headers: {
          Authorization: `Bearer ${appAccessToken}`,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    )

    const data = response.data
    if (data.code !== 0 || !data.data) {
      throw new Error(`飞书获取 user_access_token 失败: ${data.msg}`)
    }

    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      scope: data.data.scope
    }
  }

  async getUserInfo(userAccessToken: string): Promise<FeishuUserInfo> {
    const response = await axios.get<{ code: number; msg: string; data: FeishuUserInfo }>(
      'https://open.feishu.cn/open-apis/authen/v1/user_info',
      {
        headers: { Authorization: `Bearer ${userAccessToken}` }
      }
    )

    if (response.data.code !== 0) {
      throw new Error(`获取飞书用户信息失败: ${response.data.msg}`)
    }

    return response.data.data
  }

  async bindUser(userId: number, code: string): Promise<UserThirdPartyBinding> {
    if (!this.hasCredentials) {
      await this.loadConfigFromDB()
    }

    if (!this.hasCredentials) {
      throw new Error('飞书 AppID/AppSecret 未配置')
    }

    const { accessToken } = await this.getUserAccessToken(code)
    const userInfo = await this.getUserInfo(accessToken)

    const binding = await prisma.userThirdPartyBinding.upsert({
      where: {
        userId_platform: { userId, platform: 'FEISHU' }
      },
      update: {
        platformUserId: userInfo.open_id,
        platformUserName: userInfo.name || '',
        extraData: JSON.stringify({
          userId: userInfo.user_id,
          openId: userInfo.open_id,
          unionId: userInfo.union_id || null,
          name: userInfo.name,
          avatarUrl: userInfo.avatar_url,
          email: userInfo.email
        }),
        updatedAt: new Date()
      },
      create: {
        userId,
        platform: 'FEISHU',
        platformUserId: userInfo.open_id,
        platformUserName: userInfo.name || '',
        extraData: JSON.stringify({
          userId: userInfo.user_id,
          openId: userInfo.open_id,
          unionId: userInfo.union_id || null,
          name: userInfo.name,
          avatarUrl: userInfo.avatar_url,
          email: userInfo.email
        })
      }
    })

    return binding
  }

  async unbindUser(userId: number): Promise<void> {
    await prisma.userThirdPartyBinding.delete({
      where: { userId_platform: { userId, platform: 'FEISHU' } }
    })
  }

  async getTenantAccessToken(): Promise<string> {
    return this.getAppAccessToken()
  }

  async sendMessage(userId: number, title: string, content: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'FEISHU' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAppAccessToken()
      const feishuUserId = binding.platformUserId

      await axios.post(
        'https://open.feishu.cn/open-apis/message/v4/send/',
        {
          // 该旧版接口用 open_id 字段，content 需为对象（非 JSON 字符串）
          open_id: feishuUserId,
          msg_type: 'text',
          content: { text: `${title}\n\n${content}` }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      return true
    } catch (error) {
      console.error('Failed to send Feishu message:', error)
      return false
    }
  }

  async sendApprovalNotification(userId: number, title: string, content: string, linkUrl: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'FEISHU' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAppAccessToken()
      const feishuUserId = binding.platformUserId

      await axios.post(
        'https://open.feishu.cn/open-apis/message/v4/send/',
        {
          // 该旧版接口用 open_id 字段，content 需为对象（非 JSON 字符串）
          open_id: feishuUserId,
          msg_type: 'interactive',
          content: {
            config: { wide_screen_mode: true, enable_forward: true },
            elements: [
              { tag: 'div', text: { content: `${title}\n\n${content}`, tag: 'lark_md' } },
              { tag: 'action', actions: [
                { tag: 'button', text: { content: '查看详情', tag: 'plain_text' }, type: 'primary', url: linkUrl }
              ]}
            ]
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      return true
    } catch (error) {
      console.error('Failed to send Feishu approval notification:', error)
      return false
    }
  }

  async getUserBindings(): Promise<UserThirdPartyBinding[]> {
    return prisma.userThirdPartyBinding.findMany({
      where: { platform: 'FEISHU' },
      include: { user: { select: { realName: true, username: true } } }
    })
  }
}

export const feishuService = new FeishuService()
