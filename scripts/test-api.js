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

  // 1. 查看 web 容器日志
  console.log('==== Web 日志 ====')
  let r = await sshExec(conn, 'docker logs --tail 50 zscx-web 2>&1')
  console.log(r.out)

  // 2. 查看 MySQL 表
  console.log('\n==== MySQL IntegrationConfig ====')
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SHOW TABLES FROM zscx;" 2>&1 | grep -v Warning')
  console.log(r.out)

  // 3. 查询 IntegrationConfig
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT id, platform, status, appId FROM zscx.IntegrationConfig\\G" 2>&1 | grep -v Warning')
  console.log(r.out)

  // 4. 如果 IntegrationConfig 没数据，重新插入
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT COUNT(*) AS cnt FROM zscx.IntegrationConfig;" 2>&1 | grep -v Warning')
  console.log('Count:', r.out)

  // 5. 用 node 测试 API
  console.log('\n==== API 测试 ====')
  // 创建一个临时测试脚本避免引号问题
  r = await sshExec(conn, `docker exec zscx-web sh -c 'cat > /tmp/test-api.js << '"'"'EOF'"'"'
const http = require("http");
http.get("http://localhost:3000/api/auth/third-party/platforms", (res) => {
  let d = "";
  res.on("data", (c) => d += c);
  res.on("end", () => console.log("API:", d));
}).on("error", (e) => console.log("ERR:", e.message));
EOF
node /tmp/test-api.js' 2>&1`)
  console.log(r.out || r.errOut)

  // 6. 直接测试外部
  console.log('\n==== 外部测试 ====')
  r = await sshExec(conn, 'curl -s http://localhost:666/api/auth/third-party/platforms 2>&1 || wget -qO- http://localhost:666/api/auth/third-party/platforms 2>&1 || echo NO_CURL')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
