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

  // 仔细检查 .next 目录
  let r = await run('docker exec zscx-web ls -la /app/.next/server/app/api/auth/ 2>&1')
  console.log('==== .next/server/app/api/auth ====')
  console.log(r.out || r.errOut)

  r = await run('docker exec zscx-web find /app/.next -path "*third-party*" 2>&1')
  console.log('\n==== 查找 third-party ====')
  console.log(r.out || r.errOut)

  r = await run('docker exec zscx-web find /app/.next -path "*platform*" 2>&1')
  console.log('\n==== 查找 platform ====')
  console.log(r.out || r.errOut)

  // 查看编译后的 auth 下的路由列表
  r = await run('docker exec zscx-web find /app/.next/server/app/api/auth -name "*.js" 2>&1')
  console.log('\n==== auth 下的所有 js ====')
  console.log(r.out || r.errOut)

  // 查找 FEISHU / WEWORK
  r = await run('docker exec zscx-web find /app/.next -path "*feishu*" -o -path "*wework*" 2>&1 | head -10')
  console.log('\n==== feishu/wework ====')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
