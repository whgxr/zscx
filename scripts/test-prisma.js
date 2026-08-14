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

  // 1. 将测试脚本从服务器主机拷贝到容器
  console.log('==== 将测试脚本拷贝到容器 ====')
  // 先把测试脚本上传到服务器
  const testJs = `
const { PrismaClient } = require('@prisma/client');
const url = process.env.DATABASE_URL;
console.log('DATABASE_URL:', url ? url.substring(0, 30) + '...' : 'UNDEFINED');
const p1 = new PrismaClient();
p1.$queryRawUnsafe('SELECT 1').then(r => console.log('Test1 OK:', r)).catch(e => console.log('Test1 ERR:', e.message)).finally(() => p1.$disconnect());
const p2 = new PrismaClient({ datasources: { db: { url: url || 'INVALID' } } });
p2.integrationConfig.findMany().then(r => console.log('Test2 OK:', JSON.stringify(r))).catch(e => console.log('Test2 ERR:', e.message)).finally(() => p2.$disconnect());
`
  await new Promise((res, rej) => {
    conn.sftp((err, sftp) => {
      if (err) return rej(err)
      sftp.writeFile('/tmp/test.js', testJs, (err) => {
        if (err) return rej(err)
        res()
      })
    })
  })
  console.log('上传到服务器完成')

  // 从服务器主机 cp 到容器的 /app 目录
  let r = await sshExec(conn, 'docker cp /tmp/test.js zscx-web:/app/test.js && echo OK')
  console.log(r.out || r.errOut)

  // 2. 在容器内执行
  console.log('\n==== 执行测试 ====')
  r = await sshExec(conn, 'docker exec zscx-web sh -c "cd /app && node test.js" 2>&1')
  console.log(r.out || r.errOut)

  // 3. 显式设置 DATABASE_URL 再测试
  console.log('\n==== 显式设置 DATABASE_URL ====')
  r = await sshExec(conn, 'docker exec zscx-web sh -c "cd /app && DATABASE_URL=mysql://zscx:zscx123456@zscx-mysql:3306/zscx node test.js" 2>&1')
  console.log(r.out || r.errOut)

  // 4. 用 wget 测试 API
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:666/api/auth/third-party/platforms 2>&1')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
