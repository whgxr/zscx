/**
 * 增量重建：上传修改的 Dockerfile + docker-migrate.js，重建镜像并重启 web
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
  remotePath: '/vol2/1000/docker/zscx',
}

const WEB_ROOT = path.resolve(__dirname, '..', 'web')
const FILES = [
  'Dockerfile',
  '.dockerignore',
  'prisma/docker-migrate.js',
]

function sftpPut(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(local, remote, (err2) => err2 ? reject(err2) : resolve())
    })
  })
}

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.slice(0, 150)}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stderr.write(d))
      stream.on('close', (code) => resolve(code))
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  console.log('✅ SSH 连接成功')

  try {
    // 1. 上传改动文件
    for (const rel of FILES) {
      const local = path.join(WEB_ROOT, rel)
      const remote = `${CONFIG.remotePath}/web/${rel.replace(/\\/g, '/')}`
      console.log(`📤 上传 ${rel}...`)
      await sftpPut(conn, local, remote)
    }

    // 2. 重建镜像
    console.log('\n🐳 重建镜像（可能需要几分钟）...')
    const code = await execRemote(conn, `cd ${CONFIG.remotePath}/web && docker build -t zscx-web:local . 2>&1 | tail -30`)
    if (code !== 0) { console.error('❌ 镜像构建失败'); process.exit(1) }

    // 3. 重启 web（根级 compose 已存在）
    console.log('\n🚀 重启服务...')
    await execRemote(conn, `cd ${CONFIG.remotePath} && docker compose up -d 2>&1`)

    // 4. 等待并检查日志
    console.log('\n⏳ 等待启动...')
    await new Promise(r => setTimeout(r, 25000))
    await execRemote(conn, `docker ps --filter "name=zscx" --format "table {{.Names}}\\t{{.Status}}"`)
    await execRemote(conn, `docker logs zscx-web --tail 50 2>&1`)
  } finally {
    conn.end()
  }
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
