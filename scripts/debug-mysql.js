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

  // 查看完整 MySQL 日志
  console.log('==== MySQL 完整日志 ====')
  let r = await run('docker logs zscx-mysql 2>&1 | tail -50')
  console.log(r.out)

  // 查看 my.cnf 配置
  console.log('\n==== my.cnf ====')
  r = await run('cat /vol2/1000/docker/zscx/docker/mysql/my.cnf 2>&1')
  console.log(r.out)

  // 检查卷中的权限
  console.log('\n==== mysql_data 权限 ====')
  r = await run('docker run --rm -v mysql_data:/data alpine ls -la /data/')
  console.log(r.out)

  c.end()
})
