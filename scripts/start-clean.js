const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 180000) {
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
  console.log('==== 清理旧容器 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 启动 web (用 clean 镜像，它有 BUILD_ID)
  console.log('\n==== 用 zscx-web:clean 启动 ====')
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    zscx-web:clean \
    sh -c "node /app/prisma/docker-migrate.js && npx next start -p 3000" 2>&1`)
  console.log(r.out || r.errOut)

  // 3. 等待
  console.log('\n==== 等待 25s ====')
  await new Promise(res => setTimeout(res, 25000))

  // 4. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 5. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, `docker exec zscx-web sh -c 'cat > /tmp/t.js << '"'"'EOF'"'"'
const http = require("http");
http.get("http://localhost:3000/api/auth/third-party/platforms", (res) => {
  let d = "";
  res.on("data", (c) => d += c);
  res.on("end", () => console.log("STATUS:", res.statusCode, "\nBODY:", d));
}).on("error", (e) => console.log("ERR:", e.message));
EOF
node /tmp/t.js'`)
  console.log(r.out || r.errOut)

  // 6. 外部测试
  console.log('\n==== 外部测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:666/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  // 7. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
