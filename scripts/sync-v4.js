const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', d => out += d.toString())
      stream.stderr.on('data', d => errOut += d.toString())
      stream.on('close', () => resolve({ out, errOut }))
    })
  })
}

async function writeRemoteFile(conn, remotePath, content) {
  const b64 = Buffer.from(content, 'utf-8').toString('base64')
  const dir = path.dirname(remotePath)
  await sshExec(conn, `mkdir -p ${dir}`)
  // 用 python3 解码 base64 写入文件，避免 shell 转义问题
  const r = await sshExec(conn, `python3 -c "import base64; open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
  return r
}

async function run() {
  console.log('==== 同步代码到服务器 ====')
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('已连接\n')

  const webDir = 'd:\\开发征收项目\\zscx\\web'
  const remoteWebDir = '/vol2/1000/docker/zscx/web'

  // 1. 停掉 web 容器
  console.log('1. 停掉 web 容器')
  let r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml stop web 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 2. 上传所有文件
  const filesToUpload = [
    'app/login/page.tsx',
    'app/api/auth/third-party/platforms/route.ts',
    'app/api/auth/third-party/feishu/callback/route.ts',
    'app/api/auth/third-party/[platform]/route.ts',
    'lib/feishu.ts',
    'lib/integration-service.ts',
    'lib/prisma.ts',
  ]

  console.log('\n2. 上传文件')
  for (const file of filesToUpload) {
    const localPath = path.join(webDir, file)
    const remotePath = path.join(remoteWebDir, file)
    const content = fs.readFileSync(localPath, 'utf-8')
    await writeRemoteFile(conn, remotePath, content)
    console.log(`  ✓ ${file}`)
  }

  // 3. 上传 docker-compose.yml
  console.log('\n3. 上传 docker-compose.yml')
  const composeContent = fs.readFileSync('d:\\开发征收项目\\zscx\\docker\\docker-compose.yml', 'utf-8')
  await writeRemoteFile(conn, '/vol2/1000/docker/zscx/docker/docker-compose.yml', composeContent)
  console.log('  ✓ docker-compose.yml')

  // 4. 构建镜像
  console.log('\n4. 构建 Docker 镜像（预计 5-10 分钟）...')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web --no-cache 2>&1 | tail -20', 900000)
  console.log(r.out || r.errOut)

  // 5. 重启容器
  console.log('\n5. 重启容器')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n等待 30s...')
  await new Promise(res => setTimeout(res, 30000))

  // 6. 检查状态
  console.log('\n6. 最终状态')
  r = await sshExec(conn, 'docker ps --filter name=zscx')
  console.log(r.out)

  // 7. 测试 API
  console.log('\n7. 测试 API')
  r = await sshExec(conn, 'curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  // 8. 检查登录页面
  r = await sshExec(conn, 'curl -s http://localhost:3000/login 2>&1')
  console.log('登录页面长度:', r.out.length, '字符')
  if (r.out.includes('feishu') || r.out.includes('飞书') || r.out.includes('FEISHU')) {
    console.log('✓ 登录页面包含飞书登录按钮')
  } else {
    console.log('✗ 登录页面未包含飞书')
  }

  conn.end()
  console.log('\n完成！')
}

run().catch(err => { console.error(err); process.exit(1) })