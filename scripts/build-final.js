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

  console.log('==== 检查构建状态 ====')
  let r = await run('docker ps -a --filter name=zscx 2>&1')
  console.log('容器:', r.out)

  // 清理所有旧容器和镜像
  r = await run('docker rm -f $(docker ps -aq --filter name=zscx) 2>/dev/null; echo done')
  console.log('清理容器:', r.out.trim())

  r = await run('docker rmi -f zscx-web:local 2>&1')
  console.log('删除旧镜像:', r.out || r.errOut || 'done')

  r = await run('docker images zscx-web:local 2>&1')
  console.log('镜像:', r.out)

  r = await run('cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web 2>&1', 900000)
  console.log('构建结果:', r.out.substring(r.out.length - 1000))

  // 启动
  console.log('\n==== 启动容器 ====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  r = await run('docker ps --filter name=zscx')
  console.log('容器状态:', r.out)

  r = await run('curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  r = await run('curl -s http://localhost:3000/login | grep -o "飞书" 2>&1')
  console.log('登录页面含飞书:', r.out)

  c.end()
})