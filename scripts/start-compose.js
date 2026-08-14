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

  // 1. 停掉 init 容器
  console.log('==== 停掉 init 容器 ====')
  let r = await run('docker rm -f zscx-mysql-init 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 用 compose 启动 MySQL 和 web
  console.log('\n==== docker compose up ====')
  r = await run('cd /vol2/1000/docker/zscx/docker && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 3. 等待启动
  console.log('\n==== 等待 30s ====')
  await new Promise(res => setTimeout(res, 30000))

  // 4. 状态
  console.log('\n==== 状态 ====')
  r = await run('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 5. MySQL 日志
  r = await run('docker logs --tail 10 zscx-mysql 2>&1')
  console.log('\n==== MySQL 日志 ====')
  console.log(r.out)

  // 6. Web 日志
  r = await run('docker logs --tail 20 zscx-web 2>&1')
  console.log('\n==== Web 日志 ====')
  console.log(r.out)

  // 7. 验证 API
  console.log('\n==== API 验证 ====')
  r = await run('docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('容器内 API:', r.out || r.errOut)

  r = await run('wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('宿主机 API:', r.out || r.errOut)

  c.end()
})
