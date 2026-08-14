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

  // 查看 .next 目录中是否有 platforms 路由
  let r = await run('docker exec zscx-web find /app/.next -name "*platform*" 2>&1')
  console.log('==== .next 中的 platforms 文件 ====')
  console.log(r.out || r.errOut)

  // 查看源文件
  r = await run('docker exec zscx-web ls -la /app/app/api/auth/third-party/platforms/ 2>&1')
  console.log('\n==== 源文件 ====')
  console.log(r.out || r.errOut)

  // 查看编译后的路由列表
  r = await run('docker exec zscx-web find /app/.next/server/app/api -name "*.js" 2>&1 | head -20')
  console.log('\n==== 已编译的 API 路由 ====')
  console.log(r.out || r.errOut)

  // 检查 app 目录
  r = await run('docker exec zscx-web ls /app/app/api/auth/ 2>&1')
  console.log('\n==== auth 目录 ====')
  console.log(r.out || r.errOut)

  // 检查 lib/prisma.ts 是否存在
  r = await run('docker exec zscx-web cat /app/lib/prisma.ts 2>&1 | head -5')
  console.log('\n==== lib/prisma.ts ====')
  console.log(r.out || r.errOut)

  // 测试登录页面
  r = await run('docker exec zscx-web wget -qO- http://localhost:3000/login 2>&1 | head -100')
  console.log('\n==== /login 页面（前100字符）====')
  console.log(r.out.slice(0, 200) || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
