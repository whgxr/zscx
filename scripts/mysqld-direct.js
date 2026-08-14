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

  // 直接用 mysqld 启动（绕过 entrypoint）
  console.log('\n==== 直接启动 mysqld（recovery 模式）====')
  r = await run('docker run -d --name zscx-mysql-recovery -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 mysqld --user=mysql --datadir=/var/lib/mysql --port=3306 --innodb-force-recovery=4 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  r = await run('docker ps -a --filter name=zscx-mysql-recovery')
  console.log('\n状态:', r.out)

  // 连接测试
  r = await run('docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('\n连通性:', r.out || r.errOut)

  // 如果连通，导出 dump
  if (r.out.includes('1')) {
    console.log('\n==== 导出 dump ====')
    r = await run('docker exec zscx-mysql-recovery mysqldump -uroot -proot123456 --single-transaction zscx > /tmp/zscx-dump3.sql 2>&1')
    console.log(r.out || r.errOut || 'done')

    r = await run('ls -lh /tmp/zscx-dump3.sql')
    console.log('dump 文件:', r.out)
  }

  c.end()
})
