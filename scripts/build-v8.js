const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 180000) {
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

  // 1. 停掉 web
  console.log('==== 清理 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-temp 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 启动临时容器
  console.log('\n==== 启动临时容器 ====')
  r = await sshExec(conn, 'docker run -d --name zscx-temp zscx-web:latest sleep 3600 2>&1')
  console.log(r.out || r.errOut)

  // 3. 创建完整的 app 目录结构（包含从服务器源码目录拷贝的文件）
  console.log('\n==== 从服务器源码复制到容器 ====')
  const localWebDir = path.join(__dirname, '..', 'web')

  // 直接把服务器上的 web/app 目录完整复制到容器
  // 先在服务器上压缩，再解压到容器
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/web && tar -czf /tmp/app-src.tar.gz app lib tsconfig.json 2>&1')
  console.log('服务器压缩:', r.out || r.errOut)

  // 把压缩包复制到容器
  r = await sshExec(conn, 'docker cp /tmp/app-src.tar.gz zscx-temp:/tmp/app-src.tar.gz 2>&1')
  console.log('复制到容器:', r.out || r.errOut)

  // 在容器中解压
  r = await sshExec(conn, 'docker exec zscx-temp sh -c "cd /app && tar -xzf /tmp/app-src.tar.gz && ls -la && ls app/api/auth/third-party/" 2>&1')
  console.log('解压结果:', r.out || r.errOut)

  // 4. 在容器里重新 next build
  console.log('\n==== 重新 build ====')
  r = await sshExec(conn, 'docker exec zscx-temp sh -c "cd /app && rm -rf .next && PATH=./node_modules/.bin:$PATH next build --no-lint 2>&1"', 600000)
  console.log(r.out.slice(-3000))
  if (r.errOut) console.log('ERR:', r.errOut.slice(-800))

  // 5. 验证新路由
  console.log('\n==== 验证 platforms 路由 ====')
  r = await sshExec(conn, 'docker exec zscx-temp find /app/.next -path "*platforms*" 2>&1')
  console.log(r.out || r.errOut)

  // 6. 提交镜像
  console.log('\n==== 提交镜像 ====')
  r = await sshExec(conn, 'docker commit zscx-temp zscx-web:latest && docker rm -f zscx-temp')
  console.log(r.out || r.errOut)

  // 7. docker compose up
  console.log('\n==== docker compose up ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 8. 等待启动
  console.log('\n==== 等待 30s ====')
  await new Promise(res => setTimeout(res, 30000))

  // 9. 状态
  console.log('\n==== 状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 10. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 20 zscx-web 2>&1')
  console.log(r.out)

  // 11. API 测试
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('容器内:', r.out || r.errOut)

  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('宿主机:', r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
