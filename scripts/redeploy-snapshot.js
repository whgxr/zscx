/**
 * 增量重部署：同步快照差异展示优化（API 归一化 + 前端 fieldDiffs 优先）
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }
function sshExec(conn, cmd, timeout = 900000) {
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

  const webDir = 'd:\\开发征收项目\\zscx\\web'
  const remoteWebDir = '/vol2/1000/docker/zscx/web'
  const files = [
    'app/api/data/[tableName]/[id]/snapshots/route.ts',
    'components/snapshot-history-dialog.tsx',
  ]
  console.log('\n1. 上传 2 个更新文件')
  for (const f of files) {
    const content = fs.readFileSync(path.join(webDir, f), 'utf-8')
    await writeRemoteFile(conn, remoteWebDir + '/' + f, content)
    console.log('  ✓', f)
  }

  console.log('\n2. 构建镜像（利用缓存）')
  const b = await sshExec(conn, `cd ${remoteWebDir} && docker build -t zscx-web:local . 2>&1 | tail -6`, 1200000)
  console.log(b.out || b.errOut || 'done')

  console.log('\n3. 重建 web 容器')
  const u = await sshExec(conn, `cd /vol2/1000/docker/zscx/docker && docker compose up -d --build web 2>&1 | tail -10`, 600000)
  console.log(u.out || u.errOut || 'done')

  console.log('\n4. 等待服务就绪')
  let ready = false
  for (let i = 0; i < 40; i++) {
    await new Promise(res => setTimeout(res, 3000))
    const r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login 2>&1', 15000)
    if ((r.out || '').trim() === '200') { ready = true; console.log('  就绪'); break }
  }
  if (!ready) { console.log('❌ 未就绪'); conn.end(); process.exit(1) }

  console.log('\n5. 用真实记录 #62 验证快照 API')
  const v = await sshExec(conn, `
    CAP=$(curl -s http://localhost:777/api/auth/captcha)
    CAPID=$(echo "$CAP" | python3 -c "import sys,json;print(json.load(sys.stdin)['captchaId'])" 2>/dev/null)
    CODE=$(docker exec zscx-redis redis-cli get "captcha:$CAPID" 2>/dev/null | tr -d '\\r\\n')
    TOKEN=$(curl -s -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\",\\"captchaId\\":\\"$CAPID\\",\\"captchaCode\\":\\"$CODE\\"}" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token') or '')" 2>/dev/null)
    curl -s "http://localhost:777/api/data/household/62/snapshots" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('ok=',d.get('ok'),'total=',d.get('total'))
for x in (d.get('data') or []):
    s=x.get('snapshot') or {}
    sr=x.get('syncRequest') or {}
    print(' -', x.get('id'), x.get('action'), '| snapshotId=', s.get('id'), '| fieldDiffs=', (len(sr.get('fieldDiffs') or {}) if isinstance(sr.get('fieldDiffs'),dict) else sr.get('fieldDiffs')))
" 2>&1 | head -15
  `, 60000)
  console.log(v.out || v.errOut)

  conn.end()
  console.log('\n✅ 增量部署完成')
}
run().catch(e => { console.error('❌ 失败:', e.message); process.exit(1) })
