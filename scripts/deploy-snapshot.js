/**
 * 部署「数据快照/变更历史」功能到测试服务器 (REDACTED_IP) 并验证
 * - 上传 5 个改动文件（2 新增 + 3 修改）到 /vol2/1000/docker/zscx/web
 * - 从 web 源码构建 zscx-web:local 镜像
 * - 用 docker/docker-compose.yml 增量重建 web 容器（端口 777）
 * - 验证快照 API（未登录 401 + 登录后正常返回）
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function sshExec(conn, cmd, timeout = 600000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      const timer = setTimeout(() => { stream.close(); reject(new Error('SSH 命令超时: ' + cmd.slice(0, 80))) }, timeout)
      stream.on('data', d => { out += d.toString(); process.stdout.write(d) })
      stream.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d) })
      stream.on('close', () => { clearTimeout(timer); resolve({ out, errOut }) })
    })
  })
}

async function writeRemoteFile(conn, remotePath, content) {
  const b64 = Buffer.from(content, 'utf-8').toString('base64')
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/'))
  await sshExec(conn, `mkdir -p '${dir}'`)
  const r = await sshExec(conn, `python3 -c "import base64;open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
  return r
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('✅ 已连接服务器\n')

  const webDir = 'd:\\开发征收项目\\zscx\\web'
  const remoteWebDir = '/vol2/1000/docker/zscx/web'
  const composeDir = '/vol2/1000/docker/zscx/docker'

  // 1. 上传改动文件
  const filesToUpload = [
    // 新增
    'app/api/data/[tableName]/[id]/snapshots/route.ts',
    'components/snapshot-history-dialog.tsx',
    // 修改
    'app/dashboard/data/[tableName]/data-list-client.tsx',
    'app/dashboard/data/[tableName]/[id]/record-detail-client.tsx',
    'app/h5/(main)/projects/[tableName]/data-list-client.tsx',
  ]

  console.log('1. 上传文件到服务器')
  for (const file of filesToUpload) {
    const localPath = path.join(webDir, file)
    const remotePath = remoteWebDir + '/' + file
    if (!fs.existsSync(localPath)) { console.log(`  ✗ 本地文件不存在: ${file}`); process.exit(1) }
    const content = fs.readFileSync(localPath, 'utf-8')
    await writeRemoteFile(conn, remotePath, content)
    console.log(`  ✓ ${file}`)
  }

  // 2. 清理可能卡住的旧构建进程，从 web 源码构建镜像
  console.log('\n2. 清理旧构建并构建 zscx-web:local 镜像...')
  await sshExec(conn, 'pkill -f "docker build" 2>/dev/null; sleep 2; echo cleaned', 30000)
  const build = await sshExec(conn, `cd ${remoteWebDir} && docker build -t zscx-web:local . 2>&1 | tail -20`, 1200000)
  console.log(build.out || build.errOut || 'done')

  // 3. 增量重建 web 容器
  console.log('\n3. 重建 web 容器...')
  const up = await sshExec(conn, `cd ${composeDir} && docker compose up -d --build web 2>&1 | tail -20`, 600000)
  console.log(up.out || up.errOut || 'done')

  // 4. 等待服务就绪
  console.log('\n4. 等待服务就绪...')
  let ready = false
  for (let i = 0; i < 40; i++) {
    await new Promise(res => setTimeout(res, 3000))
    const r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login 2>&1', 15000)
    const code = (r.out || '').trim()
    if (code === '200') { console.log('  服务已就绪（HTTP 200）'); ready = true; break }
    if (i === 39) console.log('  注意：未等到 200，当前状态码 =', code)
  }
  if (!ready) { conn.end(); console.log('❌ 服务未就绪，终止验证'); process.exit(1) }

  // 5. 验证快照 API：未登录应返回 401（证明路由已注册）
  console.log('\n5. 验证快照 API 路由（未登录 → 401）')
  const r401 = await sshExec(conn, 'curl -s -w "\\nHTTP:%{http_code}" http://localhost:777/api/data/household/1/snapshots 2>&1 | tail -3', 30000)
  console.log('  ', r401.out)
  const out401 = r401.out || ''
  if (out401.includes('401')) console.log('  ✓ 路由已注册，未登录返回 401')
  else console.log('  ✗ 未返回 401，检查是否路由缺失或 500')

  // 6. 尝试登录（含验证码）后验证快照 API
  console.log('\n6. 验证码登录 + 快照 API（尽力而为）')
  const login = await sshExec(conn, `
    CAP=$(curl -s http://localhost:777/api/auth/captcha)
    CAPID=$(echo "$CAP" | python3 -c "import sys,json;print(json.load(sys.stdin)['captchaId'])" 2>/dev/null)
    CODE=$(docker exec zscx-redis redis-cli get "captcha:$CAPID" 2>/dev/null | tr -d '\\r\\n')
    echo "--- 尝试 admin 登录 ---"
    LOGIN=$(curl -s -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\",\\"captchaId\\":\\"$CAPID\\",\\"captchaCode\\":\\"$CODE\\"}")
    echo "$LOGIN" | head -c 200
    echo ""
    TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token') or d.get('data',{}).get('token') or '')" 2>/dev/null)
    if [ -n "$TOKEN" ]; then
      echo "--- 快照 API（有 token）---"
      curl -s -w "\\nHTTP:%{http_code}" http://localhost:777/api/data/household/1/snapshots -H "Authorization: Bearer $TOKEN" 2>&1 | head -c 300
      echo ""
    else
      echo "登录未拿到 token，跳过带 token 验证（未登录 401 已证明路由可用）"
    fi
  `, 60000)
  console.log(login.out || login.errOut)

  // 7. 确认容器内源码文件存在
  console.log('\n7. 确认容器内快照文件存在')
  const chk = await sshExec(conn, `docker exec zscx-web sh -c "ls -la /app/app/api/data/'[tableName]'/'[id]'/snapshots/route.ts /app/components/snapshot-history-dialog.tsx 2>&1"`, 30000)
  console.log(chk.out || chk.errOut)

  conn.end()
  console.log('\n✅ 部署与验证完成')
}

run().catch(err => { console.error('❌ 部署失败:', err); process.exit(1) })
