import axios from 'axios'
import { prisma } from './prisma'
import type { UserThirdPartyBinding } from '@prisma/client'

interface WeWorkUserInfo {
  UserId: string
  OpenId: string
  DeviceId?: string
  ExternalUserid?: string
}

interface WeWorkAccessToken {
  access_token: string
  expires_in: number
}

export class WeWorkService {
  private corpId: string
  private corpSecret: string
  private agentId: string
  private accessToken: string = ''
  private tokenExpireTime: number = 0

  constructor() {
    this.corpId = process.env.WEWORK_CORP_ID || ''
    this.corpSecret = process.env.WEWORK_CORP_SECRET || ''
    this.agentId = process.env.WEWORK_AGENT_ID || ''
  }

  async getAccessToken(): Promise<string> {
    if (Date.now() < this.tokenExpireTime && this.accessToken) {
      return this.accessToken
    }

    const response = await axios.get(
      'https://qyapi.weixin.qq.com/cgi-bin/gettoken',
      {
        params: {
          corpid: this.corpId,
          corpsecret: this.corpSecret
        }
      }
    )

    const data = response.data as WeWorkAccessToken
    this.accessToken = data.access_token
    this.tokenExpireTime = Date.now() + (data.expires_in - 60) * 1000

    return this.accessToken
  }

  getOAuthAuthorizeUrl(redirectUri: string, state: string = ''): string {
    const params = new URLSearchParams({
      appid: this.corpId,
      redirect_uri: redirectUri,
      state: state,
      response_type: 'code',
      scope: 'snsapi_base'
    })
    return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}&agentid=${this.agentId}&#wechat_redirect`
  }

  async getUserInfo(code: string): Promise<WeWorkUserInfo> {
    const token = await this.getAccessToken()
    const response = await axios.get(
      'https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo',
      {
        params: { access_token: token, code }
      }
    )
    return response.data
  }

  async bindUser(userId: number, code: string): Promise<UserThirdPartyBinding> {
    const userInfo = await this.getUserInfo(code)

    const binding = await prisma.userThirdPartyBinding.upsert({
      where: {
        userId_platform: { userId, platform: 'WEWORK' }
      },
      update: {
        platformUserId: userInfo.OpenId || userInfo.UserId || '',
        platformUserName: userInfo.UserId || '',
        extraData: JSON.stringify({
          userId: userInfo.UserId,
          openId: userInfo.OpenId,
          externalUserId: userInfo.ExternalUserid || null,
          deviceId: userInfo.DeviceId
        }),
        updatedAt: new Date()
      },
      create: {
        userId,
        platform: 'WEWORK',
        platformUserId: userInfo.OpenId || userInfo.UserId || '',
        platformUserName: userInfo.UserId || '',
        extraData: JSON.stringify({
          userId: userInfo.UserId,
          openId: userInfo.OpenId,
          externalUserId: userInfo.ExternalUserid || null,
          deviceId: userInfo.DeviceId
        })
      }
    })

    return binding
  }

  async unbindUser(userId: number): Promise<void> {
    await prisma.userThirdPartyBinding.delete({
      where: { userId_platform: { userId, platform: 'WEWORK' } }
    })
  }

  async sendMessage(userId: number, title: string, content: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'WEWORK' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAccessToken()
      const weworkUserId = JSON.parse(JSON.stringify(binding.extraData) || '{}').userId || binding.platformUserId

      await axios.post(
        'https://qyapi.weixin.qq.com/cgi-bin/message/send',
        {
          touser: weworkUserId,
          agentid: this.agentId,
          msgtype: 'text',
          text: {
            content: `${title}\n\n${content}`
          }
        },
        { params: { access_token: token } }
      )

      return true
    } catch (error) {
      console.error('Failed to send WeWork message:', error)
      return false
    }
  }

  async sendApprovalNotification(userId: number, title: string, content: string, linkUrl: string): Promise<boolean> {
    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId, platform: 'WEWORK' } }
    })

    if (!binding) {
      return false
    }

    try {
      const token = await this.getAccessToken()
      const weworkUserId = JSON.parse(JSON.stringify(binding.extraData) || '{}').userId || binding.platformUserId

      await axios.post(
        'https://qyapi.weixin.qq.com/cgi-bin/message/send',
        {
          touser: weworkUserId,
          agentid: this.agentId,
          msgtype: 'textcard',
          textcard: {
            title: title,
            description: content,
            url: linkUrl,
            btntxt: '查看详情'
          }
        },
        { params: { access_token: token } }
      )

      return true
    } catch (error) {
      console.error('Failed to send WeWork approval notification:', error)
      return false
    }
  }

  async getUserBindings(): Promise<UserThirdPartyBinding[]> {
    return prisma.userThirdPartyBinding.findMany({
      where: { platform: 'WEWORK' },
      include: { user: { select: { realName: true, username: true } } }
    })
  }
}

export const weworkService = new WeWorkService()