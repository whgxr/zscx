const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', async () => {
  const run = (cmd) => new Promise((res, rej) => {
    c.exec(cmd, (err, s) => {
      if (err) return rej(err)
      let out = '', errOut = ''
      s.on('data', d => out += d.toString())
      s.stderr.on('data', d => errOut += d.toString())
      s.on('close', () => res({ out, errOut }))
    })
  })

  // 1. 清理
  console.log('==== 清理 ====')
  let r = await run('docker rm -f zscx-mysql 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 创建卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 3. 先用 recovery 模式初始化并导入
  console.log('\n==== 初始化并导入（recovery 模式）====')
  r = await run('docker run -d --name zscx-mysql-recovery -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 --innodb-force-recovery=4 2>&1')
  console.log('启动 recovery:', r.out || r.errOut)

  console.log('等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  // 4. 连接验证
  let connected = false
  for (let i = 0; i < 5; i++) {
    r = await run('docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
    if (r.out.includes('1')) { connected = true; break }
    console.log(`连接尝试 ${i+1} 失败，重试...`)
    await new Promise(res => setTimeout(res, 3000))
  }
  console.log('\nMySQL 连通:', connected)

  if (connected) {
    // 5. 导入 dump2
    console.log('\n==== 导入 dump ====')
    r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump2.sql | docker exec -i zscx-mysql-recovery mysql -uroot -proot123456 zscx 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 6. 创建 IntegrationConfig 表
    console.log('\n==== 创建 IntegrationConfig ====')
    const sql = `DROP TABLE IF EXISTS IntegrationConfig;
CREATE TABLE IntegrationConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
  appId TEXT NULL,
  appSecret TEXT NULL,
  webhookUrl TEXT NULL,
  agentId VARCHAR(255) NULL,
  corpId VARCHAR(255) NULL,
  tenantId VARCHAR(255) NULL,
  extraConfig JSON NULL,
  notifyEnabled TINYINT(1) NOT NULL DEFAULT 0,
  approvalEnabled TINYINT(1) NOT NULL DEFAULT 0,
  notifyChannels JSON NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO IntegrationConfig (platform, status, appId, appSecret, notifyEnabled, approvalEnabled)
VALUES ('FEISHU', 'ENABLED', NULL, NULL, 1, 1);
`
    const b64 = Buffer.from(sql).toString('base64')
    r = await run(`echo '${b64}' | base64 -d > /tmp/create-feishu.sql && docker cp /tmp/create-feishu.sql zscx-mysql-recovery:/tmp/ && docker exec zscx-mysql-recovery mysql -uroot -proot123456 zscx < /tmp/create-feishu.sql 2>&1`)
    console.log(r.out || r.errOut || 'done')

    // 7. 验证
    console.log('\n==== 验证 ====')
    r = await run("docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)

    r = await run("docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
    console.log('IntegrationConfig:', r.out || r.errOut)
  }

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
