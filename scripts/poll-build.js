/**
 * 轮询服务器上的构建日志，直到完成或失败
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execCapture(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('data', (d) => out += d.toString())
      stream.stderr.on('data', (d) => out += d.toString())
      stream.on('close', () => resolve(out))
    })
  })
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  try {
    const deadline = Date.now() + 15 * 60 * 1000
    while (Date.now() < deadline) {
      const tail = await execCapture(conn, `tail -5 /tmp/zscx-build.log`)
      const running = await execCapture(conn, `pgrep -f "docker build -t zscx-web:local" >/dev/null && echo YES || echo NO`)
      process.stdout.write(`[${new Date().toLocaleTimeString()}] 构建中: ${running.trim() === 'YES' ? '是' : '否'} | 最后日志: ${tail.trim().split('\n').pop()}\n`)
      if (running.trim() === 'NO') {
        console.log('\n===== 构建结束，完整日志尾部 =====')
        console.log(await execCapture(conn, `tail -30 /tmp/zscx-build.log`))
        console.log('===== 镜像 =====')
        console.log(await execCapture(conn, `docker images | grep zscx-web`))
        return
      }
      await sleep(15000)
    }
    console.log('⏰ 轮询超时，构建仍在进行，稍后再查')
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
