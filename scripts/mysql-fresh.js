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
  let r = await run('docker rm -f zscx-mysql zscx-web 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 创建卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 3. 用 MySQL 官方镜像初始化（不含 recovery 参数）
  console.log('\n==== 初始化新 MySQL ====')
  r = await run('docker run --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max-connections=1000 --explicit_defaults_for_timestamp=true 2>&1', 180000)
  console.log('初始化:', r.out.slice(-1000))
  if (r.errOut) console.log('ERR:', r.errOut.slice(-500))

  // 4. 检查容器状态
  r = await run('docker ps -a --filter name=zscx-mysql-init')
  console.log('\n状态:', r.out)

  const initContainerUp = (await run('docker inspect -f "{{.State.Running}}" zscx-mysql-init 2>&1')).out.trim()
  console.log('Running:', initContainerUp)

  // 5. 如果 init 还在运行，等待它
  if (initContainerUp !== 'true') {
    console.log('等待 init 完成...')
    await new Promise(res => setTimeout(res, 30000))
    r = await run('docker inspect -f "{{.State.Running}}" zscx-mysql-init 2>&1')
    console.log('Running:', r.out.trim())
  }

  // 6. 导入 dump
  console.log('\n==== 导入 dump ====')
  r = await run('cat /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 7. 写入 additional tables SQL
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

  // SCP 上传
  const scp = require('ssh2-sftp-client')
  const sftp = new scp()
  await new Promise((res, rej) => sftp.on('ready', res).on('error', rej).connect({
    host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
  }))
  await sftp.fastPut(sqlFile, '/tmp/additional-tables.sql')
  await sftp.end()

  r = await run('docker cp /tmp/additional-tables.sql zscx-mysql-init:/tmp/additional-tables.sql 2>&1')
  console.log('复制 SQL:', r.out || r.errOut)

  console.log('\n==== 执行额外表创建 ====')
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 zscx -e "source /tmp/additional-tables.sql" 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 8. 停掉 init，用 compose 启动
  console.log('\n==== 切换为 compose 管理 ====')
  r = await run('docker rm -f zscx-mysql-init 2>&1; echo done')
  console.log(r.out.trim())

  r = await run('cd /vol2/1000/docker/zscx/docker && docker compose up -d mysql 2>&1')
  console.log('启动 MySQL:', r.out || r.errOut)

  await new Promise(res => setTimeout(res, 15000))

  r = await run('docker ps --filter name=zscx')
  console.log('\n状态:', r.out)

  r = await run('docker logs --tail 10 zscx-mysql 2>&1')
  console.log('日志:', r.out)

  // 9. 验证
  console.log('\n==== 验证 ====')
  r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
