const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', async () => {
  const run = (cmd) => new Promise((res, rej) => {
    c.exec(cmd, (err, s) => {
      if (err) return rej(err)
      let out = '', errOut = ''
      s.on('data', d => out += d.toString())
      s.stderr.on('data', d => errOut += d.toString())
      s.on('close', () => res({ out, errOut }))
    })
  })

  // 查看容器里的 docker-migrate.js 是否是新版本
  let r = await run('docker exec zscx-web grep -A3 "^main" /app/prisma/docker-migrate.js 2>&1')
  console.log('==== 容器中的 docker-migrate.js 末尾 ====')
  console.log(r.out || r.errOut)

  // 查看 CMD
  r = await run('docker inspect zscx-web --format "{{json .Config.Cmd}}" 2>&1')
  console.log('\n==== 容器 CMD ====')
  console.log(r.out || r.errOut)

  // 检查当前运行的进程
  r = await run('docker exec zscx-web ps aux 2>&1')
  console.log('\n==== 容器进程 ====')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
