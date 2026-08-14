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

  // 检查服务器上已有的文件
  console.log('==== 检查服务器文件 ====')
  let r = await run('ls -la /vol2/1000/docker/zscx/web/lib/feishu* 2>&1')
  console.log('lib/feishu:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/lib/integration-service* 2>&1')
  console.log('lib/integration-service:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/lib/prisma* 2>&1')
  console.log('lib/prisma:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/app/api/auth/third-party/feishu/ 2>&1')
  console.log('feishu 路由:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/app/api/auth/third-party/feishu/callback/ 2>&1')
  console.log('feishu callback:', r.out)

  r = await run('ls -la /vol2/1000/docker/zscx/web/app/api/auth/third-party/\\[platform\\]/ 2>&1')
  console.log('[platform] 路由:', r.out)

  // 检查是否需要补充 NEXT_PUBLIC_BASE_URL
  console.log('\n==== 检查 NEXT_PUBLIC_BASE_URL ====')
  r = await run('grep -n "NEXT_PUBLIC_BASE_URL" /vol2/1000/docker/zscx/docker/docker-compose.yml 2>&1')
  console.log(r.out)

  c.end()
})