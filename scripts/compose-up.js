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

  // 1. 进入项目目录并启动 docker-compose
  console.log('==== 启动 docker-compose ====')
  let r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  // 2. 等待 MySQL 就绪
  console.log('\n等待 MySQL 启动...')
  await new Promise(res => setTimeout(res, 20000))

  // 3. 检查容器状态
  console.log('\n==== 容器状态 ====')
  r = await run('docker ps -a --filter name=zscx')
  console.log(r.out)

  // 4. 检查 MySQL 日志
  console.log('\n==== MySQL 日志 ====')
  r = await run('docker logs --tail 10 zscx-mysql 2>&1')
  console.log(r.out)

  c.end()
})
