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

  // 1. 创建 docker-compose.yml 指向正确目录
  // 先清理旧的 mysql_data 卷（已重命名旧目录，现在重建）
  console.log('==== 重新创建数据卷 ====')
  let r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log(r.out || r.errOut)

  // 2. 用 docker compose 启动 MySQL
  r = await run('cd /vol2/1000/docker/zscx/docker && docker compose up -d mysql 2>&1')
  console.log('\n==== 启动 MySQL ====')
  console.log(r.out || r.errOut)

  // 3. 等待 MySQL 启动
  console.log('\n==== 等待 MySQL 启动 ====')
  await new Promise(res => setTimeout(res, 20000))

  // 4. 状态
  r = await run('docker ps --filter name=zscx')
  console.log('\n状态:', r.out)

  // 5. 导入 dump
  console.log('\n==== 导入数据 ====')
  r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 6. 创建 IntegrationConfig 表（如果不存在）
  console.log('\n==== 创建 IntegrationConfig 表 ====')
  const createTableSQL = `
CREATE TABLE IF NOT EXISTS IntegrationConfig (
  id INTEGER AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
  appId TEXT NULL,
  appSecret TEXT NULL,
  webhookUrl TEXT NULL,
  agentId VARCHAR(255) NULL,
  corpId VARCHAR(255) NULL,
  tenantId VARCHAR(255) NULL,
  extraConfig JSON NULL,
  notifyEnabled BOOLEAN NOT NULL DEFAULT false,
  approvalEnabled BOOLEAN NOT NULL DEFAULT false,
  notifyChannels JSON NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS UserThirdPartyBinding (
  id INTEGER AUTO_INCREMENT PRIMARY KEY,
  userId INTEGER NOT NULL,
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
`
  // 写入 SQL 文件
  require('fs').writeFileSync('/tmp/create-tables.sql', createTableSQL)
  // 上传到服务器
  // 直接通过 docker exec 执行
  r = await run(`echo '${createTableSQL.replace(/'/g, "'\\''").replace(/\n/g, ' ')}' | docker exec -i zscx-mysql mysql -uroot -proot123456 zscx 2>&1`)
  console.log(r.out || r.errOut || 'done')

  // 7. 插入飞书配置
  console.log('\n==== 插入飞书配置 ====')
  // 先读取飞书配置
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SELECT * FROM zscx.IntegrationConfig;\" 2>&1")
  console.log('当前配置:', r.out || r.errOut)

  // 8. 验证
  console.log('\n==== 验证数据库 ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  c.end()
})
