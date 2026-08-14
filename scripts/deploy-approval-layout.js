const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const HOST = 'REDACTED_IP'
const USER = 'REDACTED_USER'
const PASS = 'REDACTED_PASSWORD'
const ROOT = '/vol2/1000/docker/zscx/web'

const c = new Client()

function run(conn, cmd, timeout = 900000) {
  return new Promise((res, rej) => {
    let timedOut = false
    const t = setTimeout(() => { timedOut = true; conn.end(); rej(new Error('TIMEOUT')) }, timeout)
    conn.exec(cmd, { pty: { term: 'xterm', cols: 140, rows: 30 } }, (err, s) => {
      if (err) { clearTimeout(t); return rej(err) }
      let out = '', errOut = ''
      s.on('data', d => { out += d.toString(); if (!timedOut) process.stdout.write(d.toString()) })
      s.stderr.on('data', d => { errOut += d.toString(); if (!timedOut) process.stderr.write(d.toString()) })
      s.on('close', code => { clearTimeout(t); if (!timedOut) res({ out, errOut, code }) })
    })
  })
}

// 需要上传的文件（相对 web 根目录）
const files = [
  'components/layout/workspace-shell.tsx',
  'app/dashboard/layout.tsx',
  'app/approval/layout.tsx',
  'app/approval/page.tsx',
  'app/approval/workflows/[id]/designer/layout.tsx',
  'app/api/approval/v2/instances/route.ts',
  'app/approval/todo/page.tsx',
  'app/approval/mine/page.tsx',
]

const LOCAL_WEB = path.resolve(__dirname, '..', 'web')

c.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 15000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 上传修改的源代码文件 ====')
    for (const rel of files) {
      const localFile = path.join(LOCAL_WEB, rel)
      const remotePath = `${ROOT}/${rel}`
      const b64 = fs.readFileSync(localFile).toString('base64')
      const cmd = `mkdir -p "$(dirname '${remotePath}')" && echo '${b64}' | base64 -d > '${remotePath}' && echo "OK ${rel}"`
      const r = await run(c, cmd, 60000)
      if (!r.out.includes('OK')) console.error(`上传异常: ${rel}`)
    }

    console.log('\n==== 2. 服务器上重新构建镜像 ====')
    await run(c, `cd ${ROOT} && docker build -t zscx-web:local .`, 900000)

    console.log('\n==== 3. 重启 web 服务 ====')
    await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose up -d --force-recreate web 2>&1 | tail -20')

    console.log('\n==== 4. 等待容器启动 ====')
    await new Promise(res => setTimeout(res, 30000))

    console.log('\n==== 5. 容器状态 ====')
    const ps = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(ps.out || ps.errOut)

    console.log('\n==== 6. web 容器日志（最后 40 行）====')
    const logs = await run(c, 'docker logs --tail 40 zscx-web 2>&1')
    console.log(logs.out || logs.errOut || '(无日志)')
  } catch (e) {
    if (e.message === 'TIMEOUT') console.error('\n超时，请检查服务器')
    else console.error('出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })