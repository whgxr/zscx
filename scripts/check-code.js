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

  // 1. 检查 .env.example
  console.log('==== 1. 检查 .env ====')
  let r = await run('cat /vol2/1000/docker/zscx/.env.example 2>&1')
  console.log('.env.example:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/.env* 2>&1')
  console.log('env 文件:', r.out)

  r = await run('cat /vol2/1000/docker/zscx/web/.env 2>&1')
  console.log('web/.env:', r.out)

  // 2. 检查 web 目录结构
  console.log('\n==== 2. web 目录 ====')
  r = await run('ls /vol2/1000/docker/zscx/web/')
  console.log(r.out)

  // 3. 检查是否有 app/api/auth/third-party 目录
  console.log('\n==== 3. 检查 API 路由 ====')
  r = await run('ls -la /vol2/1000/docker/zscx/web/app/api/auth/third-party/ 2>&1')
  console.log(r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/app/api/auth/third-party/platforms/ 2>&1')
  console.log('platforms:', r.out)

  // 4. 检查登录页面
  console.log('\n==== 4. 检查登录页面 ====')
  r = await run('grep -c "feishu\|FEISHU\|飞书" /vol2/1000/docker/zscx/web/app/login/page.tsx 2>&1')
  console.log('登录页面包含飞书:', r.out)

  // 5. 检查 Dockerfile
  console.log('\n==== 5. Dockerfile ====')
  r = await run('cat /vol2/1000/docker/zscx/web/Dockerfile')
  console.log(r.out)

  c.end()
})