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
    console.log('==== 1. Role 表 updatedAt 列定义 ====')
    let r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SHOW COLUMNS FROM Role LIKE \"updatedAt\";" 2>/dev/null'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 2. User 表 updatedAt 列定义 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SHOW COLUMNS FROM User LIKE \"updatedAt\";" 2>/dev/null'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 3. SystemSetting 表 updatedAt 列定义 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SHOW COLUMNS FROM SystemSetting LIKE \"updatedAt\";" 2>/dev/null'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 所有含 updatedAt 且无默认值的表 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 -e "SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=\"zscx\" AND COLUMN_NAME=\"updatedAt\" AND IS_NULLABLE=\"NO\" AND COLUMN_DEFAULT IS NULL;" 2>/dev/null'`)
    console.log(r.out || '(无)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })