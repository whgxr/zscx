const { Client } = require('ssh2')
const fs = require('fs')
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
    console.log('==== 1. 上传修正后的 docker-compose.yml ====')
    await upload(c, 'D:/开发征收项目/zscx/docker-nas/docker-compose.yml', '/vol2/1000/docker/zscx/docker-nas/docker-compose.yml')
    console.log('已上传')

    console.log('\n==== 2. 删除可能存在的旧 override ====')
    let r = await run(c, 'rm -f /vol2/1000/docker/zscx/docker-nas/docker-compose.override.yml; echo done')
    console.log(r.out)

    console.log('\n==== 3. 确认 compose 解析出 local 镜像 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose config 2>&1 | grep "image:" | head -5')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 重建并启动 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose down 2>/dev/null; docker compose up -d')
    console.log(r.out || r.errOut)

    console.log('\n==== 5. 等 40s ====')
    await new Promise(res => setTimeout(res, 40000))

    console.log('\n==== 6. 容器状态与镜像 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 7. web 日志（迁移结果）====')
    r = await run(c, 'docker logs --tail 60 zscx-web 2>&1')
    console.log(r.out || r.errOut || '(无日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })