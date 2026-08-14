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

  // 检查 MySQL 状态
  let r = await run('docker ps -a --filter name=zscx')
  console.log('状态:', r.out)

  r = await run('docker logs --tail 50 zscx-mysql-init 2>&1')
  console.log('\n日志:', r.out)

  c.end()
})
