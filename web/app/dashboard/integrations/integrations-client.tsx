'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  TestTube,
  Users,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Key,
  Link2,
  Bell,
  Shield,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react'

interface IntegrationConfig {
  id: number
  platform: 'FEISHU' | 'WEWORK' | 'DINGTALK'
  status: 'DISABLED' | 'ENABLED' | 'TESTING'
  appId?: string
  appSecret?: string
  webhookUrl?: string
  agentId?: string
  corpId?: string
  tenantId?: string
  extraConfig?: any
  notifyEnabled: boolean
  approvalEnabled: boolean
  notifyChannels?: any
  createdAt: string
  updatedAt: string
}

interface PlatformInfo {
  key: 'FEISHU' | 'WEWORK' | 'DINGTALK'
  name: string
  color: string
  description: string
  icon: string
  features: { notifications: boolean; approval: boolean; webhook: boolean }
  fields: ConfigField[]
}

interface ConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required?: boolean
}

const platformInfoMap: Record<string, PlatformInfo> = {
  FEISHU: {
    key: 'FEISHU',
    name: '飞书 (Feishu)',
    color: 'bg-blue-500',
    description: '通过飞书开放平台发送通知和审批提醒，支持 OAuth 用户绑定',
    icon: 'feishu',
    features: { notifications: true, approval: true, webhook: false },
    fields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: 'cli_xxxxxxxxxxxx' },
      { key: 'appSecret', label: 'App Secret', type: 'password', placeholder: '应用密钥' },
    ],
  },
  WEWORK: {
    key: 'WEWORK',
    name: '企业微信 (WeCom)',
    color: 'bg-green-500',
    description: '通过企业微信发送应用消息和审批通知，支持 OAuth 用户绑定',
    icon: 'wework',
    features: { notifications: true, approval: true, webhook: false },
    fields: [
      { key: 'corpId', label: '企业ID (CorpID)', type: 'text', placeholder: 'ww_xxxxxxxxxxxxxxxx' },
      { key: 'appSecret', label: '应用Secret', type: 'password', placeholder: '应用密钥' },
      { key: 'agentId', label: '应用AgentId', type: 'text', placeholder: '1000001' },
    ],
  },
  DINGTALK: {
    key: 'DINGTALK',
    name: '钉钉 (DingTalk)',
    color: 'bg-cyan-500',
    description: '通过钉钉开放平台发送通知和审批提醒，支持 OAuth 用户绑定和群机器人 Webhook',
    icon: 'dingtalk',
    features: { notifications: true, approval: true, webhook: true },
    fields: [
      { key: 'appId', label: 'AppKey / Client ID', type: 'text', placeholder: 'dingxxxxxxxxxxxx' },
      { key: 'appSecret', label: 'AppSecret', type: 'password', placeholder: '应用密钥' },
      { key: 'agentId', label: '应用AgentId', type: 'text', placeholder: '1000000' },
      { key: 'webhookUrl', label: '群机器人Webhook (可选)', type: 'textarea', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...' },
    ],
  },
}

