const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => errOut += d.toString())
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  // 方案：用 zscx-web:v3 镜像启动容器，然后直接修改容器内文件，重新 build Next.js，再提交新镜像
  // v3 镜像已经有 node_modules，不需要重新 npm ci

  // 1. 清理旧容器
  console.log('==== 清理 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-temp 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 启动临时容器
  console.log('\n==== 启动临时容器 ====')
  r = await sshExec(conn, 'docker run -d --name zscx-temp zscx-web:v3 sleep 3600 2>&1')
  console.log(r.out || r.errOut)

  // 3. 在容器中创建必要的目录
  console.log('\n==== 确保容器目录存在 ====')
  r = await sshExec(conn, 'docker exec zscx-temp mkdir -p /app/lib /app/app/api/auth/third-party/platforms 2>&1')
  console.log(r.out || r.errOut || 'OK')

  // 4. 上传修改后的源文件
  console.log('\n==== 上传源文件 ====')
  const localWebDir = path.join(__dirname, '..', 'web')
  const files = [
    { local: 'lib/prisma.ts', remote: '/app/lib/prisma.ts' },
    { local: 'app/api/auth/third-party/platforms/route.ts', remote: '/app/app/api/auth/third-party/platforms/route.ts' },
    { local: 'tsconfig.json', remote: '/app/tsconfig.json' },
  ]

  for (const f of files) {
    const content = fs.readFileSync(path.join(localWebDir, f.local), 'utf-8')
    const b64 = Buffer.from(content).toString('base64')
    r = await sshExec(conn, `docker exec zscx-temp sh -c "echo '${b64}' | base64 -d > ${f.remote}"`)
    if (r.errOut) console.log('Warning:', f.local, r.errOut)
    else console.log('  ✓', f.local)
  }

  // 5. 验证文件
  console.log('\n==== 验证 ====')
  r = await sshExec(conn, 'docker exec zscx-temp ls -la /app/lib/prisma.ts /app/app/api/auth/third-party/platforms/route.ts /app/tsconfig.json 2>&1')
  console.log(r.out || r.errOut)

  // 6. 在容器里重新 next build
  console.log('\n==== 重新 build ====')
  r = await sshExec(conn, 'docker exec zscx-temp sh -c "cd /app && rm -rf .next && PATH=./node_modules/.bin:$PATH next build --no-lint 2>&1"', 600000)
  console.log(r.out.slice(-2000))
  if (r.errOut) console.log('ERR:', r.errOut.slice(-500))

  // 7. 验证编译产物
  console.log('\n==== 验证编译产物 ====')
  r = await sshExec(conn, 'docker exec zscx-temp ls /app/.next/server/app/api/auth/third-party/platforms/route.js 2>&1 && grep -l "datasources" /app/.next/server/app/api/auth/third-party/platforms/route.js 2>&1 | head -1')
  console.log(r.out || r.errOut)

  // 8. 提交镜像
  console.log('\n==== 提交新镜像 ====')
  r = await sshExec(conn, 'docker commit zscx-temp zscx-web:latest && docker rm -f zscx-temp')
  console.log(r.out || r.errOut)

  // 9. 用 docker compose 启动
  console.log('\n==== docker compose up ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 10. 等待启动
  console.log('\n==== 等待 25s ====')
  await new Promise(res => setTimeout(res, 25000))

  // 11. 检查状态和日志
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 12. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
