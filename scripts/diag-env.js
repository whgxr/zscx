const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout '+timeout+'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out='', errOut=''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  console.log('==== 环境变量 ====')
  let r = await sshExec(conn, 'docker exec zscx-web env')
  console.log(r.out)

  console.log('\n==== .env 文件 ====')
  r = await sshExec(conn, 'docker exec zscx-web cat /app/.env')
  console.log(r.out || r.errOut)

  console.log('\n==== 查看 lib/prisma.ts ====')
  r = await sshExec(conn, 'docker exec zscx-web cat /app/lib/prisma.ts')
  console.log(r.out || r.errOut)

  console.log('\n==== 查看 platforms 路由 ====')
  r = await sshExec(conn, 'docker exec zscx-web cat /app/app/api/auth/third-party/platforms/route.ts')
  console.log(r.out || r.errOut)

  console.log('\n==== 查看 schema.prisma ====')
  r = await sshExec(conn, 'docker exec zscx-web head -15 /app/prisma/schema.prisma')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
