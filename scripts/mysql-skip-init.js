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

  // 清理
  console.log('==== 清理 ====')
  let r = await run('docker rm -f zscx-mysql-recovery zscx-mysql 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 使用 MYSQL_INITDB_SKIP_PASSWORD 跳过初始化
  console.log('\n==== 启动 MySQL（跳过初始化）====')
  r = await run('docker run -d --name zscx-mysql-recovery -e MYSQL_INITDB_SKIP_PASSWORD=1 -e MYSQL_ROOT_PASSWORD=root123456 -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 --innodb-force-recovery=4 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  r = await run('docker ps -a --filter name=zscx-mysql-recovery')
  console.log('\n状态:', r.out)

  // 试试能否连接
  r = await run('docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('\n连通性:', r.out || r.errOut)

  c.end()
})
