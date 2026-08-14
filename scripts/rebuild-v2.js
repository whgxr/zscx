const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sshExec(conn, cmd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => errOut += d.toString())
      stream.on('close', () => { clearTimeout(timer); resolve({ out, errOut }) })
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  // 1. 停掉 web
  console.log('==== 停掉 web ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 启动临时容器（基于当前镜像）
  console.log('\n==== 启动临时容器 ====')
  r = await sshExec(conn, 'docker run -d --name zscx-temp ghcr.io/whgxr/zscx-web:latest sleep 3600 2>&1')
  console.log('启动:', r.out || r.errOut)

  // 3. 把本地 web 目录的关键文件上传到容器
  const localWebDir = path.join(__dirname, '..', 'web')
  const files = [
    'app/api/auth/third-party/platforms/route.ts',
    'app/api/auth/third-party/[platform]/route.ts',
    'app/api/auth/third-party/feishu/callback/route.ts',
    'lib/prisma.ts',
  ]

  console.log('\n==== 上传源码文件 ====')
  for (const f of files) {
    const localPath = path.join(localWebDir, f)
    if (!fs.existsSync(localPath)) {
      console.log('跳过(不存在):', f)
      continue
    }
    const content = fs.readFileSync(localPath, 'utf-8')
    const b64 = Buffer.from(content).toString('base64')
    r = await sshExec(conn, `docker exec zscx-temp sh -c "mkdir -p /app/$(dirname f) && echo '${b64}' | base64 -d > /app/${f}" 2>&1`)
    if (r.errOut) console.log('ERR:', f, r.errOut)
    else console.log('  ✓', f)
  }

  // 4. 同时复制服务器上的完整 app 和 lib 目录（包含所有第三方路由）
  console.log('\n==== 从服务器复制完整源码 ====')
  // 使用 scp 在服务器端复制
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/web && tar -czf /tmp/web-src.tar.gz app lib tsconfig.json next.config.js 2>&1')
  console.log('压缩:', r.out || r.errOut)

  r = await sshExec(conn, 'docker cp /tmp/web-src.tar.gz zscx-temp:/tmp/ 2>&1')
  console.log('复制到容器:', r.out || r.errOut)

  r = await sshExec(conn, 'docker exec zscx-temp sh -c "cd /app && tar -xzf /tmp/web-src.tar.gz 2>&1 && ls -la && ls app/api/auth/third-party/"')
  console.log('容器内解压:', r.out || r.errOut)

  // 5. 在容器内重建 .next
  console.log('\n==== 在容器内 next build ====')
  r = await sshExec(conn, 'docker exec zscx-temp sh -c "cd /app && rm -rf .next && PATH=./node_modules/.bin:$PATH next build --no-lint 2>&1"', 600000)
  console.log('STDOUT:', r.out.slice(-3000))
  if (r.errOut) console.log('STDERR:', r.errOut.slice(-800))

  // 6. 验证路由
  console.log('\n==== 验证 platforms 路由 ====')
  r = await sshExec(conn, 'docker exec zscx-temp find /app/.next -path "*platforms*" 2>&1')
  console.log(r.out || r.errOut)

  // 7. 提交为新镜像
  console.log('\n==== 提交镜像 ====')
  r = await sshExec(conn, 'docker commit zscx-temp ghcr.io/whgxr/zscx-web:latest 2>&1 && docker rm -f zscx-temp')
  console.log(r.out || r.errOut)

  // 8. 启动
  console.log('\n==== docker compose up ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d web 2>&1')
  console.log(r.out || r.errOut)

  // 9. 等待
  await new Promise(res => setTimeout(res, 30000))

  // 10. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 11. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 20 zscx-web 2>&1')
  console.log(r.out)

  // 12. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('容器内:', r.out || r.errOut)

  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('宿主机:', r.out || r.errOut)

  conn.end()
}

main().catch(e => console.error(e))
