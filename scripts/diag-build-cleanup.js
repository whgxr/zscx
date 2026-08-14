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
    console.log('==== 1. 残留构建进程 ====')
    let r = await run(c, 'ps aux | grep -E "docker build|buildx|npm ci|npm install|node-pre-gyp" | grep -v grep')
    console.log(r.out || '(无残留进程)')

    console.log('\n==== 2. 镜像列表 ====')
    r = await run(c, 'docker images | grep zscx')
    console.log(r.out || '(无)')

    console.log('\n==== 3. 容器状态 ====')
    r = await run(c, 'docker ps -a --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })