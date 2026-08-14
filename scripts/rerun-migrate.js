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
    console.log('==== 手动重跑迁移（连接真实 DB，捕获完整输出）====')
    let r = await run(c, `docker run --rm --network docker-nas_default -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" --entrypoint sh zscx-web:local -c "node prisma/docker-migrate.js"`)
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })