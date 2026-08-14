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
const volumes = ['docker_mysql_data', 'mysql_data', 'zscx_mysql_data_recovery']
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    for (const v of volumes) {
      console.log(`\n==== 检查卷: ${v} ====`)
      // 用临时容器挂载该卷，尝试连接
      let r = await run(c, `docker rm -f tmp-mysql-check 2>/dev/null; docker run -d --name tmp-mysql-check -v ${v}:/var/lib/mysql -e MYSQL_ROOT_PASSWORD=root123456 mysql:5.7 >/dev/null 2>&1 || docker run -d --name tmp-mysql-check -v ${v}:/var/lib/mysql mysql:5.7 >/dev/null 2>&1`)
      await sleep(12000)
      // 尝试多种方式查询 - 先看能否用 zscx 库
      r = await run(c, `docker exec tmp-mysql-check sh -c 'mysql -uroot -proot123456 zscx -e "SHOW TABLES;" 2>&1 | head -30 || mysql -uroot zscx -e "SHOW TABLES;" 2>&1 | head -30'`)
      console.log(`  ${v} 表列表: ${(r.out || r.errOut || '(空)').split('\n').slice(0,8).join(' | ')}`)
      r = await run(c, `docker exec tmp-mysql-check sh -c 'mysql -uroot -proot123456 zscx -e "SELECT COUNT(*) AS n FROM DataTable;" 2>&1 || mysql -uroot zscx -e "SELECT COUNT(*) AS n FROM DataTable;" 2>&1'`)
      console.log(`  ${v} DataTable 数: ${r.out || r.errOut}`)
      await run(c, `docker rm -f tmp-mysql-check >/dev/null 2>&1`)
    }
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })