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

  // 查看服务器上 web 源目录的内容
  let r = await run('ls /vol2/1000/docker/zscx/web/app/api/auth/ 2>&1')
  console.log('==== 服务器源码 auth 目录 ====')
  console.log(r.out || r.errOut)

  r = await run('find /vol2/1000/docker/zscx/web/app/api/third-party -name "*.ts" 2>&1')
  console.log('\n==== 服务器 third-party ====')
  console.log(r.out || r.errOut)

  r = await run('find /vol2/1000/docker/zscx/web/app/api/auth -name "*.ts" 2>&1')
  console.log('\n==== 服务器 auth API ====')
  console.log(r.out || r.errOut)

  r = await run('ls /vol2/1000/docker/zscx/web/lib/prisma.ts 2>&1')
  console.log('\n==== 服务器 lib/prisma.ts ====')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
