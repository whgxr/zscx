const { Client } = require('ssh2')

const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sshExec(conn, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', (d) => (out += d.toString()))
      stream.stderr.on('data', (d) => (errOut += d.toString()))
      stream.on('close', () => resolve({ out, errOut }))
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('已连接\n')

  for (const path of ['/approval', '/approval?tab=todo', '/approval?tab=mine', '/approval?tab=sync', '/login']) {
    const r = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" "http://localhost:777${path}" 2>&1`)
    console.log(`${path} -> HTTP ${r.out.trim()}`)
  }

  // 检查统一页是否包含 tab 内容
  console.log('\n===== /approval 页面内容检查 =====')
  const r = await sshExec(conn, 'curl -s "http://localhost:777/approval" 2>&1')
  const html = r.out
  console.log('页面长度:', html.length)
  console.log('包含「审批中心」:', html.includes('审批中心'))
  console.log('包含「待办审批」:', html.includes('待办审批'))
  console.log('包含「同步请求审核」:', html.includes('同步请求审核'))

  conn.end()
  console.log('\n完成')
}
run().catch((err) => { console.error(err); process.exit(1) })