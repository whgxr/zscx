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
  let r = await run('docker rm -f zscx-mysql zscx-web 2>/dev/null; echo done')
  console.log('清理:', r.out.trim())

  // 创建网络
  r = await run('docker network create zscx_default 2>/dev/null; echo done')
  console.log('网络:', r.out.trim())

  // 启动带 recovery 的 MySQL
  r = await run('docker run -d --name zscx-mysql -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql --network zscx_default --network-alias mysql --health-cmd="mysqladmin ping -h localhost -uroot -proot123456" --health-interval=10s --health-timeout=5s --health-retries=5 -p 3306:3306 mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max-connections=1000 --explicit_defaults_for_timestamp=true --innodb-force-recovery=4 2>&1')
  console.log('启动 recovery:', r.out || r.errOut)

  await new Promise(res => setTimeout(res, 15000))

  // 检查状态
  r = await run('docker ps -a --filter name=zscx')
  console.log('\n状态:', r.out)

  // 日志
  r = await run('docker logs --tail 30 zscx-mysql 2>&1')
  console.log('\n日志:', r.out)

  // 如果 MySQL 启动了，尝试导出数据
  r = await run('docker exec zscx-mysql mysql -uroot -proot123456 -e "SHOW DATABASES;" 2>&1')
  console.log('\n数据库列表:', r.out || r.errOut)

  c.end()
})
