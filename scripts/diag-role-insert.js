const { Client } = require('ssh2')
const c = new Client()
const run = (conn, cmd) => new Promise((res, rej) => {
  conn.exec(cmd, (err, s) => {
    if (err) return rej(err)
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => res({ out, errOut }))
  })
})
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 手动执行 Role INSERT（完整列含 updatedAt）====')
    let r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "INSERT INTO \\\`Role\\\` (\\\`name\\\`, \\\`label\\\`, \\\`description\\\`, \\\`canManageTables\\\`, \\\`canManageUsers\\\`, \\\`canManagePermissions\\\`, \\\`canManageTemplates\\\`, \\\`canViewLogs\\\`, \\\`canManageSettings\\\`, \\\`isSystem\\\`, \\\`sortOrder\\\`, \\\`updatedAt\\\`) VALUES (\\\"TEST_ROLE\\\", \\\"测试\\\", \\\"x\\\", 0,0,0,0,0,0,0,99, NOW()) ON DUPLICATE KEY UPDATE label=VALUES(label);"'`)
    console.log('stdout:', r.out || '(无输出=成功)')
    console.log('stderr:', r.errOut || '(无错误)')

    console.log('\n==== 2. 清理测试角色 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "DELETE FROM Role WHERE name=\\\"TEST_ROLE\\\";"'`)
    console.log(r.out || 'done')

    console.log('\n==== 3. 检查 web 容器实际使用的镜像 ====')
    r = await run(c, 'docker inspect zscx-web --format "{{.Image}}"')
    console.log(r.out)

    console.log('\n==== 4. DataTable 中是否有 levy/household 等表 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SELECT id,name,label FROM DataTable;"'`)
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })