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

  // 看看 UserThirdPartyBinding 表是否存在但 IntegrationConfig 不存在
  let r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW CREATE TABLE zscx.UserThirdPartyBinding\\G\" 2>&1")
  console.log('==== UserThirdPartyBinding ====')
  console.log(r.out)

  // 尝试直接创建 IntegrationConfig
  console.log('\n==== 直接创建 IntegrationConfig ====')
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
  r = await run(`echo '${b64}' | base64 -d > /tmp/create-feishu.sql && docker cp /tmp/create-feishu.sql zscx-mysql-init:/tmp/ && docker exec zscx-mysql-init mysql -uroot -proot123456 zscx < /tmp/create-feishu.sql 2>&1`)
  console.log(r.out || r.errOut || 'done')

  // 验证
  console.log('\n==== 验证 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log(r.out || r.errOut)

  c.end()
})
