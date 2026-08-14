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

  // 1. 检查进程
  let r = await run('docker exec zscx-web ps aux 2>&1')
  console.log('==== 进程 ====')
  console.log(r.out || r.errOut)

  // 2. 完整日志
  r = await run('docker logs --tail 60 zscx-web 2>&1')
  console.log('\n==== 完整日志 ====')
  console.log(r.out)

  // 3. 检查 .env 文件
  r = await run('docker exec zscx-web cat /app/.env 2>&1')
  console.log('\n==== .env ====')
  console.log(r.out || r.errOut)

  // 4. 测试 API
  r = await run('wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO_RESPONSE')
  console.log('\n==== API 测试 ====')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
