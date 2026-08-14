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

  // MySQL 日志
  let r = await run('docker logs --tail 50 zscx-mysql 2>&1')
  console.log('==== MySQL 日志 ====')
  console.log(r.out)

  // 清理 zscx-temp
  r = await run('docker rm -f zscx-temp 2>/dev/null; echo done')
  console.log('\n==== 清理 temp ====')
  console.log(r.out.trim())

  c.end()
})
