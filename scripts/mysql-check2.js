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

  // 查看当前状态
  console.log('==== 当前状态 ====')
  let r = await run('docker ps -a 2>&1')
  console.log(r.out)

  // 查看旧的 recovery 容器是否还在
  r = await run('docker ps -a --filter name=zscx-mysql 2>&1')
  console.log('zscx-mysql:', r.out)

  // 如果 recovery 容器不存在，就用 recovery 参数重新启动
  r = await run('docker ps -a --filter name=zscx-mysql-recovery 2>&1')
  console.log('zscx-mysql-recovery:', r.out)

  // 尝试启动 recovery 模式容器来导出数据
  // 先停掉可能存在的 zscx-mysql-recovery
  r = await run('docker rm -f zscx-mysql-recovery zscx-mysql 2>/dev/null; echo done')
  console.log('\n清理:', r.out.trim())

  // 启动 recovery 模式（使用现有卷）
  console.log('\n==== 启动 recovery 模式容器 ====')
  r = await run('docker run -d --name zscx-mysql-recovery -e MYSQL_ROOT_PASSWORD=root123456 -e MYSQL_DATABASE=zscx -e MYSQL_USER=zscx -e MYSQL_PASSWORD=zscx123456 -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 --innodb-force-recovery=4 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  r = await run('docker ps -a --filter name=zscx-mysql-recovery')
  console.log('\n状态:', r.out)

  r = await run('docker logs --tail 15 zscx-mysql-recovery 2>&1')
  console.log('日志:', r.out)

  c.end()
})
