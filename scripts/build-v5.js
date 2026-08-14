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

  // 1. 清理旧容器
  console.log('==== 清理旧 Web 容器 ====')
  let r = await sshExec(conn, 'docker rm -f zscx-web zscx-build 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 2. 上传需要更新的文件到服务器的 web 目录
  console.log('\n==== 上传更新文件到服务器 ====')
  const localWebDir = path.join(__dirname, '..', 'web')
  const targetDir = '/vol2/1000/docker/zscx/web'

  // 需要覆盖更新的文件
  const updatedFiles = [
    'lib/prisma.ts',
    'app/api/auth/third-party/platforms/route.ts',
    'Dockerfile',
    'tsconfig.json',
  ]

  for (const file of updatedFiles) {
    const localPath = path.join(localWebDir, file)
    const content = fs.readFileSync(localPath, 'utf-8')
    const b64 = Buffer.from(content).toString('base64')
    const remotePath = `${targetDir}/${file}`
    const mkdirCmd = `mkdir -p $(dirname ${remotePath}) && echo '${b64}' | base64 -d > ${remotePath}`
    r = await sshExec(conn, mkdirCmd)
    if (r.errOut) console.log('Warning:', file, r.errOut)
    else console.log('  ✓', file)
  }

  // 3. 在服务器上用 docker build 重新构建镜像
  console.log('\n==== 在服务器上重建镜像 ====')
  r = await sshExec(conn, `cd /vol2/1000/docker/zscx && docker build -t zscx-web:latest ./web 2>&1`, 600000)
  console.log(r.out.slice(-3000))
  if (r.errOut) console.log('ERR:', r.errOut)

  // 4. 停止旧的 web 容器（如果有）
  console.log('\n==== 停止旧容器 ====')
  r = await sshExec(conn, 'docker rm -f zscx-web 2>/dev/null; docker compose -f /vol2/1000/docker/zscx/docker-compose.yml down 2>/dev/null; echo OK')
  console.log(r.out.trim())

  // 5. 使用 docker compose 启动
  console.log('\n==== 启动新容器 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose up -d 2>&1')
  console.log(r.out || r.errOut)

  // 6. 等待启动
  console.log('\n==== 等待 30s ====')
  await new Promise(res => setTimeout(res, 30000))

  // 7. 检查状态
  console.log('\n==== 容器状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 8. 查看日志
  console.log('\n==== 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 9. 测试 API
  console.log('\n==== API 测试 ====')
  r = await sshExec(conn, 'wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || curl -s http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO_RESPONSE')
  console.log(r.out || r.errOut)

  conn.end()
}

run().catch(e => console.error(e))
