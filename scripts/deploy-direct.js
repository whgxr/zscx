const { Client } = require('ssh2')
const c = new Client()

const run = (conn, cmd, timeout = 600000) => new Promise((res, rej) => {
  let timedOut = false
  const t = setTimeout(() => { timedOut = true; conn.end(); rej(new Error('TIMEOUT')) }, timeout)
  conn.exec(cmd, { pty: { term: 'xterm', cols: 120, rows: 30 } }, (err, s) => {
    if (err) { clearTimeout(t); return rej(err) }
    let out = '', errOut = ''
    s.on('data', d => { out += d.toString(); if (!timedOut) process.stdout.write(d.toString()) })
    s.stderr.on('data', d => { errOut += d.toString(); if (!timedOut) process.stderr.write(d.toString()) })
    s.on('close', (code) => { clearTimeout(t); if (!timedOut) res({ out, errOut, code }) })
  })
})

c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 清理残留并检查代码 ====')
    let r = await run(c, 'ps aux | grep -E "docker build|buildx build|npm ci|npm install|node-pre-gyp" | grep -v grep | awk "{print \$2}" | xargs -r kill -9 2>/dev/null; echo "==== files ===="; ls -la /vol2/1000/docker/zscx/web/prisma/docker-migrate.js 2>&1; ls -la /vol2/1000/docker/zscx/web/lib/levy-edit-scope.ts 2>&1; ls -la /vol2/1000/docker/zscx/docker-nas/docker-compose.yml 2>&1')
    console.log(r.out)

    console.log('\n==== 2. 构建 Docker 镜像 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/web && docker build -t zscx-web:local .', 600000)
    console.log('\n==== 构建完成 ====')

    console.log('\n==== 3. 启动服务 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose down 2>/dev/null; docker compose up -d')
    console.log(r.out || r.errOut)

    console.log('\n==== 4. 等 30s 待容器启动 ====')
    await new Promise(res => setTimeout(res, 30000))

    console.log('\n==== 5. 容器状态 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 6. web 容器日志（最后 50 行）====')
    r = await run(c, 'docker logs --tail 50 zscx-web 2>&1')
    console.log(r.out || r.errOut || '(无日志)')
  } catch (e) {
    if (e.message === 'TIMEOUT') {
      console.error('\n⏰ 构建超时（10分钟），请检查服务器状态')
    } else {
      console.error('❌ 出错:', e.message)
    }
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })