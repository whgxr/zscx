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
    console.log('==== 1. 所有卷 ====')
    let r = await run(c, 'docker volume ls | grep -i mysql')
    console.log(r.out || r.errOut || '(无)')

    console.log('\n==== 2. 当前 mysql 容器挂载的卷 ====')
    r = await run(c, 'docker inspect zscx-mysql --format "{{range .Mounts}}{{.Name}} -> {{.Destination}}{{println}}{{end}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 数据库表数量（当前容器内）====')
    r = await run(c, 'docker exec zscx-mysql sh -c "mysql -uroot -proot123456 -e \"SELECT COUNT(*) AS tbls FROM information_schema.tables WHERE table_schema=\'zscx\';\" 2>/dev/null || mysql -uroot -pzscx123456 -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=\'zscx\'\""')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 关键表是否存在 ====')
    r = await run(c, 'docker exec zscx-mysql sh -c "mysql -uroot -proot123456 -e \"SHOW TABLES FROM zscx;\" 2>/dev/null"')
    console.log(r.out || r.errOut || '(无)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })