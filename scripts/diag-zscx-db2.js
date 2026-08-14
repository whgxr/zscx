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
    // 用单引号包裹整个 -e 参数，避免 shell 解析问题
    let r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SHOW TABLES;" 2>/dev/null || mysql -uroot -pzscx123456 zscx -e "SHOW TABLES;"'`)
    console.log('==== 当前卷内表 ====')
    console.log(r.out || r.errOut)

    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SELECT COUNT(*) AS n FROM DataTable;" 2>/dev/null || mysql -uroot -pzscx123456 zscx -e "SELECT COUNT(*) AS n FROM DataTable;"'`)
    console.log('\n==== DataTable 数量 ====')
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })