import axios from 'axios'
import { prisma } from './prisma'
import type { UserThirdPartyBinding } from '@prisma/client'

interface FeishuUserInfo {
  open_id: string
  user_id: string
  union_id?: string
  avatar_url?: string
  name?: string
}

interface FeishuAccessToken {
  tenant_access_token: string
  expires_in: number
}

export class FeishuService {
  private clientId: string
  private clientSecret: string
  private tenantAccessToken: string = ''
  private tokenExpireTime: number = 0

  constructor() {
    this.clientId = process.env.FEISHU_CLIENT_ID || ''
    this.clientSecret = process.env.FEISHU_CLIENT_SECRET || ''
  }

  async getTenantAccessToken(): Promise<string> {
    if (Date.now() < this.tokenExpireTime && this.tenantAccessToken) {
      return this.tenantAccessToken
    }

    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: this.clientId,
      app_secret: this.clientSecret
    })

    const data = response.data as FeishuAccessToken
    this.tenantAccessToken = data.tenant_access_token
    this.tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000

    return this.tenantAccessToken
  }

  getOAuthAuthorizeUrl(redirectUri: string, state: string = ''): string {
    const params = new URLSearchParams({
      app_id: this.clientId,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      scope: 'openid,user_info'
    })
    return `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`
  }

  async getAccessToken(code: string): Promise<{ accessToken: string; userId: string; openId: string }> {
    const response = await axios.post('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      app_id: this.clientId,
      app_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code'
    })

    const data = response.data
    return {
      accessToken: data.access_token,
      userId: data.user_id,
      openId: data.open_id
    }
  }

  async getUserInfo(accessToken: string): Promise<FeishuUserInfo> {
    const response = await axios.get('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    return response.data.data
  }

  async bindUser(userId: number, code: string): Promise<UserThirdPartyBinding> {
    const tokenResult = await this.getAccessToken(code)
    const userInfo = await this.getUserInfo(tokenResult.accessToken)

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
          avatarUrl: userInfo.avatar_url
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
          avatarUrl: userInfo.avatar_url
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

  async sendMessage(userId: number, title: string, content: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'FEISHU' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getTenantAccessToken()
      const feishuUserId = binding.platformUserId

      await axios.post(
        'https://open.feishu.cn/open-apis/message/v4/send/',
        {
          receive_id_type: 'open_id',
          receive_id: feishuUserId,
          content: JSON.stringify({
            msg_type: 'text',
            content: JSON.stringify({
              text: `${title}\n\n${content}`
            })
          })
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
      const token = await this.getTenantAccessToken()
      const feishuUserId = binding.platformUserId

      await axios.post(
        'https://open.feishu.cn/open-apis/message/v4/send/',
        {
          receive_id_type: 'open_id',
          receive_id: feishuUserId,
          content: JSON.stringify({
            msg_type: 'interactive',
            content: JSON.stringify({
              config: {
                wide_screen_mode: true,
                enable_forward: true
              },
              elements: [
                {
                  tag: 'div',
                  text: {
                    content: `${title}\n\n${content}`,
                    tag: 'lark_md'
                  }
                },
                {
                  tag: 'action',
                  actions: [
                    {
                      tag: 'button',
                      text: { content: '查看详情', tag: 'plain_text' },
                      type: 'primary',
                      url: linkUrl
                    }
                  ]
                }
              ]
            })
          })
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