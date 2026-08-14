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
    console.log('==== 1. override 文件是否存在及内容 ====')
    let r = await run(c, 'ls -la /vol2/1000/docker/zscx/docker-nas/*.yml; echo "---"; cat /vol2/1000/docker/zscx/docker-nas/docker-compose.override.yml 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. compose 解析出的 web 镜像 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose config 2>&1 | grep -A3 "web:" | head -20')
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })