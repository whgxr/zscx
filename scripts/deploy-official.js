/** 可靠部署：清构建缓存后，用官方 Dockerfile 完整构建（含搜索框+baseUrl），重建容器并验证 .next 产物。 */
const { Client } = require('ssh2')
const fs = require('fs')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', hostVerifier: () => true, readyTimeout: 20000 }
async function wf(conn, remotePath, content) {
  const b64 = Buffer.from(content).toString('base64')
  await sshExec(conn, `mkdir -p '${remotePath.substring(0, remotePath.lastIndexOf('/'))}'`)
  await sshExec(conn, `python3 -c "import base64;open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
  await sshExec(conn, `chmod 644 '${remotePath}'`)
}
function sshExec(conn, cmd, timeout = 1800000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = '', errOut = ''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', () => resolve({ out, errOut }))
    })
  })
}
async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  console.log('0. 确保 3 个源文件最新，用 Python 校验搜索字段')
  const localWeb = 'd:\\开发征收项目\\zscx\\web'
  const remoteWeb = '/vol2/1000/docker/zscx/web'
  const files = [
    'lib/office-config.ts',
    'app/api/export-templates/[id]/office-config/route.ts',
    'components/office/office-template-editor.tsx',
  ]
  for (const f of files) {
    await wf(conn, remoteWeb + '/' + f, fs.readFileSync(localWeb + '/' + f))
  }
  r = await sshExec(conn, `python3 - <<'PY'
ok=False
data=open('/vol2/1000/docker/zscx/web/components/office/office-template-editor.tsx','rb').read()
print('comp_len', len(data), 'has_search_field', ('\u641c\u7d22\u5b57\u6bb5'.encode('utf-8') in data))
PY`, 30000)
  console.log(r.out || r.errOut)
  console.log('确认官方 Dockerfile 存在')
  r = await sshExec(conn, "ls -la /vol2/1000/docker/zscx/web/Dockerfile 2>&1", 30000)
  console.log(r.out || r.errOut)
  console.log('2. 官方 Dockerfile 构建（带缓存，复用 deps 层，较快）...')
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx/web && rm -f /tmp/official.log && { docker build --progress=plain -t zscx-web:new . ; echo "BUILD_EXIT=$?"; } > /tmp/official.log 2>&1', 1800000)
  const ex = (await sshExec(conn, "grep -o 'BUILD_EXIT=[0-9]*' /tmp/official.log | tail -1", 30000)).out || ''
  console.log('退出码:', ex.trim())
  if (!/BUILD_EXIT=0/.test(ex)) {
    console.log('❌ 构建失败。日志尾部：')
    console.log((await sshExec(conn, "tail -50 /tmp/official.log", 30000)).out)
    conn.end(); process.exit(1)
  }
  console.log('3. 校验新镜像 .next 含搜索字段')
  // 用 python 在 sh 里搜 utf8
  r = await sshExec(conn, `docker run --rm --entrypoint sh zscx-web:new -c 'python3 - <<\\'PY\\'
import glob
key=b"\\xe6\\x90\\x9c\\xe7\\xb4\\xa2\\xe5\\xad\\x97"
n=0
for f in glob.glob("/app/.next/static/chunks/**/*.js",recursive=True):
    if key in open(f,"rb").read(): n+=1
print("searchFieldsFiles",n)
PY'`, 120000)
  console.log('新镜像搜索字段命中:', (r.out||'(err)'))
  console.log('4. 重建容器')
  await sshExec(conn, `docker tag zscx-web:new zscx-web:local && cd /vol2/1000/docker/zscx/docker && docker compose up -d --force-recreate web 2>&1 | tail -3`, 300000)
  let ready = false
  for (let i = 0; i < 100; i++) { await new Promise(rr => setTimeout(rr, 3000)); const rr = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login', 15000); if ((rr.out||'').trim()==='200') { ready=true; break } }
  console.log('服务就绪:', ready)
  r = await sshExec(conn, "docker ps --filter name=zscx-web --format '{{.Image}} {{.CreatedAt}} {{.Status}}'", 30000)
  console.log('容器现况:', r.out)
  conn.end()
}
run().catch(e => { console.error('❌', e.message); process.exit(1) })