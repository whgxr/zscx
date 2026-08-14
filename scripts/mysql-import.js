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

  // 1. 确认 MySQL ready
  let r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1 AS ok" 2>&1')
  console.log('==== MySQL 连通性 ====')
  console.log(r.out || r.errOut)

  // 2. 导入 dump（过滤 warning）
  console.log('\n==== 导入 dump ====')
  r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 3. 创建 IntegrationConfig 和 UserThirdPartyBinding
  const sql = `CREATE TABLE IF NOT EXISTS IntegrationConfig (
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

CREATE TABLE IF NOT EXISTS UserThirdPartyBinding (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  platform VARCHAR(50) NOT NULL,
  platformUserId VARCHAR(255) NOT NULL,
  accessToken TEXT NULL,
  refreshToken TEXT NULL,
  expiresAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_user (platform, platformUserId),
  INDEX idx_userId (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO IntegrationConfig (platform, status, appId, appSecret, notifyEnabled, approvalEnabled)
SELECT 'FEISHU', 'ENABLED', NULL, NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM IntegrationConfig WHERE platform = 'FEISHU');
`
  const b64 = Buffer.from(sql).toString('base64')
  r = await run(`echo '${b64}' | base64 -d > /tmp/additional-tables.sql && docker cp /tmp/additional-tables.sql zscx-mysql-init:/tmp/ 2>&1`)
  console.log('\n==== 生成并复制 SQL ====', r.errOut || 'OK')

  console.log('\n==== 执行建表 ====')
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 zscx < /tmp/additional-tables.sql 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 4. 验证
  console.log('\n==== 验证所有表 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  console.log('\n==== IntegrationConfig 数据 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, appId, appSecret, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
