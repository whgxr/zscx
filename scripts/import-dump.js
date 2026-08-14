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

  // 1. 导入原始 dump（24个表）
  console.log('==== 导入原始 dump ====')
  let r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 2. 验证表
  console.log('\n==== 验证表 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  // 3. 先删除已存在的 IntegrationConfig（可能由 dump 创建或不存在）
  console.log('\n==== 删除旧 IntegrationConfig ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"DROP TABLE IF EXISTS zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut || 'done')

  // 4. 创建新的 IntegrationConfig 表
  console.log('\n==== 创建 IntegrationConfig ====')
  const sql = `
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
  r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1`)
  console.log(r.out || r.errOut || 'done')

  // 5. 验证 IntegrationConfig
  console.log('\n==== 验证 IntegrationConfig ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut)

  // 6. 验证用户表
  console.log('\n==== 验证 User 表 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT COUNT(*) as user_count FROM zscx.User;\" 2>&1")
  console.log(r.out || r.errOut)

  c.end()
})
