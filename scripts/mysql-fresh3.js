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

  // 查看当前状态
  console.log('==== 当前状态 ====')
  let r = await run('docker ps -a 2>&1')
  console.log(r.out)

  // 如果 MySQL init 正在运行，尝试修复 socket 问题
  // 通过 TCP 连接
  const containerId = (await run('docker ps -q --filter name=zscx-mysql-init')).out.trim()
  console.log('MySQL 容器 ID:', containerId)

  // 试试用 TCP
  if (containerId) {
    console.log('\n==== 尝试 TCP 连接 ====')
    r = await run(`cat /tmp/zscx-dump.sql | docker exec -i ${containerId} mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 zscx 2>&1`)
    console.log(r.out || r.errOut || 'done')
  } else {
    console.log('没有 MySQL 容器，重新启动')
    r = await run('docker rm -f zscx-mysql-init zscx-mysql 2>/dev/null; docker run -d --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql -p 13306:3306 mysql:5.7 2>&1')
    console.log('启动:', r.out || r.errOut)

    await new Promise(res => setTimeout(res, 20000))

    // 验证运行
    r = await run('docker exec zscx-mysql-init mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 -e "SELECT 1" 2>&1')
    console.log('\nMySQL 连通性:', r.out || r.errOut)

    if (!r.out.includes('1')) {
      console.log('尝试 socket')
      r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
      console.log('socket:', r.out || r.errOut)
    }

    // 导入 dump
    console.log('\n==== 导入 dump ====')
    r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 zscx 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 创建额外表 - 用 base64 传输
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
    r = await run(`echo '${b64}' | base64 -d > /tmp/additional-tables.sql 2>&1`)
    console.log('\n==== 生成 additional-tables.sql ====', r.errOut || 'OK')

    r = await run('docker cp /tmp/additional-tables.sql zscx-mysql-init:/tmp/ 2>&1')
    console.log('复制到容器:', r.out || r.errOut)

    console.log('\n==== 执行额外表创建 ====')
    r = await run('docker exec zscx-mysql-init mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 zscx < /tmp/additional-tables.sql 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 验证
    console.log('\n==== 验证表 ====')
    r = await run("docker exec zscx-mysql-init mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)

    r = await run("docker exec zscx-mysql-init mysql -h 127.0.0.1 -P 3306 -uroot -proot123456 -e \"SELECT id, platform, status FROM zscx.IntegrationConfig;\" 2>&1")
    console.log('IntegrationConfig:', r.out || r.errOut)
  }

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
