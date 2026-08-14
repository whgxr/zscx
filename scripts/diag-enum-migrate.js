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
    console.log('==== 1. DB 中 TableField.type 枚举值 ====')
    let r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -proot123456 zscx -e "SHOW COLUMNS FROM TableField LIKE \"type\";"'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 镜像内 docker-migrate.js 是否含 LEVY_RELATION 枚举修复 ====')
    r = await run(c, `docker run --rm --entrypoint sh zscx-web:local -c "grep -n \\"LEVY_RELATION\\" prisma/docker-migrate.js | head -20"`)
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 镜像内 step39 区块内容 ====')
    r = await run(c, `docker run --rm --entrypoint sh zscx-web:local -c "sed -n '530,582p' prisma/docker-migrate.js"`)
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })