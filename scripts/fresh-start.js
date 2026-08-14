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

  // 1. 停掉所有容器
  console.log('==== 停掉容器 ====')
  let r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml down 2>&1')
  console.log(r.out || r.errOut)

  // 2. 删除卷
  console.log('\n==== 删除 mysql_data 卷 ====')
  r = await run('docker volume rm mysql_data 2>&1')
  console.log(r.out || r.errOut)

  // 3. 重新启动（会创建新卷并初始化）
  console.log('\n==== 重新启动（新卷）====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  // 4. 等待 MySQL 启动
  console.log('\n等待 MySQL 启动...')
  await new Promise(res => setTimeout(res, 30000))

  // 5. 检查状态
  console.log('\n==== 容器状态 ====')
  r = await run('docker ps --filter name=zscx')
  console.log(r.out)

  r = await run('docker logs --tail 15 zscx-mysql 2>&1')
  console.log('\nMySQL 日志:', r.out)

  c.end()
})
