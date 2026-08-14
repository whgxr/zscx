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

  const adminHash = await bcrypt.hash('admin123', 12)
  console.log('Admin password hash:', adminHash)

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '')
  console.log('Now:', now)

  const sql = `
-- 清空旧数据（如果有）
DELETE FROM User;
DELETE FROM Role;
DELETE FROM SystemSetting;

-- 创建角色
INSERT INTO Role (id, name, label, description, canManageTables, canManageUsers, canManagePermissions, canManageTemplates, canViewLogs, canManageSettings, canManageApproval, canPublishNotification, isSystem, sortOrder, createdAt, updatedAt) VALUES
(1, 'admin', '系统管理员', '系统管理员角色', 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, '${now}', '${now}'),
(2, 'user', '普通用户', '普通用户角色', 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, '${now}', '${now}'),
(3, 'viewer', '观察者', '只读观察者', 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, '${now}', '${now}');

-- 创建管理员用户
INSERT INTO User (id, username, passwordHash, realName, phone, email, roleId, status, createdAt, updatedAt) VALUES
(1, 'admin', '${adminHash}', '系统管理员', '13800000000', 'admin@example.com', 1, 'ACTIVE', '${now}', '${now}');

-- 系统设置
INSERT INTO SystemSetting (id, \`key\`, value, description, createdAt, updatedAt) VALUES
(1, 'system_name', '征收管理系统', '系统名称', '${now}', '${now}'),
(2, 'system_version', '1.0.0', '系统版本', '${now}', '${now}'),
(3, 'login_enabled', 'true', '是否启用登录', '${now}', '${now}'),
(4, 'register_enabled', 'false', '是否启用注册', '${now}', '${now}');
`
  const b64 = Buffer.from(sql).toString('base64')
  let r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 zscx 2>&1`)
  console.log('执行结果:', r.out || r.errOut || 'done')

  // 验证
  console.log('\n==== 验证 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, name, label FROM zscx.Role;\" 2>&1")
  console.log('Roles:', r.out || r.errOut)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, username, realName, roleId, status FROM zscx.User;\" 2>&1")
  console.log('Users:', r.out || r.errOut)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, \\\`key\\\`, value FROM zscx.SystemSetting;\" 2>&1")
  console.log('Settings:', r.out || r.errOut)

  // 验证 IntegrationConfig
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT id, platform, status, notifyEnabled, approvalEnabled FROM zscx.IntegrationConfig;\" 2>&1")
  console.log('IntegrationConfig:', r.out || r.errOut)

  c.end()
})
