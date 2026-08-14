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

  // 检查构建进程
  console.log('==== 构建进程 ====')
  let r = await run('ps aux | grep "docker build" | grep -v grep')
  console.log(r.out || '无')
  console.log('数量:', r.out ? r.out.split('\n').length - 1 : 0)

  // 构建过程 - 使用 --progress=plain 来显示详细输出
  console.log('\n==== 开始构建（显示详细输出）====')
  r = await run('cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web --progress=plain 2>&1', 900000)
  // 显示最后100行
  const lines = r.out.split('\n')
  console.log('总行数:', lines.length)
  console.log('最后100行:')
  console.log(lines.slice(-100).join('\n'))

  // 如果构建成功，启动容器
  if (r.out.includes('Successfully built') || r.out.includes('Successfully tagged')) {
    console.log('\n==== 构建成功！启动容器 ====')
    r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
    console.log(r.out || r.errOut)

    console.log('等待 30s...')
    await new Promise(res => setTimeout(res, 30000))

    r = await run('docker ps --filter name=zscx')
    console.log('容器状态:', r.out)

    r = await run('curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
    console.log('Platforms API:', r.out)

    r = await run('curl -s http://localhost:3000/login 2>&1')
    if (r.out.includes('飞书') || r.out.includes('feishu')) {
      console.log('✓ 登录页面包含飞书登录按钮！')
    } else {
      console.log('✗ 登录页面未包含飞书')
    }
  }

  c.end()
})