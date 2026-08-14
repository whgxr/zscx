const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => errOut += d.toString())
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  // 1. 更新服务器上的 docker-compose.yml
  console.log('==== 更新 docker-compose.yml ====')
  const composeContent = fs.readFileSync(path.join(__dirname, '..', 'docker', 'docker-compose.yml'), 'utf-8')
  const b64 = Buffer.from(composeContent).toString('base64')
  let r = await sshExec(conn, `echo '${b64}' | base64 -d > /vol2/1000/docker/zscx/docker-compose.yml`)
  if (r.errOut) console.log('Warning:', r.errOut)
  else console.log('  ✓ 已更新')

  // 2. 更新服务器上的 docker-migrate.js
  console.log('\n==== 更新 docker-migrate.js ====')
  const migrateContent = fs.readFileSync(path.join(__dirname, '..', 'web', 'prisma', 'docker-migrate.js'), 'utf-8')
  const migrateB64 = Buffer.from(migrateContent).toString('base64')
  r = await sshExec(conn, `echo '${migrateB64}' | base64 -d > /vol2/1000/docker/zscx/web/prisma/docker-migrate.js`)
  if (r.errOut) console.log('Warning:', r.errOut)
  else console.log('  ✓ 已更新')

  // 3. 停掉并重新启动容器
  console.log('\n==== 重启容器 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose down 2>&1')
  console.log(r.out || r.errOut)

  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 4. 等待启动
  console.log('\n==== 等待 30s ====')
  await new Promise(res => setTimeout(res, 30000))

  // 5. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 6. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 40 zscx-web 2>&1')
  console.log(r.out)

  // 7. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
