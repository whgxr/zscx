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

  // 使用 my.cnf 的路径 + compose 的参数启动 MySQL 看是否有问题
  // 先用 recovery mode 启动 compose 的 MySQL
  console.log('==== 用 recovery 模式启动 MySQL ====')
  let r = await run('docker run -d --name zscx-mysql -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql -v /vol2/1000/docker/zscx/docker/mysql/my.cnf:/etc/mysql/conf.d/my.cnf:ro --network zscx_default --network-alias mysql --health-cmd="mysqladmin ping -h localhost -uroot -proot123456" --health-interval=10s --health-timeout=5s --health-retries=5 -p 3306:3306 mysql:5.7 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --max-connections=1000 --explicit_defaults_for_timestamp=true --innodb-force-recovery=4 2>&1')
  console.log(r.out || r.errOut)

  await new Promise(res => setTimeout(res, 15000))

  r = await run('docker ps -a --filter name=zscx-mysql')
  console.log('状态:', r.out)

  r = await run('docker logs --tail 20 zscx-mysql 2>&1')
  console.log('日志:', r.out)

  // 试试能否连通
  r = await run('docker exec zscx-mysql mysql -uroot -proot123456 -e "SHOW DATABASES;" 2>&1')
  console.log('\n数据库列表:', r.out || r.errOut)

  // 如果 recovery 模式能跑，dump 数据，重建卷
  c.end()
})
