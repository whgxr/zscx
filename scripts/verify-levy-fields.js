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
    console.log('==== 1. LEVY_RELATION 字段 ====')
    let r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SELECT id,tableId,name,label,type,isSystem,config FROM TableField WHERE type=\"LEVY_RELATION\";"'`)
    console.log(r.out || '(无 LEVY_RELATION 字段)')

    console.log('\n==== 2. 各表所属模块（category）====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SELECT d.id,d.name,d.label,c.name AS catName,c.module FROM DataTable d LEFT JOIN TableCategory c ON c.id=d.categoryId;"'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 同步 API 测试 ====')
    // 测试登录获取 token
    r = await run(c, 'curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\"}" 2>&1 | head -c 300')
    console.log('登录响应:', r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })