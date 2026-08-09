/**
 * 查看 chmod 步骤容器内进程是否在真实工作
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd.slice(0, 150)}`)
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
    await execRemote(conn, `docker ps --format "{{.ID}} {{.Image}} {{.Command}}" | head -8`)
    // 找 chmod 进程（构建容器内的进程会出现在宿主 ps 中）
    await execRemote(conn, `ps -eo pid,etime,time,stat,args | grep -E "chmod" | grep -v grep`)
    console.log('\n...等待 15 秒对比 CPU 时间...')
    await sleep(15000)
    await execRemote(conn, `ps -eo pid,etime,time,stat,args | grep -E "chmod" | grep -v grep`)
    await execRemote(conn, `tail -3 /tmp/zscx-build.log`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