const notificationTypes = [
  { key: 'SYSTEM', label: '系统通知' },
  { key: 'APPROVAL', label: '审批通知' },
  { key: 'BUSINESS', label: '业务通知' },
  { key: 'ALERT', label: '预警通知' },
]

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<IntegrationConfig[]>([])
  const [activeTab, setActiveTab] = useState<string>('FEISHU')
  const [editingConfig, setEditingConfig] = useState<IntegrationConfig | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [bindings, setBindings] = useState<Record<string, any[]>>({})
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [channelConfig, setChannelConfig] = useState<Record<string, string[]>>({})

  const activePlatform = platformInfoMap[activeTab]

  useEffect(() => {
    fetchConfigs()
    fetchBindings()
  }, [])

  useEffect(() => {
    if (configs.length > 0) {
      const config = configs.find(c => c.platform === activeTab)
      if (config) {
        loadConfigToForm(config)
      } else {
        resetForm()
      }
    } else {
      resetForm()
    }
  }, [activeTab, configs])

  async function fetchConfigs() {
    try {
      const res = await fetch('/api/integrations')
      const data = await res.json()
      setConfigs(data.configs || [])
    } catch (e) {
      console.error('Failed to fetch configs:', e)
    }
  }

  async function fetchBindings() {
    try {
      const res = await fetch('/api/integrations/bindings')
      const data = await res.json()
      setBindings(data.bindings || {})
    } catch (e) {
      console.error('Failed to fetch bindings:', e)
    }
  }

  function loadConfigToForm(config: IntegrationConfig) {
    const channelCfg: Record<string, string[]> = {}
    if (config.notifyChannels) {
      const nc = typeof config.notifyChannels === 'string'
        ? JSON.parse(config.notifyChannels)
        : config.notifyChannels
      Object.keys(nc).forEach(key => {
        channelCfg[key] = nc[key]
      })
    }

    setFormData({
      platform: config.platform,
      status: config.status,
      appId: config.appId || '',
      appSecret: config.appSecret || '',
      webhookUrl: config.webhookUrl || '',
      agentId: config.agentId || '',
      corpId: config.corpId || '',
      tenantId: config.tenantId || '',
      notifyEnabled: config.notifyEnabled,
      approvalEnabled: config.approvalEnabled,
      extraConfig: config.extraConfig ? (typeof config.extraConfig === 'string' ? JSON.parse(config.extraConfig) : config.extraConfig) : {},
    })
    setChannelConfig(channelCfg)
  }

  function resetForm() {
    setFormData({
      platform: activeTab,
      status: 'DISABLED',
      appId: '',
      appSecret: '',
      webhookUrl: '',
      agentId: '',
      corpId: '',
      tenantId: '',
      notifyEnabled: false,
      approvalEnabled: false,
      extraConfig: {},
    })
    setChannelConfig({})
  }

  async function handleSave() {
    setSaving(true)
    try {
      const extraConfig = { ...(formData.extraConfig || {}) }
      if (formData.webhookUrl) {
        extraConfig.webhookUrl = formData.webhookUrl
      }

      await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          platform: activeTab,
          notifyChannels: channelConfig,
          extraConfig,
        }),
      })
      fetchConfigs()
    } catch (e) {
      console.error('Save failed:', e)
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: activeTab }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || '测试失败' })
    }
    setTesting(false)
  }

  function toggleChannel(typeKey: string, channel: string) {
    const current = channelConfig[typeKey] || []
    const updated = current.includes(channel)
      ? current.filter(c => c !== channel)
      : [...current, channel]
    setChannelConfig(prev => ({ ...prev, [typeKey]: updated }))
  }

  const isEnabled = formData.status === 'ENABLED'
  const bindingsForPlatform = bindings[activeTab] || []
  const hasWebhook = activePlatform.features.webhook

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">第三方集成管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          配置飞书、企业微信、钉钉的通知和审批对接，支持用户绑定和消息路由
        </p>
      </div>

      {/* Platform Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {Object.values(platformInfoMap).map(platform => {
          const config = configs.find(c => c.platform === platform.key)
          const enabled = config?.status === 'ENABLED'
          return (
            <button
              key={platform.key}
              onClick={() => setActiveTab(platform.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === platform.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
              {platform.name}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Platform Info Card */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 ${activePlatform.color} rounded-lg flex items-center justify-center text-white font-bold text-lg`}>
                {activePlatform.name.charAt(0)}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{activePlatform.name}</h2>
                <p className="text-sm text-gray-500">{activePlatform.description}</p>
              </div>
              <div className="ml-auto">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isEnabled}
                    onChange={(e) => setFormData((prev: any) => ({
                      ...prev,
                      status: e.target.checked ? 'ENABLED' : 'DISABLED',
                    }))}
                  />
                  <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-green-500 transition-colors">
                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      isEnabled ? 'translate-x-5' : ''
                    }`} />
                  </div>
                </label>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              {activePlatform.fields.map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <div className="relative">
                    {field.type === 'textarea' ? (
                      <textarea
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        rows={2}
                        placeholder={field.placeholder}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
                        placeholder={field.placeholder}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    )}
                    {field.type === 'password' && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                      >
                        {showSecrets[field.key] ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Feature Toggles */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-3">功能开关</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    checked={formData.notifyEnabled}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, notifyEnabled: e.target.checked }))}
                  />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Bell className="w-4 h-4" /> 消息通知
                    </div>
                    <div className="text-xs text-gray-500">接收系统和业务通知</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded"
                    checked={formData.approvalEnabled}
                    onChange={(e) => setFormData((prev: any) => ({ ...prev, approvalEnabled: e.target.checked }))}
                  />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1">
                      <Shield className="w-4 h-4" /> 审批通知
                    </div>
                    <div className="text-xs text-gray-500">接收审批待办提醒</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={handleTest}
                disabled={testing || !isEnabled}
                className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              >
                <TestTube className="w-4 h-4" />
                {testing ? '测试中...' : '测试连接'}
              </button>
              {testResult && (
                <div className={`flex items-center gap-1 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {testResult.message}
                </div>
              )}
            </div>
          </div>

          {/* Channel Routing */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold">消息路由配置</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              选择各类通知通过哪些渠道发送（同时启用多个渠道将按顺序全部发送）
            </p>

            <div className="space-y-3">
              {notificationTypes.map(type => {
                const channels = channelConfig[type.key] || []
                const isDefault = channels.length === 0
                return (
                  <div key={type.key} className="flex items-center gap-3 p-3 border rounded-lg">
                    <span className="text-sm font-medium text-gray-700 w-20">{type.label}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => toggleChannel(type.key, activeTab)}
                        disabled={!isEnabled}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          channels.includes(activeTab)
                            ? 'bg-primary text-white border-primary'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                        } disabled:opacity-50`}
                      >
                        {activePlatform.name}
                      </button>
                      {channels.length === 0 && !isDefault && (
                        <span className="text-xs text-gray-400 px-2">默认（跟随全局开关）</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right: Status & Bindings */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-3">连接状态</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">平台状态</span>
                <span className={`text-sm font-medium ${isEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {isEnabled ? '已启用' : '已禁用'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">消息通知</span>
                <span className={`text-sm font-medium ${formData.notifyEnabled && isEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {formData.notifyEnabled && isEnabled ? '已启用' : '未启用'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">审批通知</span>
                <span className={`text-sm font-medium ${formData.approvalEnabled && isEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {formData.approvalEnabled && isEnabled ? '已启用' : '未启用'}
                </span>
              </div>
              {hasWebhook && formData.webhookUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Webhook</span>
                  <span className="text-sm font-medium text-green-600">已配置</span>
                </div>
              )}
            </div>
          </div>

          {/* User Bindings */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-medium text-gray-700">用户绑定 ({bindingsForPlatform.length})</h3>
            </div>
            {bindingsForPlatform.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">
                暂无用户绑定此平台
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bindingsForPlatform.slice(0, 20).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between p-2 rounded bg-gray-50">
                    <div>
                      <span className="text-sm font-medium">{b.user?.realName || '未知'}</span>
                      <span className="text-xs text-gray-400 ml-2">{b.platformUserName}</span>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                ))}
                {bindingsForPlatform.length > 20 && (
                  <div className="text-xs text-gray-400 text-center pt-2">
                    还有 {bindingsForPlatform.length - 20} 条记录...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-3">快速操作</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowDialog(true)}
                className="w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                <Key className="w-4 h-4" />
                生成授权链接
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(
                    activeTab === 'FEISHU'
                      ? `${window.location.origin}/api/third-party/feishu/auth/callback`
                      : activeTab === 'WEWORK'
                      ? `${window.location.origin}/api/third-party/wework/auth/callback`
                      : `${window.location.origin}/api/third-party/dingtalk/auth/callback`
                  )
                }}
                className="w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                <Link2 className="w-4 h-4" />
                复制回调地址
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Authorization Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">OAuth 授权</h3>
            <p className="text-sm text-gray-500 mb-4">
              在{activePlatform.name}开放平台配置中，将以下回调地址添加到授权回调URL列表中：
            </p>
            <div className="bg-gray-100 rounded p-3 font-mono text-xs break-all mb-4">
              {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/third-party/${activeTab.toLowerCase()}/auth/callback`}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700 mb-4">
              <strong>配置步骤：</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>登录{activePlatform.name}开放平台</li>
                <li>创建或选择一个自建应用</li>
                <li>添加上方回调地址到"授权回调URL"</li>
                <li>配置完成后，用户可通过个人设置页面进行绑定</li>
              </ol>
            </div>
            <button
              onClick={() => setShowDialog(false)}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg font-medium"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}