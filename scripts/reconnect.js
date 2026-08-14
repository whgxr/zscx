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

  // 等待更长时间
  console.log('等待 20s 让 MySQL 完全启动...')
  await new Promise(res => setTimeout(res, 20000))

  // 查看日志
  console.log('==== 日志 ====')
  let r = await run('docker logs --tail 20 zscx-mysql-init 2>&1')
  console.log(r.out)

  // 尝试连接
  console.log('\n==== 尝试连接 ====')
  r = await run('docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log(r.out || r.errOut)

  // 试试 TCP
  r = await run('docker exec zscx-mysql-init mysql -h 127.0.0.1 -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('TCP:', r.out || r.errOut)

  c.end()
})
