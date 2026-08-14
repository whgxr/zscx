const { Client } = require('ssh2')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout + 'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()) })
      stream.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d.toString()) })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      const dir = path.dirname(remotePath)
      sftp.mkdir(dir, { recursive: true }, () => {
        sftp.fastPut(localPath, remotePath, (err) => err ? reject(err) : resolve())
      })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('Connected\n')

  const local = 'd:\\开发征收项目\\zscx\\web\\app\\dashboard\\audit\\audit-client.tsx'
  const remote = '/vol2/1000/docker/zscx/web/app/dashboard/audit/audit-client.tsx'

  // 1. 上传修改的审计日志页面
  console.log('==== 上传 audit-client.tsx ====')
  await sftpPut(conn, local, remote)
  console.log('  ✓ uploaded\n')

  // 2. 构建 web 镜像
  console.log('==== 构建 web 镜像 (docker compose build web) ====')
  let r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml build web 2>&1 | tail -40', 900000)
  console.log('Build done (code=' + r.code + ')\n')

  // 3. 重启 web 容器
  console.log('==== 重启 web 容器 ====')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d web 2>&1')
  console.log(r.out || r.errOut || 'done')

  console.log('\n等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  // 4. 容器状态
  console.log('\n==== 容器状态 ====')
  r = await sshExec(conn, 'docker ps --filter name=zscx --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  // 5. Web 日志
  console.log('\n==== Web 日志 (tail 30) ====')
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log(r.out)

  // 6. 登录页可达性
  console.log('\n==== 登录页检查 ====')
  r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login 2>&1')
  console.log('HTTP', r.out)

  conn.end()
  console.log('\n完成！')
}

run().catch(e => { console.error(e); process.exit(1) })