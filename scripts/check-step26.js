/**
 * 判断 #26 chmod 步骤是真在干活还是卡死：看 buildkit runc 进程的 CPU 时间变化
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.slice(0, 140)}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stderr.write(d))
      stream.on('close', () => resolve())
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
    // 所有 runc 进程（新构建的步骤容器）
    await execRemote(conn, `ps aux | grep runc | grep -v grep`)
    // 两次采样对比 CPU 时间
    await execRemote(conn, `ps -eo pid,etime,time,args | grep -E "runc|buildkitd" | grep -v grep`)
    console.log('\n...等待 15 秒...')
    await sleep(15000)
    await execRemote(conn, `ps -eo pid,etime,time,args | grep -E "runc|buildkitd" | grep -v grep`)
    // buildkit 内容目录是否可读（无 sudo）
    await execRemote(conn, `ls /vol2/docker/buildkit/executor/ 2>&1 | head -8`)
    await execRemote(conn, `docker system df 2>&1 | head -5`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
