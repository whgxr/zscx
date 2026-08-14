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
    console.log('==== 1. 容器状态（是否稳定运行）====')
    let r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 外部端口 777 响应 ====')
    r = await run(c, 'curl -s -o /dev/null -w "HTTP %{http_code} (${size_download} bytes)" http://localhost:777/login 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 3. 登录 API（外部端口）====')
    r = await run(c, 'curl -s -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\"}" 2>&1 | head -c 200')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 最近容器日志（有无报错）====')
    r = await run(c, 'docker logs --tail 15 zscx-web 2>&1 | grep -iE "error|fail|exception|ready"')
    console.log(r.out || '(无错误)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })