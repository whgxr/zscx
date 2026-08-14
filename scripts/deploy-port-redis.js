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
const upload = (conn, local, remote) => new Promise((res, rej) => {
  conn.sftp((err, sftp) => {
    if (err) return rej(err)
    sftp.fastPut(local, remote, (e) => e ? rej(e) : res())
  })
})
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 修改服务器 .env：WEB_PORT=777 ====')
    let r = await run(c, `sed -i 's/^WEB_PORT=.*/WEB_PORT=777/' /vol2/1000/docker/zscx/docker-nas/.env && grep WEB_PORT /vol2/1000/docker/zscx/docker-nas/.env`)
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 上传含 redis 的 compose ====')
    await upload(c, 'D:/开发征收项目/zscx/docker-nas/docker-compose.yml', '/vol2/1000/docker/zscx/docker-nas/docker-compose.yml')
    console.log('已上传')

    console.log('\n==== 3. 确认 compose 解析 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose config 2>&1 | grep -E "image:|WEB_PORT|REDIS_URL" | head -10')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 重建并启动 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose up -d 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 5. 等 45s ====')
    await new Promise(res => setTimeout(res, 45000))

    console.log('\n==== 6. 容器状态 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 7. 端口映射 ====')
    r = await run(c, 'docker port zscx-web 2>&1; echo "---"; docker port zscx-redis 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 8. 验证 777 端口 ====')
    r = await run(c, 'curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:777/login 2>&1')
    console.log(r.out)

    console.log('\n==== 9. web 日志（redis 连接）====')
    r = await run(c, 'docker logs --tail 30 zscx-web 2>&1 | grep -iE "redis|ready|error"')
    console.log(r.out || '(无 redis 相关日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })