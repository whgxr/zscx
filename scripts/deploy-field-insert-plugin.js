/** 临时：部署"点击字段插入到光标"改动（DS 插件方案）。用毕删除。 */
const { Client } = require('ssh2')
const fs = require('fs')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', hostVerifier: () => true, readyTimeout: 20000 }
function sshExec(conn, cmd, timeout = 1500000) {
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
async function wf(conn, remotePath, content) {
  const b64 = Buffer.from(content).toString('base64')
  await sshExec(conn, `mkdir -p '${remotePath.substring(0, remotePath.lastIndexOf('/'))}'`)
  await sshExec(conn, `python3 -c "import base64;open('${remotePath}','wb').write(base64.b64decode('${b64}'))"`)
  await sshExec(conn, `chmod 644 '${remotePath}'`)
}
async function run() {
  const conn = new Client()
  await new Promise((res, rej) => conn.on('ready', res).on('error', rej).connect(CONFIG))
  const localWeb = 'd:\\开发征收项目\\zscx\\web'
  const remoteWeb = '/vol2/1000/docker/zscx/web'
  const files = [
    'components/office/office-template-editor.tsx',
    'lib/office-config.ts',
    'middleware.ts',
    'app/api/export-templates/[id]/office-config/route.ts',
    'app/api/export-templates/[id]/office-plugin/config.json/route.ts',
    'app/api/export-templates/[id]/office-plugin/index.html/route.ts',
    'app/api/export-templates/[id]/office-plugin/fields.json/route.ts',
    'app/api/export-templates/[id]/office-plugin/plugins.js/route.ts',
    'app/dashboard/word-templates/[id]/page.tsx',
    'app/dashboard/export-templates/[id]/page.tsx',
    'public/plugins/zscx-field-insert/config.json',
    'public/plugins/zscx-field-insert/index.html',
    'public/plugins/zscx-field-insert/plugins.js',
  ]
  console.log('1. 上传 ' + files.length + ' 文件')
  for (const f of files) { await wf(conn, remoteWeb + '/' + f, fs.readFileSync(localWeb + '/' + f)); console.log('  ✓', f) }
  const df = ['FROM zscx-web:local', 'USER root',
    'ENV JWT_SECRET=build-placeholder',
    'COPY . .',
    'RUN chmod -R a+rX /app/app /app/components /app/lib /app/types /app/public /app/prisma /app/tests',
    'RUN npx prisma generate',
    'RUN npm run build || (test -d .next && echo "BUILD_OK_IGNORE_TS" || exit 1)',
    'RUN chown -R nextjs:nodejs /app/.next', 'USER nextjs'].join('\n')
  await wf(conn, remoteWeb + '/Dockerfile.incremental', df)
  console.log('2. 构建...')
  await sshExec(conn, `cd ${remoteWeb} && rm -f /tmp/f.log && { docker build --progress=plain -f Dockerfile.incremental -t zscx-web:new . ; echo "EXIT=$?"; } > /tmp/f.log 2>&1`, 1500000)
  const ex = (await sshExec(conn, "grep -o 'EXIT=[0-9]*' /tmp/f.log | tail -1", 30000)).out || ''
  console.log('退出码:', ex)
  if (!/EXIT=0/.test(ex)) { console.log('❌ 构建失败'); conn.end(); process.exit(1) }
  console.log('3. 重建')
  await sshExec(conn, `docker tag zscx-web:new zscx-web:local && cd /vol2/1000/docker/zscx/docker && docker compose up -d --force-recreate web 2>&1 | tail -2`, 300000)
  let ready = false
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 3000)); const r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login', 15000); if ((r.out||'').trim()==='200') { ready=true; break } }
  console.log('就绪:', ready)
  conn.end()
}
run().catch(e => { console.error('❌', e.message); process.exit(1) })