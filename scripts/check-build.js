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

  // 检查 Docker 构建状态
  console.log('==== Docker 状态 ====')
  let r = await run('docker images --filter reference=zscx-web:local')
  console.log('zscx-web:local 镜像:', r.out)

  r = await run('docker ps -a --filter name=zscx')
  console.log('zscx 容器:', r.out)

  // 检查是否有构建进程在运行
  r = await run('ps aux | grep "docker build" | grep -v grep')
  console.log('构建进程:', r.out || '无')

  // 检查 web 目录文件
  console.log('\n==== 检查文件是否同步 ====')
  r = await run('grep -c "feishu\|FEISHU\|飞书" /vol2/1000/docker/zscx/web/app/login/page.tsx 2>&1')
  console.log('登录页面包含飞书:', r.out)

  r = await run('cat /vol2/1000/docker/zscx/docker/docker-compose.yml | head -40')
  console.log('docker-compose.yml:', r.out)

  c.end()
})