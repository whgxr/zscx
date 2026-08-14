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
    console.log('==== 1. 杀掉残留构建进程 ====')
    let r = await run(c, "ps aux | grep -E 'docker build|buildx build|npm ci|npm install|node-pre-gyp' | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>&1; echo done")
    console.log(r.out || 'done')

    await new Promise(res => setTimeout(res, 3000))

    console.log('\n==== 2. 确认已清理 ====')
    r = await run(c, 'ps aux | grep -E "docker build|buildx build|npm ci|npm install|node-pre-gyp" | grep -v grep || echo "已全部清理"')
    console.log(r.out)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })