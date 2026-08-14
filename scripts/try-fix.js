const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout '+timeout+'ms')), timeout)
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out='', errOut=''
      stream.on('data', d => {
        const s = d.toString()
        out += s
        // Only print last 200 chars to see progress
        process.stdout.write('\r[PROGRESS] ' + s.replace(/\n/g, ' | ').slice(-200))
      })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', (code) => {
        clearTimeout(timer)
        process.stdout.write('\n[DONE]\n')
        resolve({ out, errOut, code })
      })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  // 1. 查看服务器状态（之前的 build 是否还在跑）
  console.log('==== 查看服务器进程 ====')
  let r = await sshExec(conn, 'ps aux | grep -E "docker|next" | grep -v grep')
  console.log(r.out)

  // 2. 查看已有镜像
  console.log('==== 已有镜像 ====')
  r = await sshExec(conn, 'docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}" | grep web')
  console.log(r.out)

  // 3. 启动已有的 zscx-web:fix 镜像（这个应该已经有 docker-migrate.js 和最新代码）
  console.log('==== 使用 zscx-web:fix 镜像尝试启动 ====')
  // 先清理
  r = await sshExec(conn, 'docker rm -f zscx-web zscx-mysql 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 启动 mysql
  console.log('-- 启动 MySQL --')
  r = await sshExec(conn, 'docker run -d --name zscx-mysql --network zscx_default -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v mysql_data:/var/lib/mysql mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max_connections=1000 --explicit_defaults_for_timestamp=true 2>&1')
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 15000))

  // 启动 web (用 fix 镜像)
  console.log('-- 用 zscx-web:fix 启动 Web --')
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    zscx-web:fix \
    sh -c "ls /app/prisma/docker-migrate.js && node /app/prisma/docker-migrate.js && npx next start -p 3000" 2>&1`)
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 20000))

  // 查看日志
  console.log('\n==== Web 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 40 zscx-web 2>&1')
  console.log(r.out)

  // 测试 API
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'docker exec zscx-web node -e "const http=require(\"http\");http.get(\"http://localhost:3000/api/auth/third-party/platforms\",(res)=>{let d=\"\";res.on(\"data\",c=>d+=c);res.on(\"end\",()=>console.log(d))}).on(\"error\",e=>console.log(\"ERR:\",e.message))" 2>&1')
  console.log(r.out || r.errOut)

  // 状态
  console.log('\n==== 容器状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
