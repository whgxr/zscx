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
    console.log('==== 1. docker-nas 目录内容 ====')
    let r = await run(c, 'ls -la /vol2/1000/docker/zscx/docker-nas/')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. docker-nas/.env 是否存在及内容(脱敏) ====')
    r = await run(c, 'cat /vol2/1000/docker/zscx/docker-nas/.env 2>/dev/null | sed -E "s/(PASSWORD|SECRET|JWT)=.*/\\1=***/" || echo "=== .env 不存在 ==="')
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 检查 recover 卷的密码文件 ====')
    r = await run(c, 'docker run --rm -v zscx_mysql_data_recovery:/data alpine ls /data/ 2>/dev/null | head -20')
    console.log(r.out || r.errOut || '(无)')

    console.log('\n==== 4. 旧 docker_mysql_data 卷的 mysql 数据目录 ====')
    r = await run(c, 'docker run --rm -v docker_mysql_data:/var/lib/mysql alpine ls /var/lib/mysql/ 2>/dev/null | grep -iE "ibdata|zscx|mysql" | head')
    console.log(r.out || r.errOut || '(无)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })