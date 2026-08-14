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

  // 一步步执行，查看错误
  console.log('==== 分步执行 ====')
  const steps = [
    'DROP TABLE IF EXISTS IntegrationConfig',
    'CREATE TABLE IntegrationConfig (id INT AUTO_INCREMENT PRIMARY KEY, platform VARCHAR(50) NOT NULL UNIQUE, status VARCHAR(20) NOT NULL DEFAULT "DISABLED", appId TEXT NULL, appSecret TEXT NULL, webhookUrl TEXT NULL, agentId VARCHAR(255) NULL, corpId VARCHAR(255) NULL, tenantId VARCHAR(255) NULL, extraConfig JSON NULL, notifyEnabled TINYINT(1) NOT NULL DEFAULT 0, approvalEnabled TINYINT(1) NOT NULL DEFAULT 0, notifyChannels JSON NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    "INSERT INTO IntegrationConfig (platform, status, appId, appSecret, notifyEnabled, approvalEnabled) VALUES ('FEISHU', 'ENABLED', NULL, NULL, 1, 1)",
    "SELECT id, platform, status, notifyEnabled, approvalEnabled FROM IntegrationConfig",
  ]

  for (const step of steps) {
    // 对每个步骤单独执行
    const b64 = Buffer.from(step + ';').toString('base64')
    r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1`)
    console.log('> ', step.slice(0, 80))
    if (r.out) console.log('  OUT:', r.out.trim())
    if (r.errOut) console.log('  ERR:', r.errOut.trim())
  }

  c.end()
})
