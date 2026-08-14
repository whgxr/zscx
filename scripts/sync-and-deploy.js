const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

async function sshExec(conn, cmd) {
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

async function sftpPut(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      // 确保远程目录存在
      const dir = path.dirname(remotePath)
      sftp.mkdir(dir, { recursive: true }, (err) => {
        // 忽略目录已存在的错误
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  })
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

  // 2. 上传登录页面
  console.log('\n2. 上传登录页面')
  await sftpPut(conn,
    path.join(webDir, 'app/login/page.tsx'),
    path.join(remoteWebDir, 'app/login/page.tsx')
  )
  console.log('  ✓ page.tsx')

  // 3. 上传 platforms API 路由
  console.log('\n3. 上传 platforms API')
  await sftpPut(conn,
    path.join(webDir, 'app/api/auth/third-party/platforms/route.ts'),
    path.join(remoteWebDir, 'app/api/auth/third-party/platforms/route.ts')
  )
  console.log('  ✓ platforms/route.ts')

  // 4. 上传 Feishu 回调路由
  console.log('\n4. 上传 Feishu 回调')
  await sftpPut(conn,
    path.join(webDir, 'app/api/auth/third-party/feishu/callback/route.ts'),
    path.join(remoteWebDir, 'app/api/auth/third-party/feishu/callback/route.ts')
  )
  console.log('  ✓ feishu/callback/route.ts')

  // 5. 上传 [platform] 路由
  console.log('\n5. 上传 [platform] 路由')
  await sftpPut(conn,
    path.join(webDir, 'app/api/auth/third-party/[platform]/route.ts'),
    path.join(remoteWebDir, 'app/api/auth/third-party/[platform]/route.ts')
  )
  console.log('  ✓ [platform]/route.ts')

  // 6. 上传 lib/feishu.ts
  console.log('\n6. 上传 lib/feishu.ts')
  await sftpPut(conn,
    path.join(webDir, 'lib/feishu.ts'),
    path.join(remoteWebDir, 'lib/feishu.ts')
  )
  console.log('  ✓ lib/feishu.ts')

  // 7. 上传 lib/integration-service.ts
  console.log('\n7. 上传 lib/integration-service.ts')
  await sftpPut(conn,
    path.join(webDir, 'lib/integration-service.ts'),
    path.join(remoteWebDir, 'lib/integration-service.ts')
  )
  console.log('  ✓ lib/integration-service.ts')

  // 8. 上传 lib/prisma.ts
  console.log('\n8. 上传 lib/prisma.ts')
  await sftpPut(conn,
    path.join(webDir, 'lib/prisma.ts'),
    path.join(remoteWebDir, 'lib/prisma.ts')
  )
  console.log('  ✓ lib/prisma.ts')

  // 9. 更新 docker-compose.yml
  console.log('\n9. 更新 docker-compose.yml')
  const localCompose = fs.readFileSync('d:\\开发征收项目\\zscx\\docker\\docker-compose.yml', 'utf-8')
  const remoteComposePath = '/vol2/1000/docker/zscx/docker/docker-compose.yml'
  await sftpPut(conn, 'd:\\开发征收项目\\zscx\\docker\\docker-compose.yml', remoteComposePath)
  console.log('  ✓ docker-compose.yml')

  // 10. 构建镜像
  console.log('\n10. 构建 Docker 镜像（预计 5-10 分钟）...')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker build -t zscx-web:latest ./web --no-cache 2>&1 | tail -20', 900000)
  console.log(r.out || r.errOut)

  // 11. 更新 docker-compose 使用本地镜像
  console.log('\n11. 更新 compose 使用本地镜像')
  r = await sshExec(conn, `cd /vol2/1000/docker/zscx && python3 -c "
import yaml
with open('docker/docker-compose.yml') as f:
    d = yaml.safe_load(f)
d['services']['web']['image'] = 'zscx-web:latest'
with open('docker/docker-compose.yml', 'w') as f:
    yaml.dump(d, f, default_flow_style=False)
print('Updated compose to use zscx-web:latest')
" 2>&1`)
  console.log(r.out || r.errOut)

  // 12. 重启所有容器
  console.log('\n12. 重启容器')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n等待 20s...')
  await new Promise(res => setTimeout(res, 20000))

  // 13. 检查状态
  console.log('\n13. 最终状态')
  r = await sshExec(conn, 'docker ps --filter name=zscx')
  console.log(r.out)

  // 14. 测试 API
  console.log('\n14. 测试 API')
  r = await sshExec(conn, 'curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1')
  console.log('Platforms API:', r.out)

  // 15. 检查登录页面
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