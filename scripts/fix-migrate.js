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

  // 1. 停掉 zscx-web
  console.log('==== 清理 ====')
  let r = await run('docker rm -f zscx-web 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 启动临时容器
  console.log('\n==== 启动临时容器 ====')
  r = await run('docker run -d --name zscx-temp zscx-web:latest sleep 3600 2>&1')
  console.log(r.out || r.errOut)

  // 3. 上传修改后的 docker-migrate.js
  console.log('\n==== 上传修改后的文件 ====')
  const fs = require('fs')
  const path = require('path')

  const localWebDir = 'D:/开发征收项目/zscx/web'
  const files = [
    { local: 'prisma/docker-migrate.js', remote: '/app/prisma/docker-migrate.js' },
  ]

  for (const f of files) {
    const content = fs.readFileSync(path.join(localWebDir, f.local), 'utf-8')
    const b64 = Buffer.from(content).toString('base64')
    r = await run(`docker exec zscx-temp sh -c "echo '${b64}' | base64 -d > ${f.remote}"`)
    if (r.errOut) console.log('Warning:', f.local, r.errOut)
    else console.log('  ✓', f.local)
  }

  // 4. 重启容器运行一次迁移，看看是否成功
  console.log('\n==== 测试迁移脚本 ====')
  r = await run('docker exec zscx-temp sh -c "cd /app && node prisma/docker-migrate.js 2>&1; echo EXIT_CODE=$?"')
  console.log(r.out.slice(-500))

  // 5. 提交新镜像
  console.log('\n==== 提交镜像 ====')
  r = await run('docker commit zscx-temp zscx-web:latest && docker rm -f zscx-temp')
  console.log(r.out || r.errOut)

  // 6. 用 docker compose 启动
  console.log('\n==== docker compose up ====')
  r = await run('cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 7. 等待启动
  console.log('\n==== 等待 25s ====')
  await new Promise(res => setTimeout(res, 25000))

  // 8. 状态
  console.log('\n==== 状态 ====')
  r = await run('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 9. 日志
  console.log('\n==== 日志 ====')
  r = await run('docker logs --tail 25 zscx-web 2>&1')
  console.log(r.out)

  // 10. API 测试
  console.log('\n==== API 测试 ====')
  r = await run('wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
