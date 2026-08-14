const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sshExec(conn, cmd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => errOut += d.toString())
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  // 1. 停掉 web 容器
  console.log('==== 停掉 web 容器 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 从服务器上的源码重新构建 Docker 镜像
  console.log('\n==== 重新构建 Docker 镜像 ====')
  // 先删除旧的 .next，然后重新 build
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose build --no-cache web 2>&1', 600000)
  console.log('STDOUT:', r.out.slice(-2000))
  if (r.errOut) console.log('STDERR:', r.errOut.slice(-800))

  // 3. 启动容器
  console.log('\n==== 启动容器 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 4. 等待 30s
  console.log('\n==== 等待启动 ====')
  await new Promise(res => setTimeout(res, 30000))

  // 5. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}"' )
  console.log(r.out)

  // 6. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 7. 验证路由
  console.log('\n==== 验证路由 ====')
  r = await sshExec(conn, 'docker exec zscx-web find /app/.next -path "*platforms*" 2>&1')
  console.log('platforms:', r.out || r.errOut)

  r = await sshExec(conn, 'docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('容器内 API:', r.out || r.errOut)

  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('宿主机 API:', r.out || r.errOut)

  conn.end()
}

main().catch(e => console.error(e))
