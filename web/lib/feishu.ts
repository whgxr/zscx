import { prisma } from './prisma'

export interface FeishuConfig {
  webhookUrl: string
  enabled: boolean
}

export interface VersionChange {
  features: string[]
  fixes: string[]
  improvements: string[]
}

export async function getFeishuConfig(): Promise<FeishuConfig> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: ['feishu_webhook_url', 'feishu_enabled'],
      },
    },
  })

  const configMap: Record<string, string> = {}
  settings.forEach(s => {
    configMap[s.key] = s.value
  })

  return {
    webhookUrl: configMap['feishu_webhook_url'] || process.env.FEISHU_WEBHOOK_URL || '',
    enabled: configMap['feishu_enabled'] === 'true' || process.env.FEISHU_ENABLED === 'true',
  }
}

export async function sendFeishuTextMessage(content: string): Promise<boolean> {
  const config = await getFeishuConfig()
  
  if (!config.enabled || !config.webhookUrl) {
    console.log('[Feishu] 飞书消息功能未启用或Webhook未配置')
    return false
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: {
          text: content,
        },
      }),
    })

    const result = await response.json()
    
    if (result.code === 0 || result.StatusCode === 0) {
      console.log('[Feishu] 消息发送成功')
      return true
    } else {
      console.error('[Feishu] 消息发送失败:', result)
      return false
    }
  } catch (error) {
    console.error('[Feishu] 消息发送异常:', error)
    return false
  }
}

export async function sendFeishuCardMessage(card: any): Promise<boolean> {
  const config = await getFeishuConfig()
  
  if (!config.enabled || !config.webhookUrl) {
    console.log('[Feishu] 飞书消息功能未启用或Webhook未配置')
    return false
  }

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: card,
      }),
    })

    const result = await response.json()
    
    if (result.code === 0 || result.StatusCode === 0) {
      console.log('[Feishu] 卡片消息发送成功')
      return true
    } else {
      console.error('[Feishu] 卡片消息发送失败:', result)
      return false
    }
  } catch (error) {
    console.error('[Feishu] 卡片消息发送异常:', error)
    return false
  }
}

export function buildVersionLogCard(params: {
  version: string
  title: string
  description?: string
  changes: VersionChange
  releaseDate?: Date
}): any {
  const { version, title, description, changes, releaseDate } = params

  const elements: any[] = []

  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `**版本号：** ${version}`,
    },
  })

  if (releaseDate) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**发布日期：** ${releaseDate.toLocaleDateString('zh-CN')}`,
      },
    })
  }

  if (description) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**版本说明：**\n${description}`,
      },
    })
  }

  elements.push({ tag: 'hr' })

  if (changes.features && changes.features.length > 0) {
    const featuresText = changes.features.map((f, i) => `${i + 1}. ${f}`).join('\n')
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `🆕 **新增功能**\n${featuresText}`,
      },
    })
    elements.push({ tag: 'hr' })
  }

  if (changes.fixes && changes.fixes.length > 0) {
    const fixesText = changes.fixes.map((f, i) => `${i + 1}. ${f}`).join('\n')
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `🐛 **修复Bug**\n${fixesText}`,
      },
    })
    elements.push({ tag: 'hr' })
  }

  if (changes.improvements && changes.improvements.length > 0) {
    const improvementsText = changes.improvements.map((f, i) => `${i + 1}. ${f}`).join('\n')
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `⚡ **优化改进**\n${improvementsText}`,
      },
    })
  }

  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: '房屋征收调查系统 - 版本更新通知',
      },
    ],
  })

  return {
    header: {
      title: {
        tag: 'plain_text',
        content: `📦 ${title}`,
      },
      template: 'blue',
    },
    elements: elements,
  }
}

export async function sendVersionLogNotification(params: {
  version: string
  title: string
  description?: string
  changes: VersionChange
  releaseDate?: Date
}): Promise<boolean> {
  const card = buildVersionLogCard(params)
  return await sendFeishuCardMessage(card)
}
