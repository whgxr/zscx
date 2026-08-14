const { Client } = require('ssh2')
const c = new Client()
const run = (conn, cmd) => new Promise((res, rej) => {
  conn.exec(cmd, { pty: { term: 'xterm', cols: 120, rows: 30 } }, (err, s) => {
    if (err) return rej(err)
    let out = '', errOut = ''
    s.on('data', d => { out += d.toString(); process.stdout.write(d.toString()) })
    s.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d.toString()) })
    s.on('close', () => res({ out, errOut }))
  })
})
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 修改服务器 Dockerfile 使用 npm install（避免 npm ci 卡死）====')
    let r = await run(c, `sed -i 's|npm config set registry https://registry.npmmirror.com && npm ci --prefer-offline \\|\\| npm install|npm config set registry https://registry.npmmirror.com \\&\\& npm install|' /vol2/1000/docker/zscx/web/Dockerfile`)
    r = await run(c, 'grep -n "npm install" /vol2/1000/docker/zscx/web/Dockerfile')
    console.log(r.out)

    console.log('\n==== 2. 构建 Docker 镜像（后台等待，约5-10分钟）====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/web && docker build -t zscx-web:local .')
    console.log('\n==== 构建完成 ====')

    console.log('\n==== 3. 重新启动服务 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose down 2>/dev/null; docker compose up -d')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 等 40s ====')
    await new Promise(res => setTimeout(res, 40000))

    console.log('\n==== 5. 容器状态 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 6. web 日志 ====')
    r = await run(c, 'docker logs --tail 40 zscx-web 2>&1')
    console.log(r.out || r.errOut || '(无日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })