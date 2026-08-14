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
    console.log('==== 1. docker 构建进程状态 ====')
    let r = await run(c, 'docker ps -a --filter name=zscx --format "{{.Names}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 构建中的 node_modules 大小（判断 npm 是否在复制）====')
    r = await run(c, 'du -sh /vol2/1000/docker/zscx/web/node_modules 2>/dev/null || echo "无 node_modules"')
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 是否有 docker build via buildkit 卡住 ====')
    r = await run(c, 'ps aux | grep -E "docker|npm|node" | grep -v grep | head -20')
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })