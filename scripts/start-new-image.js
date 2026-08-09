/**
 * 镜像已 tagged 成功，清理卡住的构建进程，用新镜像重启 web 并验证
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.slice(0, 160)}`)
    let stream
    const timer = setTimeout(() => { console.log('(超时跳过)'); if (stream) stream.close(); resolve() }, timeoutMs)
    conn.exec(cmd, (err, s) => {
      stream = s
      if (err) { clearTimeout(timer); return reject(err) }
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stderr.write(d))
      stream.on('close', () => { clearTimeout(timer); resolve() })
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  try {
    // 1. 确认镜像并清理卡住的 build 进程
    await execRemote(conn, `docker images | grep zscx-web; pkill -f "docker build -t zscx-web:local"; echo CLEANED`, 20000)

    // 2. 确认镜像内 prisma 文件权限已修复
    await execRemote(conn, `docker run --rm --entrypoint sh zscx-web:local -c "ls -la /app/prisma | head -8"`)

    // 3. 重启 web（compose 检测到镜像变化会重建容器）
    console.log('\n🚀 重启服务...')
    await execRemote(conn, `cd /vol2/1000/docker/zscx && docker compose up -d 2>&1`)

    // 4. 等待启动（含 docker-migrate + db push）
    console.log('\n⏳ 等待启动...')
    await new Promise(r => setTimeout(r, 40000))
    await execRemote(conn, `docker ps --filter "name=zscx" --format "table {{.Names}}\\t{{.Status}}"`)
    await execRemote(conn, `docker logs zscx-web --tail 60 2>&1`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
