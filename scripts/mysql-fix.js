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

  // 导出当前数据
  console.log('==== 导出数据 ====')
  let r = await run('docker exec zscx-mysql mysqldump -uroot -proot123456 --single-transaction zscx > /tmp/zscx-dump2.sql 2>&1')
  console.log(r.out || r.errOut || 'done')

  r = await run('ls -lh /tmp/zscx-dump2.sql')
  console.log('dump 文件:', r.out)

  // 停掉
  console.log('\n==== 停掉 recovery MySQL ====')
  r = await run('docker rm -f zscx-mysql 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 删除卷
  r = await run('docker volume rm zscx_mysql_data 2>/dev/null; echo done')
  console.log('删除卷:', r.out.trim())

  // 创建新卷
  r = await run('docker volume create zscx_mysql_data 2>&1')
  console.log('创建新卷:', r.out || r.errOut)

  // 用 compose 启动 MySQL (不含 recovery 参数)
  console.log('\n==== 用 compose 启动 MySQL ====')
  r = await run('cd /vol2/1000/docker/zscx/docker && docker compose up -d mysql 2>&1')
  console.log(r.out || r.errOut)

  console.log('等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  // 检查状态
  r = await run('docker ps -a --filter name=zscx-mysql')
  console.log('\n状态:', r.out)

  r = await run('docker logs --tail 10 zscx-mysql 2>&1')
  console.log('日志:', r.out)

  // 如果 MySQL running，导入数据
  const running = (await run('docker inspect -f "{{.State.Running}}" zscx-mysql 2>&1')).out.trim()
  console.log('\nRunning:', running)

  if (running === 'true') {
    console.log('\n==== 导入 dump2 ====')
    r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump2.sql | docker exec -i zscx-mysql mysql -uroot -proot123456 zscx 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 添加 IntegrationConfig 表
    console.log('\n==== 添加 IntegrationConfig ====')
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
    r = await run(`echo '${b64}' | base64 -d > /tmp/create-feishu.sql && docker cp /tmp/create-feishu.sql zscx-mysql:/tmp/ 2>&1 && docker exec zscx-mysql mysql -uroot -proot123456 zscx < /tmp/create-feishu.sql 2>&1`)
    console.log(r.out || r.errOut || 'done')

    // 验证
    console.log('\n==== 验证 ====')
    r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)

    r = await run("docker exec zscx-mysql mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
    console.log('IntegrationConfig:', r.out || r.errOut)
  }

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
