const { Client } = require('ssh2')
const fs = require('fs')
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

  // 1. 清理旧容器和卷
  console.log('==== 清理 ====')
  let r = await run('docker rm -f zscx-mysql zscx-web 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 创建卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 3. 启动 MySQL
  r = await run('cd /vol2/1000/docker/zscx/docker && docker compose up -d mysql 2>&1')
  console.log('启动 MySQL:', r.out || r.errOut)

  console.log('等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  r = await run('docker ps --filter name=zscx')
  console.log('状态:', r.out)

  // 4. 导入 dump
  console.log('\n==== 导入 dump ====')
  r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 5. 创建额外的表
  console.log('\n==== 创建额外表 ====')
  const sqlFile = '/tmp/additional-tables.sql'
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
  fs.writeFileSync(sqlFile, sql)
  r = await run(`docker cp ${sqlFile} zscx-mysql:/tmp/additional-tables.sql 2>&1`)
  console.log('复制 SQL:', r.out || r.errOut)

  r = await run('docker exec zscx-mysql mysql -uroot -proot123456 zscx -e "source /tmp/additional-tables.sql" 2>&1')
  console.log('执行结果:', r.out || r.errOut || 'done')

  // 6. 验证
  console.log('\n==== 验证表 ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  console.log('\n==== IntegrationConfig ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SELECT id, platform, status, appId, appSecret, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut)

  c.end()
})
