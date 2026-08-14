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

  // 看看 dump 文件大小和内容
  r = await run('wc -l /tmp/zscx-dump.sql 2>&1; head -5 /tmp/zscx-dump.sql; echo ---; tail -30 /tmp/zscx-dump.sql')
  console.log('\n==== Dump 文件检查 ====')
  console.log(r.out)

  // 尝试用 mysqlimport 直接导入，不用 source
  // 先停掉所有 zscx 容器
  r = await run('docker rm -f zscx-mysql-init zscx-mysql zscx-web zscx-temp 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log('\n==== 清理 ====')
  console.log(r.out.trim())

  // 重新创建卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 用最简单的方式启动 MySQL，不带任何自定义参数
  console.log('\n==== 启动初始化容器 ====')
  r = await run('docker run -d --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql mysql:5.7 2>&1')
  console.log('启动:', r.out || r.errOut)

  // 等待更长时间让 MySQL 初始化
  console.log('等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  r = await run('docker ps -a --filter name=zscx-mysql-init')
  console.log('状态:', r.out)

  // 如果容器不是 running，看日志
  const running = (await run('docker inspect -f "{{.State.Running}}" zscx-mysql-init 2>&1')).out.trim()
  console.log('Running:', running)

  if (running !== 'true') {
    r = await run('docker logs zscx-mysql-init 2>&1')
    console.log('日志:', r.out.slice(-2000))
  }

  // 如果 MySQL running，导入 dump
  if (running === 'true') {
    console.log('\n==== 导入 dump ====')
    r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
    console.log('导入:', r.out || r.errOut || 'done')

    // 创建额外表
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

    const scp = require('ssh2-sftp-client')
    const sftp = new scp()
    await new Promise((res, rej) => sftp.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    }))
    await sftp.fastPut(sqlFile, '/tmp/additional-tables.sql')
    await sftp.end()

    r = await run('docker cp /tmp/additional-tables.sql zscx-mysql-init:/tmp/ 2>&1')
    console.log('复制 SQL:', r.out || r.errOut)

    console.log('\n==== 执行额外表创建 ====')
    r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 zscx < /tmp/additional-tables.sql 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 验证
    console.log('\n==== 验证 ====')
    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)
  }

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
