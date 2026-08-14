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

  // 1. 在 web 容器里用 prisma 直接 push schema
  console.log('==== 运行 Prisma db push ====')
  let r = await sshExec(conn, 'docker exec zscx-web sh -c "cd /app && npx prisma db push 2>&1"')
  console.log(r.out || r.errOut)

  // 2. 查看所有表
  console.log('\n==== 检查 IntegrationConfig 表 ====')
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SHOW TABLES FROM zscx LIKE \'Integration%\'; SHOW TABLES FROM zscx LIKE \'UserThird%\'; SHOW TABLES FROM zscx LIKE \'Approval%\'; SHOW TABLES FROM zscx LIKE \'Notification%\'; SHOW TABLES FROM zscx LIKE \'User%\';" 2>&1 | grep -v Warning')
  console.log(r.out)

  // 3. 如果 IntegrationConfig 还没建，手动建
  console.log('\n==== 手动建 IntegrationConfig ====')
  r = await sshExec(conn, `docker exec zscx-mysql mysql -uzscx -p"zscx123456" zscx -e "
CREATE TABLE IF NOT EXISTS IntegrationConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform ENUM('FEISHU','WECHAT_WORK','DINGTALK') NOT NULL,
  status ENUM('ENABLED','DISABLED') DEFAULT 'DISABLED',
  appId TEXT NULL,
  appSecret TEXT NULL,
  webhookUrl TEXT NULL,
  agentId VARCHAR(255) NULL,
  corpId VARCHAR(255) NULL,
  tenantId VARCHAR(255) NULL,
  extraConfig JSON NULL,
  notifyEnabled BOOLEAN DEFAULT false,
  approvalEnabled BOOLEAN DEFAULT false,
  notifyChannels JSON NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY platform (platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
" 2>&1 | grep -v Warning`)
  console.log(r.out || r.errOut)

  // 4. 插入飞书配置
  console.log('\n==== 插入飞书配置 ====')
  r = await sshExec(conn, `docker exec zscx-mysql mysql -uzscx -p"zscx123456" zscx -e "
INSERT INTO IntegrationConfig (platform, status, appId, appSecret, notifyEnabled, approvalEnabled)
VALUES ('FEISHU', 'ENABLED', 'cli_aaf3f3f704389cbb', 'YOUR_APP_SECRET', 1, 1)
ON DUPLICATE KEY UPDATE
  status = 'ENABLED',
  appId = VALUES(appId),
  appSecret = VALUES(appSecret);
" 2>&1 | grep -v Warning`)
  console.log(r.out || r.errOut)

  // 5. 查看
  console.log('\n==== 查询 IntegrationConfig ====')
  r = await sshExec(conn, 'docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT id, platform, status, appId FROM zscx.IntegrationConfig\\G" 2>&1 | grep -v Warning')
  console.log(r.out)

  // 6. 等 Next.js 就绪后测试 API
  console.log('\n==== 等 Next.js 就绪 ====')
  await new Promise(res => setTimeout(res, 30000))

  console.log('\n==== 测试 API ====')
  r = await sshExec(conn, `docker exec zscx-web sh -c 'cat > /tmp/t.js << '"'"'EOF'"'"'
const http = require("http");
http.get("http://localhost:3000/api/auth/third-party/platforms", (res) => {
  let d = "";
  res.on("data", (c) => d += c);
  res.on("end", () => console.log("STATUS:", res.statusCode, "BODY:", d));
}).on("error", (e) => console.log("ERR:", e.message));
EOF
node /tmp/t.js'`)
  console.log(r.out || r.errOut)

  // 7. 容器状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
