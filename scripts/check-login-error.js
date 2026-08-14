const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 })
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

  // 先测试登录，然后立即查看日志
  console.log('==== 测试登录，然后查看日志 ====')
  let r = await run('docker exec zscx-web sh -c "node -e \'const h=require(\\\"http\\\");const d=JSON.stringify({username:\\\"admin\\\",password:\\\"admin123\\\"});const r=h.request(\\\"http://localhost:3000/api/auth/login\\\",{method:\\\"POST\\\",headers:{\\\"Content-Type\\\":\\\"application/json\\\",\\\"Content-Length\\\":Buffer.byteLength(d)}},s=>{let b=\\\"\\\";s.on(\\\"data\\\",c=>b+=c);s.on(\\\"end\\\",()=>console.log(s.statusCode,b))});r.write(d);r.end()\'" 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n==== 查看最近日志 ====')
  r = await run('docker logs --tail 20 zscx-web 2>&1')
  console.log(r.out || r.errOut)

  c.end()
})