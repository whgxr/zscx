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
    console.log('==== 服务器 .env 内容 ====')
    let r = await run(c, 'cat /vol2/1000/docker/zscx/docker-nas/.env 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== redis 相关容器 ====')
    r = await run(c, 'docker ps -a --filter name=redis --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || '(无 redis 容器)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })