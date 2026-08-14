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

  // 1. 清理当前状态
  console.log('==== 清理 ====')
  let r = await run('docker rm -f zscx-mysql zscx-mysql-recovery zscx-web 2>/dev/null; docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 创建新卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建卷:', r.out || r.errOut)

  // 3. 启动一个干净的 MySQL 实例
  console.log('\n==== 启动干净 MySQL 实例 ====')
  r = await run('docker run -d --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql mysql:5.7 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  // 4. 验证 MySQL 运行
  r = await run('docker ps -a --filter name=zscx-mysql-init')
  console.log('\n状态:', r.out)

  // 等待初始化完成（入口脚本会等待 mysqld ready）
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('连通性:', r.out || r.errOut)

  if (r.out.includes('1')) {
    // 5. 导入原始 dump
    console.log('\n==== 导入原始 dump ====')
    r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 6. 创建 IntegrationConfig 表
    console.log('\n==== 创建 IntegrationConfig ====')
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

    // 7. 验证
    console.log('\n==== 验证 ====')
    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)

    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
    console.log('IntegrationConfig:', r.out || r.errOut)
  }

  c.end()
})
