/**
 * 终止卡死的构建，改用传统 builder（DOCKER_BUILDKIT=0）重建
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd, timeoutMs = 60000) {
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
    // 1. 杀掉所有 docker build 客户端进程
    await execRemote(conn, `pkill -f "docker build -t zscx-web:local"; sleep 2; ps aux | grep "docker build" | grep -v grep; echo CLEANED`, 20000)

    // 2. 用传统 builder 重新构建（nohup + 日志文件）
    await execRemote(conn, `cd /vol2/1000/docker/zscx/web && rm -f /tmp/zscx-build.log && nohup env DOCKER_BUILDKIT=0 docker build -t zscx-web:local . > /tmp/zscx-build.log 2>&1 & echo STARTED_PID=$!`, 15000)

    // 3. 等待 20 秒看进度（传统 builder 输出实时步骤）
    await new Promise(r => setTimeout(r, 20000))
    await execRemote(conn, `tail -20 /tmp/zscx-build.log`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
