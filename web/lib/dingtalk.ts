import axios from 'axios'
import { prisma } from './prisma'
import type { UserThirdPartyBinding, IntegrationConfig } from '@prisma/client'

interface DingTalkUserInfo {
  openid: string
  userid: string
  unionid?: string
  name?: string
  avatar?: string
}

interface DingTalkAccessToken {
  access_token: string
  expires_in: number
}

export class DingTalkService {
  private appKey: string = ''
  private appSecret: string = ''
  private agentId: string = ''
  private accessToken: string = ''
  private tokenExpireTime: number = 0

  constructor() {}

  async loadConfig(config?: IntegrationConfig | null) {
    if (config) {
      this.appKey = config.appId || ''
      this.appSecret = config.appSecret || ''
      this.agentId = config.agentId || ''
    } else {
      this.appKey = process.env.DINGTALK_APP_KEY || ''
      this.appSecret = process.env.DINGTALK_APP_SECRET || ''
      this.agentId = process.env.DINGTALK_AGENT_ID || ''
    }
  }

  async getAccessToken(): Promise<string> {
    if (Date.now() < this.tokenExpireTime && this.accessToken) {
      return this.accessToken
    }

    await this.loadConfig()

    const response = await axios.get(
      'https://oapi.dingtalk.com/gettoken',
      {
        params: {
          appkey: this.appKey,
          appsecret: this.appSecret
        }
      }
    )

    if (response.data.errcode !== 0) {
      throw new Error(`DingTalk get token error: ${response.data.errmsg}`)
    }

    const data = response.data as DingTalkAccessToken
    this.accessToken = data.access_token
    this.tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000

    return this.accessToken
  }

  getOAuthAuthorizeUrl(redirectUri: string, state: string = ''): string {
    const params = new URLSearchParams({
      appid: this.appKey,
      response_type: 'code',
      scope: 'openid',
      state: state,
      redirect_uri: redirectUri
    })
    return `https://oapi.dingtalk.com/connect/oauth2/sns_authorize?${params.toString()}#dingtalk_redirect`
  }

  async getUserInfo(code: string): Promise<DingTalkUserInfo> {
    const token = await this.getAccessToken()
    const response = await axios.post(
      'https://oapi.dingtalk.com/topapi/v2/user/getuserinfo',
      { code },
      { params: { access_token: token } }
    )

    if (response.data.errcode !== 0) {
      throw new Error(`DingTalk get user info error: ${response.data.errmsg}`)
    }

    const userid = response.data.result?.userid
    if (!userid) {
      throw new Error('DingTalk userid not found')
    }

    const detailResponse = await axios.post(
      'https://oapi.dingtalk.com/topapi/v2/user/get',
      { userid },
      { params: { access_token: token } }
    )

    if (detailResponse.data.errcode !== 0) {
      return { openid: '', userid }
    }

    const detail = detailResponse.data.result
    return {
      openid: detail.openid || '',
      userid: detail.userid || userid,
      unionid: detail.unionid,
      name: detail.name,
      avatar: detail.avatar
    }
  }

  async bindUser(userId: number, code: string): Promise<UserThirdPartyBinding> {
    const userInfo = await this.getUserInfo(code)

    const binding = await prisma.userThirdPartyBinding.upsert({
      where: {
        userId_platform: { userId, platform: 'DINGTALK' }
      },
      update: {
        platformUserId: userInfo.userid || userInfo.openid,
        platformUserName: userInfo.name || '',
        extraData: JSON.stringify({
          userid: userInfo.userid,
          openid: userInfo.openid,
          unionid: userInfo.unionid || null,
          name: userInfo.name,
          avatar: userInfo.avatar
        }),
        updatedAt: new Date()
      },
      create: {
        userId,
        platform: 'DINGTALK',
        platformUserId: userInfo.userid || userInfo.openid,
        platformUserName: userInfo.name || '',
        extraData: JSON.stringify({
          userid: userInfo.userid,
          openid: userInfo.openid,
          unionid: userInfo.unionid || null,
          name: userInfo.name,
          avatar: userInfo.avatar
        })
      }
    })

    return binding
  }

  async unbindUser(userId: number): Promise<void> {
    await prisma.userThirdPartyBinding.delete({
      where: { userId_platform: { userId, platform: 'DINGTALK' } }
    })
  }

  async sendMessage(userId: number, title: string, content: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'DINGTALK' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAccessToken()
      const dingtalkUserId = binding.platformUserId

      await axios.post(
        'https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2',
        {
          agent_id: this.agentId,
          userid_list: dingtalkUserId,
          msg: {
            msgtype: 'text',
            text: {
              content: `${title}\n\n${content}`
            }
          }
        },
        { params: { access_token: token } }
      )

      return true
    } catch (error) {
      console.error('Failed to send DingTalk message:', error)
      return false
    }
  }

  async sendApprovalNotification(userId: number, title: string, content: string, linkUrl: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'DINGTALK' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAccessToken()
      const dingtalkUserId = binding.platformUserId

      await axios.post(
        'https://oapi.dingtalk.com/topapi/message/corpconversation/asyncsend_v2',
        {
          agent_id: this.agentId,
          userid_list: dingtalkUserId,
          msg: {
            msgtype: 'oa',
            oa: {
              message_url: linkUrl,
              head: {
                title: { tag: 'plain_text', content: title },
                bgcolor: '#FFA500'
              },
              body: {
                title: { tag: 'plain_text', content: title },
                content: { tag: 'plain_text', content: content },
                btn: { tag: 'plain_text', content: '查看详情' },
                image: '',
                rich: {
                  title: { tag: 'plain_text', content: title }
                },
                form: []
              }
            }
          }
        },
        { params: { access_token: token } }
      )

      return true
    } catch (error) {
      console.error('Failed to send DingTalk approval notification:', error)
      return false
    }
  }

  async sendWebhookMessage(webhookUrl: string, title: string, content: string): Promise<boolean> {
    try {
      await axios.post(webhookUrl, {
        msgtype: 'text',
        text: {
          content: `${title}\n\n${content}`
        }
      })
      return true
    } catch (error) {
      console.error('Failed to send DingTalk webhook message:', error)
      return false
    }
  }

  async getUserBindings(): Promise<UserThirdPartyBinding[]> {
    return prisma.userThirdPartyBinding.findMany({
      where: { platform: 'DINGTALK' },
      include: { user: { select: { realName: true, username: true } } }
    })
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.loadConfig()
      const token = await this.getAccessToken()
      return { success: true, message: '钉钉连接测试成功' }
    } catch (error: any) {
      return { success: false, message: error.message || '钉钉连接测试失败' }
    }
  }
}

export const dingtalkService = new DingTalkService()