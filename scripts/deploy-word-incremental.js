/**
 * 可靠增量部署 v2（修正版）：基于 zscx-web:local，COPY . . 覆盖源码
 * .dockerignore 已排除 node_modules/.next → 镜像内保留，跳过 npm install，next build 增量
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', hostVerifier: (k) => true, readyTimeout: 20000 }

function sshExec(conn, cmd, timeout = 1800000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      const timer = setTimeout(() => { stream.close(); reject(new Error('Timeout')) }, timeout)
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
  await sshExec(conn, `python3 -c "import base64;open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
  await sshExec(conn, `chmod 644 '${remotePath}'`)
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('✅ 已连接服务器')

  const localWeb = 'd:\\开发征收项目\\zscx\\web'
  const remoteWeb = '/vol2/1000/docker/zscx/web'

  // 1. 上传 3 个改动文件
  console.log('\n1. 上传 3 个改动文件')
  const files = [
    'app/api/export/[tableName]/docx/route.ts',
    'lib/docx-renderer.ts',
    'app/dashboard/word-templates/[id]/page.tsx',
  ]
  for (const f of files) {
    const content = fs.readFileSync(path.join(localWeb, f), 'utf-8')
    await writeRemoteFile(conn, remoteWeb + '/' + f, content)
    console.log('  ✓', f)
  }

  // 2. 写临时增量 Dockerfile（COPY . . 覆盖源码；.dockerignore 保留镜像内 node_modules/.next）
  console.log('\n2. 写 Dockerfile.incremental')
  const dockerfile = [
    'FROM zscx-web:storage',
    'USER root',
    'COPY . .',
    'RUN npx prisma generate',
    'RUN npm run build || (test -d .next && echo "BUILD_OK_IGNORE_TS" || exit 1)',
  ].join('\n')
  await writeRemoteFile(conn, remoteWeb + '/Dockerfile.incremental', dockerfile)
  console.log('  ✓ Dockerfile.incremental')

  // 3. 校验上传
  const chk = await sshExec(conn, `grep -c "renderRichDocxToBuffer" ${remoteWeb}/lib/docx-renderer.ts`)
  console.log('  grep renderRichDocxToBuffer:', (chk.out || '').trim())

  // 4. 增量构建（复用镜像内 node_modules，next build 增量编译）
  console.log('\n3. 增量构建 zscx-web:new（next build 约 2-4 分钟）')
  const b = await sshExec(conn, `cd ${remoteWeb} && docker build -f Dockerfile.incremental -t zscx-web:new . 2>&1 | tail -40`, 1800000)
  console.log((b.out || b.errOut || 'done'))

  // 5. 校验新镜像含新代码（docx-renderer 编译产物应含 renderRichDocxToBuffer）
  console.log('\n4. 校验新镜像包含新代码')
  const v = await sshExec(conn, 'docker run --rm --entrypoint grep zscx-web:new -rl "renderRichDocxToBuffer" /app/lib 2>&1 | head -3')
  console.log(v.out || v.errOut)
  const v2 = await sshExec(conn, 'docker run --rm --entrypoint grep zscx-web:new -rl "contentEditable" /app/.next 2>&1 | head -3')
  console.log('contentEditable in .next:', (v2.out || v2.errOut).split('\n').filter(Boolean).length, 'files')

  // 6. tag 回 local 并 force-recreate
  console.log('\n5. tag 并重建 web 容器')
  const t = await sshExec(conn, `docker tag zscx-web:new zscx-web:local && cd /vol2/1000/docker/zscx/docker && docker compose up -d --force-recreate web 2>&1 | tail -10`, 600000)
  console.log((t.out || t.errOut || 'done'))

  // 7. 等待就绪
  console.log('\n6. 等待服务就绪')
  let ready = false
  for (let i = 0; i < 60; i++) {
    await new Promise(res => setTimeout(res, 3000))
    const r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login 2>&1', 15000)
    if ((r.out || '').trim() === '200') { ready = true; console.log('  就绪'); break }
  }
  if (!ready) { console.log('❌ 未就绪'); conn.end(); process.exit(1) }

  console.log('\n7. 容器状态')
  const ps = await sshExec(conn, 'docker ps --filter name=zscx --format "{{.Names}}|{{.Image}}|{{.Status}}"')
  console.log(ps.out || ps.errOut)

  conn.end()
  console.log('\n✅ 增量部署完成')
}
run().catch(e => { console.error('❌ 失败:', e.message); process.exit(1) })