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

  // 1. 杀掉卡住的构建进程
  console.log('==== 1. 杀掉卡住的构建进程 ====')
  let r = await run('kill $(ps aux | grep "docker build" | grep -v grep | awk "{print \$2}") 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 检查文件是否真的上传成功
  console.log('\n==== 2. 检查文件上传 ====')
  r = await run('head -20 /vol2/1000/docker/zscx/web/app/login/page.tsx')
  console.log('page.tsx head:', r.out)

  // 3. 如果文件没上传成功，重新上传
  console.log('\n==== 3. 检查登录页面是否有飞书内容 ====')
  r = await run('grep -n "feishu\|FEISHU\|飞书\|thirdParty\|loginPlatforms" /vol2/1000/docker/zscx/web/app/login/page.tsx 2>&1')
  console.log(r.out)

  if (!r.out.includes('feishu') && !r.out.includes('飞书')) {
    console.log('文件未上传成功，需要重新上传')
  }

  // 4. 检查已有的镜像
  console.log('\n==== 4. 检查镜像 ====')
  r = await run('docker images zscx-web:local')
  console.log(r.out)

  // 5. 启动容器
  console.log('\n==== 5. 启动容器 ====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  // 6. 检查状态
  console.log('\n==== 6. 容器状态 ====')
  r = await run('docker ps --filter name=zscx')
  console.log(r.out)

  // 7. 测试 API
  console.log('\n==== 7. 测试 API ====')
  r = await run('curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  // 8. 检查登录页面
  r = await run('curl -s http://localhost:3000/login 2>&1 | head -100')
  console.log('登录页面:', r.out.substring(0, 500))

  c.end()
})