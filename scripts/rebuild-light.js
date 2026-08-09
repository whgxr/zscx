/**
 * 杀掉卡在重 chmod 的构建，上传精简版 Dockerfile，利用缓存重建
 */
const { Client } = require('ssh2')
const path = require('path')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sftpPut(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      sftp.fastPut(local, remote, (err2) => err2 ? reject(err2) : resolve())
    })
  })
}

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
    // 1. 终止当前构建
    await execRemote(conn, `pkill -f "docker build -t zscx-web:local"; sleep 2; docker ps --filter "ancestor=931ed9f1cfc5" -q | xargs -r docker rm -f; echo KILLED`, 30000)

    // 2. 上传新 Dockerfile
    console.log('\n📤 上传精简版 Dockerfile...')
    await sftpPut(conn, path.resolve(__dirname, '..', 'web', 'Dockerfile'), '/vol2/1000/docker/zscx/web/Dockerfile')

    // 3. 重建（legacy builder，前面步骤全部命中缓存）
    await execRemote(conn, `cd /vol2/1000/docker/zscx/web && rm -f /tmp/zscx-build.log && nohup env DOCKER_BUILDKIT=0 docker build -t zscx-web:local . > /tmp/zscx-build.log 2>&1 & echo STARTED`, 15000)

    await new Promise(r => setTimeout(r, 20000))
    await execRemote(conn, `tail -20 /tmp/zscx-build.log`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
