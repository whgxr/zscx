const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

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

  // 1. 清理旧容器
  console.log('==== 清理 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-build 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 启动 clean 镜像作为基础容器
  console.log('\n==== 启动基础容器 ====')
  r = await sshExec(conn, 'docker run -d --name zscx-build zscx-web:clean sleep 3600 2>&1')
  console.log(r.out || r.errOut)

  // 3. 直接用 docker cp 从本地源码复制到容器
  console.log('\n==== 复制最新代码到容器 ====')

  // 用 base64 编码传递文件内容（仅覆盖我们更新过的文件）
  const libContent = fs.readFileSync(path.join(__dirname, '..', 'web', 'lib', 'prisma.ts'), 'utf-8')
  const routesContent = fs.readFileSync(path.join(__dirname, '..', 'web', 'app', 'api', 'auth', 'third-party', 'platforms', 'route.ts'), 'utf-8')

  const files = [
    { path: '/app/lib/prisma.ts', content: libContent },
    { path: '/app/app/api/auth/third-party/platforms/route.ts', content: routesContent },
  ]

  for (const f of files) {
    // base64 编码内容
    const b64 = Buffer.from(f.content).toString('base64')
    // 创建目录并解码写入
    const mkdirCmd = `mkdir -p $(dirname ${f.path}) && echo '${b64}' | base64 -d > ${f.path}`
    r = await sshExec(conn, `docker exec zscx-build sh -c "${mkdirCmd}"`)
    if (r.errOut) console.log('Warning:', r.errOut)
  }
  console.log('代码复制完成')

  // 4. 验证容器中文件
  console.log('\n==== 验证 ====')
  r = await sshExec(conn, 'docker exec zscx-build ls -la /app/lib/prisma.ts /app/app/api/auth/third-party/platforms/route.ts 2>&1')
  console.log(r.out || r.errOut)

  // 5. 在容器里重新 next build
  console.log('\n==== 重新 build ====')
  r = await sshExec(conn, 'docker exec zscx-build sh -c "cd /app && PATH=./node_modules/.bin:$PATH next build --no-lint 2>&1"', 600000)
  console.log(r.out || r.errOut)

  // 6. 验证编译产物
  console.log('\n==== 验证编译产物 ====')
  r = await sshExec(conn, 'docker exec zscx-build grep "datasources" /app/.next/server/app/api/auth/third-party/platforms/route.js 2>&1 | wc -l')
  console.log(r.out || r.errOut)

  // 7. 提交镜像
  console.log('\n==== 提交新镜像 ====')
  r = await sshExec(conn, 'docker commit zscx-build zscx-web:v4 && docker rm -f zscx-build')
  console.log(r.out || r.errOut)

  // 8. 预创建 .env
  console.log('\n==== 添加 .env ====')
  r = await sshExec(conn, `docker run --name zscx-web-env zscx-web:v4 sh -c 'printf "DATABASE_URL=%s\\nJWT_SECRET=%s\\nJWT_EXPIRES_IN=%s\\nNEXT_PUBLIC_BASE_URL=%s\\nNODE_ENV=%s\\n" "mysql://zscx:zscx123456@zscx-mysql:3306/zscx" "REDACTED_JWT" "7d" "http://REDACTED_IP:666" "production" > /app/.env' 2>&1 && \
    docker commit zscx-web-env zscx-web:v4env && \
    docker rm zscx-web-env`)
  console.log(r.out || r.errOut)

  // 9. 启动新容器
  console.log('\n==== 启动新 Web ====')
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    zscx-web:v4env \
    sh -c "node /app/prisma/docker-migrate.js && npx next start -p 3000" 2>&1`)
  console.log(r.out || r.errOut)

  // 10. 等待
  console.log('\n==== 等待 20s ====')
  await new Promise(res => setTimeout(res, 20000))

  // 11. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 15 zscx-web 2>&1')
  console.log(r.out)

  // 12. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:666/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  // 13. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
