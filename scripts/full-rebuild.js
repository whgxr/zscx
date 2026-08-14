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

  // 1. 清理所有
  console.log('==== 清理 ====')
  let r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml down -v 2>&1')
  console.log(r.out || r.errOut)

  r = await run('docker volume rm mysql_data 2>/dev/null; echo done')
  console.log('删除 mysql_data:', r.out.trim())

  // 2. 直接用 MySQL 容器初始化新数据库（不用 compose）
  console.log('\n==== 初始化新数据库 ====')
  r = await run('docker run --rm --name zscx-mysql-init -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v mysql_data:/var/lib/mysql mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --explicit_defaults_for_timestamp=true 2>&1 &')
  console.log('后台启动:', r.out || r.errOut)

  // 等待足够长时间让 MySQL 完全初始化
  console.log('等待 40s...')
  await new Promise(res => setTimeout(res, 40000))

  // 3. 检查 MySQL 是否在运行
  console.log('\n==== 检查 MySQL ====')
  r = await run('docker ps -a --filter name=zscx-mysql-init')
  console.log(r.out)

  // 尝试连接
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('连通性:', r.out || r.errOut)

  if (r.out.includes('1')) {
    // 4. 导入 dump
    console.log('\n==== 导入 dump ====')
    r = await run('grep -v "mysqldump: \\[Warning\\]" /tmp/zscx-dump.sql | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 5. 创建 IntegrationConfig
    console.log('\n==== 创建 IntegrationConfig ====')
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

    // 6. 创建基础数据
    console.log('\n==== 创建基础数据 ====')
    const bcrypt = require('bcryptjs')
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

    // 7. 验证
    console.log('\n==== 验证 ====')
    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>&1")
    console.log(r.out)

    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status FROM zscx.IntegrationConfig;\" 2>&1")
    console.log('IntegrationConfig:', r.out || r.errOut)

    r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, username FROM zscx.User;\" 2>&1")
    console.log('Users:', r.out || r.errOut)

    // 8. 停掉临时容器（保留卷数据）
    console.log('\n==== 停掉临时容器 ====')
    r = await run('docker stop zscx-mysql-init && docker rm zscx-mysql-init')
    console.log(r.out || r.errOut)

    // 9. 启动 compose
    console.log('\n==== 启动 docker-compose ====')
    r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n等待 15s...')
    await new Promise(res => setTimeout(res, 15000))

    r = await run('docker ps --filter name=zscx')
    console.log('容器状态:', r.out)
  }

  c.end()
})
