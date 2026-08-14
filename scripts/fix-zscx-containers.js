const { Client } = require('ssh2')
const c = new Client()

const run = (conn, cmd) => new Promise((res, rej) => {
  conn.exec(cmd, (err, s) => {
    if (err) return rej(err)
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => res({ out, errOut, code: s.exitCode }))
  })
})

c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 当前所有容器 ====')
    let r = await run(c, 'docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 2. 停止并删除旧 zscx 容器与残留容器 ====')
    r = await run(c, 'docker rm -f zscx-web zscx-mysql 2>&1; docker ps -aq --filter "name=zscx" | xargs -r docker rm -f 2>&1')
    console.log(r.out || r.errOut || 'done')

    console.log('\n==== 3. 重新启动 docker-nas compose ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose up -d')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 等待容器启动 ====')
    await new Promise(res => setTimeout(res, 45000))

    console.log('\n==== 5. 容器状态 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 6. web 容器最近日志 ====')
    r = await run(c, 'docker logs --tail 60 zscx-web 2>&1')
    console.log(r.out || r.errOut || '(无日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally {
    c.end()
  }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })