// 对象存储（MinIO/S3 兼容）封装
// 所有用户上传的文件/图片存到对象存储，应用容器本地不再持久化上传文件
import { Client } from 'minio'

const bucket = process.env.MINIO_BUCKET || 'zscx'

let client: Client | null = null

function getClient(): Client {
  if (client) return client
  const endPoint = process.env.MINIO_ENDPOINT
  const accessKey = process.env.MINIO_ACCESS_KEY
  const secretKey = process.env.MINIO_SECRET_KEY
  if (!endPoint || !accessKey || !secretKey) {
    throw new Error('[Storage] MinIO 未配置，请设置 MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY')
  }
  const port = process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT, 10) : 9000
  const useSSL = process.env.MINIO_USE_SSL === 'true'
  client = new Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region: process.env.MINIO_REGION || 'us-east-1',
  })
  return client
}

/** 是否已配置对象存储 */
export function isStorageEnabled(): boolean {
  return !!(process.env.MINIO_ENDPOINT && process.env.MINIO_ACCESS_KEY && process.env.MINIO_SECRET_KEY)
}

/** 确保 bucket 存在（幂等） */
export async function ensureBucket(): Promise<void> {
  const c = getClient()
  try {
    await c.makeBucket(bucket, process.env.MINIO_REGION || 'us-east-1')
  } catch (e: any) {
    const code = e?.code || ''
    if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') {
      // 已存在时忽略，其它错误抛出
      throw e
    }
  }
}

/**
 * 构造对象 key（存放路径）
 * @param prefix 子目录，如 ''（普通上传）或 'record-attachments'（附件）
 */
export function buildObjectKey(prefix: string, fileName: string): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const pk = prefix ? `${prefix}/` : ''
  return `${pk}${yyyy}/${mm}/${fileName}`
}

/** 对外可访问的代理 URL */
export function buildProxyUrl(key: string): string {
  return `/api/files/${key}`
}

/** 上传文件 */
export async function saveObject(key: string, buffer: Buffer, contentType?: string, meta?: Record<string, any>): Promise<void> {
  const c = getClient()
  const headers: Record<string, string> = {}
  if (contentType) headers['Content-Type'] = contentType
  if (meta) {
    for (const [k, v] of Object.entries(meta)) headers[`x-amz-meta-${k}`] = String(v)
  }
  await c.putObject(bucket, key, buffer, buffer.length, headers)
}

/** 读取文件全文 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const c = getClient()
  const stream = await c.getObject(bucket, key)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

/** 判断对象是否存在 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().statObject(bucket, key)
    return true
  } catch (e: any) {
    const code = e?.code || ''
    if (code === 'NoSuchKey' || code === 'NotFound') return false
    throw e
  }
}

/** 删除对象（不存在不报错） */
export async function removeObject(key: string): Promise<void> {
  try {
    await getClient().removeObject(bucket, key)
  } catch (e: any) {
    const code = e?.code || ''
    if (code === 'NoSuchKey' || code === 'NotFound') return
    throw e
  }
}