const { Client } = require('ssh2')
const bcrypt = require('bcryptjs')
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

  // 问题：docker-compose 创建的是 docker_mysql_data 卷，不是 zscx_mysql_data
  // 需要初始化 docker_mysql_data 卷

  // 1. 停掉所有
  console.log('==== 1. 停掉所有容器 ====')
  let r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml down 2>&1')
  console.log(r.out || r.errOut)

  // 2. 删除 compose 创建的卷
  console.log('\n==== 2. 删除 compose 卷 ====')
  r = await run('docker volume rm -f docker_mysql_data docker_uploads docker_backups 2>&1')
  console.log(r.out || r.errOut)

  // 3. 初始化 docker_mysql_data 卷（compose 使用的卷名）
  console.log('\n==== 3. 初始化 docker_mysql_data ====')
  r = await run('docker run -d --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v docker_mysql_data:/var/lib/mysql mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --explicit_defaults_for_timestamp=true 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 40s...')
  await new Promise(res => setTimeout(res, 40000))

  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('连通性:', r.out || r.errOut)

  if (!r.out.includes('1')) {
    console.log('MySQL 启动失败！')
    r = await run('docker logs --tail 20 zscx-mysql-init 2>&1')
    console.log(r.out)
    c.end()
    return
  }

  // 4. 创建用户
  console.log('\n==== 4. 创建数据库用户 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"CREATE USER IF NOT EXISTS 'zscx'@'%' IDENTIFIED BY 'zscx123456'; GRANT ALL PRIVILEGES ON zscx.* TO 'zscx'@'%'; FLUSH PRIVILEGES;\" 2>&1")
  console.log(r.out || r.errOut || 'done')

  // 5. 导入 dump
  console.log('\n==== 5. 导入 dump ====')
  r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 6. IntegrationConfig
  console.log('\n==== 6. IntegrationConfig ====')
  const sql = `
DROP TABLE IF EXISTS IntegrationConfig;
CREATE TABLE IntegrationConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
  appId TEXT NULL, appSecret TEXT NULL, webhookUrl TEXT NULL,
  agentId VARCHAR(255) NULL, corpId VARCHAR(255) NULL, tenantId VARCHAR(255) NULL,
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
  let b64 = Buffer.from(sql).toString('base64')
  r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1`)
  console.log(r.out || r.errOut || 'done')

  // 7. 基础数据
  console.log('\n==== 7. 基础数据 ====')
  const adminHash = await bcrypt.hash('admin123', 12)
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const seedSQL = `
INSERT INTO Role (id, name, label, description, canManageTables, canManageUsers, canManagePermissions, canManageTemplates, canViewLogs, canManageSettings, canManageApproval, canPublishNotification, isSystem, sortOrder, createdAt, updatedAt) VALUES
(1, 'admin', '系统管理员', '系统管理员角色', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, '${now}', '${now}'),
(2, 'user', '普通用户', '普通用户角色', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, '${now}', '${now}'),
(3, 'viewer', '观察者', '只读观察者', 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, '${now}', '${now}');
INSERT INTO User (id, username, passwordHash, realName, phone, email, roleId, status, createdAt, updatedAt) VALUES
(1, 'admin', '${adminHash}', '系统管理员', '13800000000', 'admin@example.com', 1, 'ACTIVE', '${now}', '${now}');
INSERT INTO SystemSetting (id, \`key\`, value, description, createdAt, updatedAt) VALUES
(1, 'system_name', '征收管理系统', '系统名称', '${now}', '${now}'),
(2, 'system_version', '1.0.0', '系统版本', '${now}', '${now}'),
(3, 'login_enabled', 'true', '是否启用登录', '${now}', '${now}'),
(4, 'register_enabled', 'false', '是否启用注册', '${now}', '${now}');
`
  b64 = Buffer.from(seedSQL).toString('base64')
  r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1`)
  console.log(r.out || r.errOut || 'done')

  // 8. 验证
  console.log('\n==== 8. 验证 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
  console.log(r.out)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status FROM zscx.IntegrationConfig;\" 2>&1")
  console.log('IntegrationConfig:', r.out || r.errOut)

  // 9. 停掉临时容器
  console.log('\n==== 9. 停掉临时容器 ====')
  r = await run('docker stop zscx-mysql-init && docker rm zscx-mysql-init')
  console.log(r.out || r.errOut)

  // 10. 启动 compose
  console.log('\n==== 10. 启动 docker-compose ====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  // 11. 最终状态
  console.log('\n==== 11. 最终状态 ====')
  r = await run('docker ps --filter name=zscx')
  console.log(r.out)

  if (r.out.includes('zscx-web') && r.out.includes('Up')) {
    console.log('\n==== Web 容器日志 ====')
    r = await run('docker logs --tail 30 zscx-web 2>&1')
    console.log(r.out)
  } else {
    r = await run('docker logs --tail 20 zscx-web 2>&1')
    console.log('\nWeb 日志:', r.out)
  }

  c.end()
})