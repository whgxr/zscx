/**
 * 修复部署：检查现有容器归属并正确启动服务
 */
const { Client } = require('ssh2')

const CONFIG = {
  host: 'REDACTED_IP',
  port: 22,
  username: 'REDACTED_USER',
  password: 'REDACTED_PASSWORD',
  remotePath: '/vol2/1000/docker/zscx',
}

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let stdout = '', stderr = ''
      stream.on('data', (d) => { stdout += d.toString(); process.stdout.write(d) })
      stream.stderr.on('data', (d) => { stderr += d.toString(); process.stderr.write(d) })
      stream.on('close', (code) => resolve({ stdout, stderr, code }))
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve)
    conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  console.log('✅ SSH 连接成功')

  try {
    // 1. 查看所有 zscx 相关容器及其 compose 项目标签
    await execRemote(conn, `docker ps -a --filter "name=zscx" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Labels}}"`)

    // 2. 查看现有 docker compose 项目
    await execRemote(conn, `docker compose ls -a`)

    // 3. 检查现有 mysql 容器的网络
    await execRemote(conn, `docker inspect zscx-mysql --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | head -c 500; echo`)

    // 4. 检查 .env 是否恢复成功
    await execRemote(conn, `ls -la ${CONFIG.remotePath}/docker-nas/`)
  } finally {
    conn.end()
  }
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
