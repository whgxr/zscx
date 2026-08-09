/**
 * 查看 buildkit 当前构建步骤的日志，判断进度
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
    // 找到正在运行的 runc 容器内的进程，看是哪个构建步骤
    await execRemote(conn, `sudo ls /vol2/docker/buildkit/executor/ 2>/dev/null | head; for d in $(sudo ls /vol2/docker/buildkit/executor/ 2>/dev/null | grep -v json); do echo "--- $d"; sudo cat /vol2/docker/buildkit/executor/$d/config.json 2>/dev/null | head -c 800; echo; done`)
    // runc 容器内运行的命令
    await execRemote(conn, `sudo cat /proc/130928/root/proc/1/cmdline 2>/dev/null | tr '\\0' ' '; echo; sudo ls /proc/130928/root/proc/ 2>/dev/null | grep -E '^[0-9]+$' | while read p; do sudo cat /proc/130928/root/proc/$p/cmdline 2>/dev/null | tr '\\0' ' ' | head -c 200; echo; done | head -20`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
