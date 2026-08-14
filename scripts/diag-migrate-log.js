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
    console.log('==== 1. 镜像 docker-migrate.js 中 Role INSERT 是否含 updatedAt ====')
    // 从镜像中提取 docker-migrate.js 检查（用 docker create + cp 或直接 cat 运行容器内文件）
    let r = await run(c, `docker run --rm zscx-web:local sh -c 'grep -n "INSERT INTO \\\\\`Role\\\\\`" prisma/docker-migrate.js 2>/dev/null || echo "无法读取" ; echo "---updatedAt计数---" ; grep -c "updatedAt" prisma/docker-migrate.js 2>/dev/null'`)
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 完整迁移日志（最近一次完整运行开头）====')
    r = await run(c, 'docker logs zscx-web 2>&1 | head -80')
    console.log(r.out || '(无日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })