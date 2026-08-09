/**
 * 无 sudo 观察构建进度：对比进程 CPU 时间、查找构建容器内的 next build
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  try {
    await execRemote(conn, `ps -o pid,etime,time,pcpu,pmem,args -p 128276 2>/dev/null; ps -o pid,etime,time,pcpu,pmem,args -p 130928 2>/dev/null`)
    console.log('\n...等待 10 秒对比 CPU 时间...')
    await sleep(10000)
    await execRemote(conn, `ps -o pid,etime,time,pcpu,pmem,args -p 130928 2>/dev/null`)
    // runc 容器的所有子进程（无需 sudo，runc 由 root 启动但 /proc/<pid>/task 可见性受限；用 ps 全局找 node 进程）
    await execRemote(conn, `ps aux | grep -E "next build|node .*build|swc" | grep -v grep | head -10; true`)
    // buildkit runc 日志
    await execRemote(conn, `tail -c 2000 /vol2/docker/buildkit/executor/runc-log.json 2>/dev/null; true`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
