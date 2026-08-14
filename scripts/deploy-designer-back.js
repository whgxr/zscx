const { Client } = require('ssh2')
const fs = require('fs')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 900000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
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
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/'))
  await sshExec(conn, `mkdir -p ${dir}`)
  return sshExec(conn, `python3 -c "import base64; open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
}

async function run() {
  console.log('==== 更新测试服务器: 审批设计器返回按钮 ====')
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('已连接\n')

  // 1. 上传修改的文件（远端路径用正斜杠拼接）
  const filesToUpload = [
    'components/designer/WorkflowDesigner.tsx',
    'components/designer/designer-utils.ts',
    'components/approval/TableBindingPanel.tsx',
    'app/approval/workflows/page.tsx',
    'app/dashboard/approval/approval-client.tsx',
    'app/api/approval/v2/workflows/blank/route.ts',
    'app/api/approval/workflows/[id]/designer/route.ts',
    'app/api/approval/workflows/[id]/route.ts',
    'lib/approval-service.ts',
    'prisma/schema.prisma',
    'prisma/docker-migrate.js',
    'prisma/migrate.js',
  ]
  const localWebDir = 'd:\\开发征收项目\\zscx\\web'
  const remoteWebDir = '/vol2/1000/docker/zscx/web'

  console.log('1. 上传文件')
  for (const file of filesToUpload) {
    const localPath = localWebDir + '\\' + file.replace(/\//g, '\\')
    const remotePath = remoteWebDir + '/' + file
    const content = fs.readFileSync(localPath, 'utf-8')
    await writeRemoteFile(conn, remotePath, content)
    console.log(`  ✓ ${file}`)
  }

  // 2. 增量重建 web 容器
  console.log('\n2. 增量重建 web 容器')
  let r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/docker && docker compose up -d --build web 2>&1 | tail -30')
  console.log(r.out || r.errOut || 'done')

  console.log('\n等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  // 3. 检查状态与接口
  console.log('\n3. 容器状态')
  r = await sshExec(conn, 'docker ps --filter name=zscx --format "table {{.Names}}\\t{{.Status}}"')
  console.log(r.out)

  console.log('\n4. 接口检查')
  r = await sshExec(conn, 'curl -s -o /dev/null -w "首页: %{http_code}\\n" http://localhost:777/')
  console.log(r.out)
  r = await sshExec(conn, 'curl -s -o /dev/null -w "审批管理: %{http_code}\\n" http://localhost:777/approval/workflows')
  console.log(r.out)

  conn.end()
  console.log('\n完成！')
}

run().catch(err => { console.error('❌', err); process.exit(1) })
