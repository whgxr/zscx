const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
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
  let r = await run('docker rm -f zscx-mysql-init zscx-mysql zscx-web 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 创建卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 3. 启动 MySQL（不带端口映射，只用内部网络）
  console.log('\n==== 启动 MySQL ====')
  r = await run('docker run -d --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql mysql:5.7 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  // 4. 验证 MySQL running
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1 AS ok" 2>&1')
  console.log('\n==== MySQL 连通性 ====')
  console.log(r.out || r.errOut)

  // 5. 过滤掉 dump 中的 warning 行，然后导入
  console.log('\n==== 导入 dump（过滤 warning）====')
  r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 6. 创建额外表
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
  console.log('\n==== 创建额外表 ====')
  console.log(r.out || r.errOut || 'done')

  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 zscx < /tmp/additional-tables.sql 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 7. 验证
  console.log('\n==== 验证 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log('IntegrationConfig:', r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
