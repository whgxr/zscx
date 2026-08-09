/**
 * 终止卡死的构建并以 nohup 方式重新发起，日志写入服务器文件
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
    // 1. 检查 sudo 是否免密
    await execRemote(conn, `sudo -n true 2>&1 && echo SUDO_OK || echo SUDO_NEED_PASSWORD`, 15000)

    // 2. 终止卡死的构建进程（尽量清理）
    await execRemote(conn, `kill 128276 128275 2>/dev/null; sleep 1; sudo -n kill 130928 2>/dev/null; sudo -n pkill -f "tgs7lmisf5n7esbbcokc172e1" 2>/dev/null; ps aux | grep -E "docker build|tgs7lm" | grep -v grep; echo KILL_DONE`, 20000)

    // 3. nohup 重新构建（进度写入 /tmp/zscx-build.log）
    await execRemote(conn, `cd /vol2/1000/docker/zscx/web && rm -f /tmp/zscx-build.log && nohup docker build -t zscx-web:local . > /tmp/zscx-build.log 2>&1 & echo BUILD_STARTED_PID=$!`, 15000)

    // 4. 等 8 秒看开头日志
    await new Promise(r => setTimeout(r, 8000))
    await execRemote(conn, `tail -15 /tmp/zscx-build.log`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
