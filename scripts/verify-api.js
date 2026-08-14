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

  // 1. 测试 API 端点
  console.log('==== 1. 测试 API 端点 ====')
  let r = await run('curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  // 2. 检查容器内是否有 platforms API 文件
  console.log('\n==== 2. 检查容器内 API 文件 ====')
  r = await run('docker exec zscx-web ls -la /app/app/api/auth/third-party/ 2>&1')
  console.log('third-party 目录:', r.out)

  r = await run('docker exec zscx-web ls -la /app/app/api/auth/third-party/platforms/ 2>&1')
  console.log('platforms 目录:', r.out)

  // 3. 检查容器内是否存在 .env 文件
  console.log('\n==== 3. 检查 .env ====')
  r = await run('docker exec zscx-web cat /app/.env 2>&1')
  console.log('.env:', r.out)

  r = await run('docker exec zscx-web printenv DATABASE_URL 2>&1')
  console.log('DATABASE_URL env:', r.out)

  // 4. 检查登录页面是否包含飞书
  console.log('\n==== 4. 检查登录页面 ====')
  r = await run('curl -s http://localhost:3000/login 2>&1')
  console.log('登录页面长度:', r.out.length, '字符')
  if (r.out.includes('feishu') || r.out.includes('飞书') || r.out.includes('FEISHU')) {
    console.log('✓ 登录页面包含飞书相关内容')
  } else {
    console.log('✗ 登录页面未包含飞书相关内容')
  }

  // 5. 检查容器内的代码版本
  console.log('\n==== 5. 检查容器内版本 ====')
  r = await run('docker exec zscx-web cat /app/package.json 2>&1')
  console.log(r.out)

  // 检查是否有 platforms 路由代码
  r = await run('docker exec zscx-web ls -la /app/app/api/auth/ 2>&1')
  console.log('\nauth 目录:', r.out)

  c.end()
})