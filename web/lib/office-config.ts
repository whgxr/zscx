// ONLYOFFICE 集成公共库：DS 地址/密钥、JWT 签名、构造编辑器 config
import jwt from 'jsonwebtoken'
import { buildProxyUrl } from './storage'

export const DS_PUBLIC = process.env.ONLYOFFICE_DS_URL || 'http://REDACTED_IP:8088'
export const DS_SECRET = process.env.ONLYOFFICE_JWT_SECRET || 'REDACTED_JWT'

/** 业务系统公网地址（DS 与回调都必须可达） */
export function appPublic(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
    || process.env.APP_PUBLIC_URL || 'http://REDACTED_IP:777'
}

/** 业务系统公网地址（浏览器加载插件等前端资源用）——与外网用户访问的域名一致。
 * 插件 iframe / pluginsData 由浏览器直接加载，必须用公网地址；与 DS 后端下载
 * document.url 用的内网地址（ONLYOFFICE_INTERNAL_URL）区分开。 */
export function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || '')
    .replace(/\/$/, '') || 'http://REDACTED_IP:777'
}

export type OfficeKind = 'word' | 'cell'

/** 生成 ONLYOFFICE 编辑器 config（JWT 签名后返回，前端直接传给 DocsAPI.DocEditor） */
export function buildOfficeConfig(params: {
  kind: OfficeKind
  /** MinIO 对象 key（模板文件） */
  fileKey: string
  /** 模板文件类型，如 docx/xlsx */
  fileType: string
  /** 模板标题 */
  title: string
  /** 模板 id（用于 callback 落库） */
  templateId: number
  /** 协作用户 */
  userName?: string
  /** 编辑器模式 edit/view */
  mode?: 'edit' | 'view'
  /** 业务系统 baseUrl（DS 下载/回调需可达）；缺省用 env/appPublic() */
  baseUrl?: string
  /** 插件资源 baseUrl（浏览器加载插件用，须为公网地址）；缺省用 publicBaseUrl() */
  pluginBase?: string
  /** 可插入字段列表 [{name,label}]，用于「点击字段插入到光标」插件 */
  fields?: { name: string; label: string }[]
}): any {
  const { kind, fileKey, fileType, title, templateId, userName, mode = 'edit', baseUrl, pluginBase, fields } = params
  const appBase = (baseUrl || appPublic()).replace(/\/$/, '')
  const pubBase = (pluginBase || publicBaseUrl()).replace(/\/$/, '')
  // DS 需能访问的文件 URL：走 MinIO 代理
  const url = `${appBase}${buildProxyUrl(fileKey)}`
  const callbackUrl = `${appBase}/api/export-templates/${templateId}/office-callback`
  // key 需稳定且随内容变化（DS 按 key 缓存文档）——这里用 fileKey 本身保证不同文件不同 key。
  // 追加插件版本号：ONLYOFFICE 按 document key 缓存整个配置（含插件），若改动插件实现/字段逻辑，
  // 必须改 PLUGIN_VERSION 以换 key 强制 DS 重新拉取插件，否则一直用旧缓存（表现为"无字段"）。
  const PLUGIN_VERSION = '9'
  const key = `tpl-${templateId}-${kind}-${fileKey.split('/').pop() || ''}-p${PLUGIN_VERSION}`

  const cfg: any = {
    document: {
      fileType,
      key,
      url,
      title,
      permissions: { edit: mode === 'edit', download: true, print: true, comment: false },
    },
    documentType: kind === 'cell' ? 'cell' : 'word',
    editorConfig: {
      mode,
      lang: 'zh-CN',
      callbackUrl,
      user: { id: 'tpl-' + templateId, name: userName || '模板编辑' },
      customization: { autosave: false, forcesave: true },
    },
  }

  // 注入「字段插入」插件（社区版即可用：插件内 Asc.plugin.executeMethod("PasteText") 插入到光标）。
  // pluginsData 指向业务系统托管插件 config.json；字段列表经 plugins.options[guid] 动态传给插件。
  if (kind === 'word' || kind === 'cell') {
    const PLUGIN_GUID = 'asc.{2125EF82-8D20-4E45-9C7B-7A3C3B6D9E01}'
    const fieldsNorm = (fields || []).map((f) => ({ name: f.name, label: f.label || f.name }))
    cfg.editorConfig.plugins = {
      autostart: [PLUGIN_GUID],
      // 插件 manifest 由本系统动态路由提供：manifest 的 variations.url 指向动态 index.html
      // 路由，字段列表由该路由直接内联进插件 HTML（跨域外部插件无法可靠读取 options）。
      // pluginsData 由浏览器直接加载，须用公网地址（pubBase），不能用 DS 内网下载用的 appBase。
      // ?v= 版本参数随 PLUGIN_VERSION 变化，强制 DS/浏览器不缓存旧插件。

      pluginsData: [`${pubBase}/api/export-templates/${templateId}/office-plugin/config.json?kind=${kind}&v=${PLUGIN_VERSION}`],
      options: {
        [PLUGIN_GUID]: { fields: fieldsNorm },
      },
    }
  }

  cfg.token = jwt.sign(cfg, DS_SECRET)
  return cfg
}

/** 校验 DS 回调签名；返回是否合法 */
export function verifyCallbackToken(token: string | null | undefined): boolean {
  if (!token) return false
  try {
    jwt.verify(token.replace(/^Bearer /i, ''), DS_SECRET)
    return true
  } catch {
    return false
  }
}