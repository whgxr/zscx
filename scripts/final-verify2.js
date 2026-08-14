const { Client } = require('ssh2')
const c = new Client()
const run = (conn, cmd) => new Promise((res, rej) => {
  conn.exec(cmd, (err, s) => {
    if (err) return rej(err)
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => res({ out, errOut }))
  })
})
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 实际端口映射 ====')
    let r = await run(c, 'docker port zscx-web 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 测试 3000 端口 ====')
    r = await run(c, 'curl -s -o /dev/null -w "HTTP %{http_code} (%{size_download} bytes)" http://localhost:3000/login 2>&1')
    console.log(r.out)

    console.log('\n==== 3. 登录 API ====')
    r = await run(c, 'curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\"}" 2>&1 | head -c 200')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 同步 API 测试（调查表 household 的某条记录触发同步）====')
    r = await run(c, 'curl -s -X POST http://localhost:3000/api/sync-requests -H "Content-Type: application/json" -H "Authorization: Bearer $(curl -s -X POST http://localhost:3000/api/auth/login -H \\"Content-Type: application/json\\" -d \\"{\\\\\\"username\\\\\\":\\\\\\"admin\\\\\\",\\\\\\"password\\\\\\":\\\\\\"admin123\\\\\\"}\\" | python3 -c \\"import sys,json;print(json.load(sys.stdin).get(\\\\\\"token\\\\\\",\\\\\\"\\\\\\"))"
 2>&1 | head -c 300')
    console.log(r.out || r.errOut)
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })