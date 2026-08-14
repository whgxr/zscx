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

  // 查看完整日志
  console.log('==== MySQL 完整启动日志 ====')
  let r = await run('docker logs zscx-mysql 2>&1 | head -60')
  console.log(r.out)

  // 检查卷
  console.log('\n==== mysql_data 卷 ====')
  r = await run('docker volume inspect mysql_data 2>&1')
  console.log(r.out)

  r = await run('docker run --rm -v mysql_data:/data alpine ls /data/')
  console.log('内容:', r.out)

  c.end()
})
