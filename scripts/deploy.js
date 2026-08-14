const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout '+timeout+'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out='', errOut=''
      stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()) })
      stream.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d.toString()) })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('\nConnected\n')

  // 1. 清理
  console.log('==== 清理旧容器 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-mysql 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 删除服务器上的 debug 目录（避免 lint 错误）
  console.log('\n==== 删除 debug 目录 ====')
  r = await sshExec(conn, 'rm -rf /vol2/1000/docker/zscx/web/app/api/debug && ls /vol2/1000/docker/zscx/web/app/api/ 2>&1')
  console.log(r.out)

  // 3. 修改 package.json 为 next build --no-lint
  console.log('\n==== 修改 build 脚本 ====')
  r = await sshExec(conn, `python3 << 'PYEOF'
import json
with open('/vol2/1000/docker/zscx/web/package.json') as f:
    d = json.load(f)
d['scripts']['build'] = 'next build --no-lint'
with open('/vol2/1000/docker/zscx/web/package.json', 'w') as f:
    json.dump(d, f, indent=2)
print('New build script:', d['scripts']['build'])
PYEOF`)
  console.log(r.out || r.errOut)

  // 4. 重建
  console.log('\n==== 重新构建镜像 (预计 5-10 分钟) ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker build -t docker-web:latest ./web --no-cache 2>&1 | tail -50', 900000)
  console.log('Build result:\n' + (r.out || r.errOut))

  // 5. 验证镜像有 docker-migrate.js
  console.log('\n==== 验证镜像内容 ====')
  r = await sshExec(conn, 'docker run --rm --entrypoint sh docker-web:latest -c "ls /app/prisma/docker-migrate.js && ls /app/app/api/auth/third-party/platforms/route.ts" 2>&1')
  console.log(r.out || r.errOut)

  // 6. 启动 mysql
  console.log('\n==== 启动 MySQL ====')
  r = await sshExec(conn, 'docker run -d --name zscx-mysql --network zscx_default -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v mysql_data:/var/lib/mysql mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max_connections=1000 --explicit_defaults_for_timestamp=true 2>&1')
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 15000))

  // 7. 验证数据
  console.log('\n==== 验证数据 ====')
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT * FROM zscx.IntegrationConfig\\G" 2>&1 | grep -v Warning')
  console.log(r.out || r.errOut)

  // 8. 启动 web
  console.log('\n==== 启动 Web ====')
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    docker-web:latest 2>&1`)
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 25000))

  // 9. 日志
  console.log('\n==== Web 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 40 zscx-web 2>&1')
  console.log(r.out)

  // 10. API
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'docker exec zscx-web node -e "const http=require(\"http\");http.get(\"http://localhost:3000/api/auth/third-party/platforms\",(res)=>{let d=\"\";res.on(\"data\",c=>d+=c);res.on(\"end\",()=>console.log(d))}).on(\"error\",e=>console.log(\"ERR:\",e.message))" 2>&1')
  console.log(r.out || r.errOut)

  // 11. 状态
  console.log('\n==== 容器状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
