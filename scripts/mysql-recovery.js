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

  // 查看 mysql 数据卷
  let r = await run('docker volume inspect zscx_mysql_data 2>&1')
  console.log('==== 数据卷信息 ====')
  console.log(r.out)

  // 检查数据目录
  r = await run('docker run --rm -v zscx_mysql_data:/data mysql:5.7 ls /data/mysql 2>&1 | head -30')
  console.log('\n==== MySQL 数据文件 ====')
  console.log(r.out || r.errOut)

  // 尝试启动 MySQL，开启 innodb_force_recovery
  r = await run('docker run -d --name zscx-mysql -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max-connections=1000 --explicit_defaults_for_timestamp=true --innodb-force-recovery=4 2>&1')
  console.log('\n==== 带 recovery 参数启动 MySQL ====')
  console.log(r.out || r.errOut)

  // 等待
  await new Promise(res => setTimeout(res, 15000))

  // 查看日志
  r = await run('docker logs --tail 30 zscx-mysql 2>&1')
  console.log('\n==== Recovery 日志 ====')
  console.log(r.out)

  c.end()
})
