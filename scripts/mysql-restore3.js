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

  // 查看当前 MySQL 状态
  console.log('==== MySQL 状态 ====')
  let r = await run('docker ps -a --filter name=zscx')
  console.log(r.out)

  // 查看日志
  r = await run('docker logs --tail 30 zscx-mysql 2>&1')
  console.log('\n日志:', r.out)

  // 如果在重启，等待恢复
  console.log('\n等待 MySQL 恢复...')
  await new Promise(res => setTimeout(res, 15000))

  r = await run('docker ps -a --filter name=zscx')
  console.log('状态:', r.out)

  // 如果 MySQL 还未 ready，尝试用 recovery 模式
  r = await run('docker inspect -f "{{.State.Health.Status}}" zscx-mysql 2>&1')
  console.log('健康状态:', r.out || r.errOut)

  // 导入 dump
  console.log('\n==== 导入 dump ====')
  r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 写 SQL 文件到本地 scripts/tmp 目录
  const localTmp = path.join(__dirname, 'tmp')
  if (!fs.existsSync(localTmp)) fs.mkdirSync(localTmp, { recursive: true })

  const sqlFile = path.join(localTmp, 'additional-tables.sql')
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
  console.log('\n==== SQL 文件已写入本地 ====')

  // 上传到服务器
  const scp = require('ssh2-sftp-client')
  const sftp = new scp()
  await new Promise((res, rej) => sftp.on('ready', res).on('error', rej).connect({
    host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
  }))
  await sftp.fastPut(sqlFile, '/tmp/additional-tables.sql')
  await sftp.end()
  console.log('已上传到服务器')

  // 上传到容器
  r = await run('docker cp /tmp/additional-tables.sql zscx-mysql:/tmp/additional-tables.sql 2>&1')
  console.log('复制到容器:', r.out || r.errOut)

  // 执行 SQL
  console.log('\n==== 执行 SQL ====')
  r = await run('docker exec zscx-mysql mysql -uroot -proot123456 zscx -e "source /tmp/additional-tables.sql" 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 验证
  console.log('\n==== 验证表 ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  console.log('\n==== IntegrationConfig ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SELECT id, platform, status, appId, appSecret, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
