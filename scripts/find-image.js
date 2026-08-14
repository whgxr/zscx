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

  // 1. 清理旧容器
  console.log('==== 清理 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 检查镜像内容
  console.log('\n==== 检查镜像内容 ====')
  for (const img of ['zscx-web:fix', 'zscx-web:rebuilt', 'zscx-web:clean', 'docker-web:latest']) {
    r = await sshExec(conn, `docker run --rm --entrypoint sh ${img} -c "echo '=== ${img} ===' && ls /app/next.config.js 2>&1 && ls /app/.next/BUILD_ID 2>&1 && ls /app/prisma/docker-migrate.js 2>&1 && ls /app/node_modules/next/dist/bin/next 2>&1 && du -sh /app/.next/ 2>&1" 2>&1`)
    console.log(r.out || r.errOut)
  }

  // 3. 找到可用的镜像，启动它
  console.log('\n==== 启动可用镜像 ====')
  // 先用 zscx-web:clean 尝试（可能有 BUILD_ID）
  r = await sshExec(conn, `docker run -d --name zscx-web --network zscx_default -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    zscx-web:rebuilt \
    sh -c "ls /app/.next/BUILD_ID 2>&1 && npx next start -p 3000" 2>&1`)
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 20000))

  // 4. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 20 zscx-web 2>&1')
  console.log(r.out)

  // 5. API 测试
  console.log('\n==== API ====')
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

  // 6. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
