const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sshExec(conn, cmd, timeout = 600000) {
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

  // 1. 停止并删除容器
  console.log('==== 停掉现有容器 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-mysql 2>&1; echo done')
  console.log(r.out.trim())

  // 2. 上传修改后的 docker-compose.yml
  const composeContent = fs.readFileSync(path.join(__dirname, '..', 'docker', 'docker-compose.yml'), 'utf-8')
  const b64 = Buffer.from(composeContent).toString('base64')
  r = await sshExec(conn, `echo '${b64}' | base64 -d > /vol2/1000/docker/zscx/docker-compose.yml`)
  console.log('\n==== 更新 docker-compose.yml ====')
  console.log(r.errOut || 'OK')

  // 3. 本地 build 镜像
  console.log('\n==== 本地 build Docker 镜像 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/docker && docker compose build --no-cache web 2>&1', 600000)
  console.log('STDOUT:', r.out.slice(-4000))
  if (r.errOut) console.log('STDERR:', r.errOut.slice(-1500))

  // 4. 启动
  console.log('\n==== 启动容器 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/docker && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 5. 等待启动
  console.log('\n==== 等待 30s ====')
  await new Promise(res => setTimeout(res, 30000))

  // 6. 状态
  console.log('\n==== 容器状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 7. 日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 8. 验证路由
  console.log('\n==== 验证 platforms 路由 ====')
  r = await sshExec(conn, 'docker exec zscx-web find /app/.next -path "*platforms*" 2>&1')
  console.log('platforms 文件:', r.out || r.errOut)

  r = await sshExec(conn, 'docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('容器内 API:', r.out || r.errOut)

  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('宿主机 API:', r.out || r.errOut)

  conn.end()
}

main().catch(e => console.error(e))
