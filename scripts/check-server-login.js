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

  // 检查服务器上的登录页面是否包含飞书代码
  console.log('==== 检查服务器登录页面 ====')
  let r = await run('grep -n "feishu\|FEISHU\|飞书\|thirdParty\|third-party\|platforms\|loginPlatforms" /vol2/1000/docker/zscx/web/app/login/page.tsx 2>&1')
  console.log(r.out)

  // 检查 platforms API 内容
  console.log('\n==== platforms API 内容 ====')
  r = await run('cat /vol2/1000/docker/zscx/web/app/api/auth/third-party/platforms/route.ts')
  console.log(r.out)

  // 检查服务器上的 docker-compose.yml
  console.log('\n==== docker-compose.yml ====')
  r = await run('cat /vol2/1000/docker/zscx/docker/docker-compose.yml')
  console.log(r.out)

  c.end()
})