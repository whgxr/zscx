const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 120000) {
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

  // 1. 清理
  console.log('==== 清理 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 在容器里预先创建 .env 文件（供 Prisma 读取）
  console.log('\n==== 在 clean 镜像里预创建 .env ====')
  // 通过启动一个临时容器创建 .env，然后 commit
  r = await sshExec(conn, `docker run --name zscx-web-env-setup zscx-web:clean sh -c 'printf "DATABASE_URL=%s\\nJWT_SECRET=%s\\nJWT_EXPIRES_IN=%s\\nNEXT_PUBLIC_BASE_URL=%s\\nNODE_ENV=%s\\n" "mysql://zscx:zscx123456@zscx-mysql:3306/zscx" "REDACTED_JWT" "7d" "http://REDACTED_IP:666" "production" > /app/.env && ls -la /app/.env && cat /app/.env' 2>&1`)
  console.log(r.out || r.errOut)

  // 3. 提交成新镜像
  console.log('\n==== 提交新镜像 ====')
  r = await sshExec(conn, 'docker commit zscx-web-env-setup zscx-web:envready && docker rm zscx-web-env-setup')
  console.log(r.out || r.errOut)

  // 4. 启动
  console.log('\n==== 启动 Web ====')
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    zscx-web:envready \
    sh -c "node /app/prisma/docker-migrate.js && npx next start -p 3000" 2>&1`)
  console.log(r.out || r.errOut)

  // 5. 等待
  console.log('\n==== 等待 20s ====')
  await new Promise(res => setTimeout(res, 20000))

  // 6. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 7. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:666/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  // 8. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
