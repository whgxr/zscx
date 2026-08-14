const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }
function sshExec(conn, cmd) {
  return new Promise((res, rej) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return rej(err)
      let out = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => out += d.toString())
      stream.on('close', () => res(out))
    })
  })
}
async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  const script = `const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const r=await p.$queryRawUnsafe("SHOW COLUMNS FROM ApprovalWorkflow LIKE 'tableId'");console.log('tableId:',JSON.stringify(r));process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)})`
  const b64 = Buffer.from(script, 'utf-8').toString('base64')
  console.log('--- ApprovalWorkflow.tableId 列信息 ---')
  console.log((await sshExec(conn, `docker exec zscx-web node -e "eval(Buffer.from('${b64}','base64').toString())" 2>&1`)) || '(空)')
  conn.end()
}
run().catch(e => { console.error(e.message); process.exit(1) })
