/**
 * 检查服务器上镜像构建状态
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stderr.write(d))
      stream.on('close', () => resolve())
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
    await execRemote(conn, `echo "=== 是否有构建进程 ==="; ps aux | grep -E "docker build|buildkit" | grep -v grep | head -10; true`)
    await execRemote(conn, `echo "=== 镜像列表 ==="; docker images | grep -E "zscx|REPOSITORY"`)
    await execRemote(conn, `echo "=== 容器状态 ==="; docker ps -a --filter "name=zscx" --format "table {{.Names}}\\t{{.Status}}\\t{{.Image}}"`)
    await execRemote(conn, `echo "=== 磁盘/负载 ==="; uptime; df -h /vol2 | tail -1`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
