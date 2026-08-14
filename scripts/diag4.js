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

  // 查看容器中的 /app 结构
  let r = await run('docker exec zscx-web ls -la /app/ 2>&1')
  console.log('==== /app 根目录 ====')
  console.log(r.out || r.errOut)

  // 查看 app 目录
  r = await run('docker exec zscx-web ls -la /app/app/ 2>&1')
  console.log('\n==== /app/app ====')
  console.log(r.out || r.errOut)

  // 查看 app/api 目录
  r = await run('docker exec zscx-web ls -la /app/app/api/ 2>&1')
  console.log('\n==== /app/app/api ====')
  console.log(r.out || r.errOut)

  // 查看 auth 目录
  r = await run('docker exec zscx-web ls -la /app/app/api/auth/ 2>&1')
  console.log('\n==== /app/app/api/auth ====')
  console.log(r.out || r.errOut)

  // 查看登录页面目录
  r = await run('docker exec zscx-web ls -la /app/app/login/ 2>&1')
  console.log('\n==== /app/app/login ====')
  console.log(r.out || r.errOut)

  // 查看 lib 目录
  r = await run('docker exec zscx-web ls -la /app/lib/ 2>&1')
  console.log('\n==== /app/lib ====')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
