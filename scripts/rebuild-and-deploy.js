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

  // 1. 停掉旧容器
  console.log('==== 1. 停掉容器 ====')
  let r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml down 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 2. 删除旧镜像
  console.log('\n==== 2. 删除旧镜像 ====')
  r = await run('docker rmi zscx-web:local 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 3. 重新构建
  console.log('\n==== 3. 构建新镜像（请等待 5-10 分钟）====')
  r = await run('cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web 2>&1', 900000)
  // 只显示最后20行
  const lines = r.out.split('\n')
  console.log('最终输出行数:', lines.length)
  console.log('最后20行:')
  console.log(lines.slice(-20).join('\n'))

  // 4. 启动
  console.log('\n==== 4. 启动容器 ====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  // 5. 状态
  console.log('\n==== 5. 容器状态 ====')
  r = await run('docker ps --filter name=zscx')
  console.log(r.out)

  // 6. 测试 API
  console.log('\n==== 6. 测试 API ====')
  r = await run('curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  // 7. 检查登录页面（通过 curl 获取 HTML）
  console.log('\n==== 7. 检查登录页面 ====')
  r = await run('curl -s http://localhost:3000/login 2>&1')
  console.log('页面长度:', r.out.length, '字符')
  if (r.out.includes('飞书') || r.out.includes('feishu')) {
    console.log('✓ 登录页面包含飞书登录按钮！')
  } else {
    console.log('✗ 登录页面未包含飞书')
    // 看看页面内容
    console.log('页面内容前 500 字符:', r.out.substring(0, 500))
  }

  c.end()
})