/**
 * 部署登录验证码功能到测试服务器并验证
 * - 上传改动文件到 /vol2/1000/docker/zscx/web
 * - 从 /vol2/1000/docker/zscx/web 构建 zscx-web:local 镜像
 * - 在 docker-nas 项目强制重建 web 容器（现有容器归属 docker-nas）
 * - 验证验证码 API 与登录流程
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 600000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
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
  const nasDir = '/vol2/1000/docker/zscx/docker-nas'

  // 1. 上传改动文件
  const filesToUpload = [
    'Dockerfile',
    'lib/captcha-store.ts',
    'app/api/auth/captcha/route.ts',
    'app/api/auth/login/route.ts',
    'app/login/page.tsx',
    'app/h5/login/page.tsx',
  ]

  console.log('1. 上传文件到服务器')
  for (const file of filesToUpload) {
    const localPath = path.join(webDir, file)
    const remotePath = remoteWebDir + '/' + file
    const content = fs.readFileSync(localPath, 'utf-8')
    await writeRemoteFile(conn, remotePath, content)
    console.log(`  ✓ ${file}`)
  }

  // 2. 清理可能卡住的旧构建进程，并从 web 源码构建本地镜像
  console.log('\n2. 清理卡住的旧构建并构建 zscx-web:local 镜像...')
  r = await sshExec(conn, 'pkill -f "docker build" 2>/dev/null; pkill -f "apk add" 2>/dev/null; sleep 2; echo cleaned', 30000)
  r = await sshExec(conn, `ls ${remoteWebDir}/fonts/DejaVuSans.ttf 2>&1 && echo "fonts ok"`)
  console.log((r.out || r.errOut || '').trim())
  r = await sshExec(conn, `cd ${remoteWebDir} && docker build -t zscx-web:local . 2>&1 | tail -8`, 900000)
  console.log(r.out || r.errOut || 'done')

  // 3. 在 docker-nas 项目强制重建 web 容器（使用新镜像）
  console.log('\n3. 强制重建 web 容器...')
  r = await sshExec(conn, `cd ${nasDir} && docker compose up -d --force-recreate web 2>&1 | tail -15`, 300000)
  console.log(r.out || r.errOut || 'done')

  // 4. 等待服务就绪
  console.log('\n4. 等待服务就绪...')
  let ready = false
  for (let i = 0; i < 30; i++) {
    await new Promise(res => setTimeout(res, 3000))
    r = await sshExec(conn, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:777/login 2>&1', 15000)
    const code = (r.out || '').trim()
    if (code === '200') { console.log('  服务已就绪（HTTP 200）'); ready = true; break }
    if (i === 29) console.log('  注意：未等到 200，当前状态码 =', code)
  }
  if (!ready) { conn.end(); console.log('❌ 服务未就绪，终止验证'); process.exit(1) }

  // 5. 验证验证码 API
  console.log('\n5. 验证验证码 API')
  r = await sshExec(conn, 'curl -s http://localhost:777/api/auth/captcha 2>&1 | head -c 200', 30000)
  console.log('  返回:', (r.out || '').slice(0, 160))
  const outText = r.out || ''
  if (outText.includes('captchaId') && outText.includes('data:image/png;base64,')) {
    console.log('  ✓ 验证码 API 正常，返回 captchaId + PNG 图片')
  } else {
    console.log('  ✗ 验证码 API 返回格式异常')
  }

  // 6. 验证验证码图片包含可辨识文字像素（修复字体后应>1000）
  console.log('\n6. 验证验证码图片文字像素（应明显 > 0）')
  r = await sshExec(conn, `
    curl -s http://localhost:777/api/auth/captcha -o /tmp/cap.json 2>&1
    python3 -c "import json,base64; d=json.load(open('/tmp/cap.json')); open('/tmp/cap.png','wb').write(base64.b64decode(d['image'].split(',',1)[1])); print('saved png')"
    docker cp /tmp/cap.png zscx-web:/tmp/cap.png 2>&1
    docker exec zscx-web node -e "
      const sharp=require('/app/node_modules/sharp');
      sharp('/tmp/cap.png').raw().toBuffer({resolveWithObject:true}).then(({data,info})=>{
        const colors=new Set(); let textPx=0;
        for(let i=0;i<data.length;i+=info.channels){
          colors.add(data[i]+','+data[i+1]+','+data[i+2]);
          const r=data[i],g=data[i+1],b=data[i+2];
          const sat=Math.max(r,g,b)-Math.min(r,g,b);
          if(sat>60 && (r>120||g>120||b>120)) textPx++;
        }
        console.log('unique colors:',colors.size,'| 文字像素:',textPx);
      }).catch(e=>{console.error('ERR',e.message);process.exit(1)});
    " 2>&1
  `, 60000)
  console.log(r.out || r.errOut)

  // 7. 验证无验证码登录被拒绝
  console.log('\n7. 验证无验证码登录（应被拒绝）')
  r = await sshExec(conn, 'curl -s -w "\\nHTTP:%{http_code}" -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d \'{"username":"admin","password":"admin123"}\' 2>&1 | head -c 300', 30000)
  console.log('  返回:', r.out)

  // 8. 验证错误验证码被拒绝
  console.log('\n8. 验证错误验证码登录（应被拒绝）')
  r = await sshExec(conn, 'curl -s -w "\\nHTTP:%{http_code}" -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d \'{"username":"admin","password":"admin123","captchaId":"cap_fake123","captchaCode":"XXXX"}\' 2>&1 | head -c 300', 30000)
  console.log('  返回:', r.out)

  // 9. 验证码 + 正确凭据完整登录
  console.log('\n9. 验证 验证码+正确凭据 登录（应成功）')
  r = await sshExec(conn, `
    CAP=$(curl -s http://localhost:777/api/auth/captcha)
    CAPID=$(echo "$CAP" | python3 -c "import sys,json;print(json.load(sys.stdin)['captchaId'])")
    CODE=$(docker exec zscx-redis redis-cli get "captcha:$CAPID" 2>/dev/null | tr -d '\\r\\n')
    echo "captchaId=$CAPID code=$CODE"
    echo "--- login result ---"
    curl -s -w "\\nHTTP:%{http_code}" -X POST http://localhost:777/api/auth/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"admin123\\",\\"captchaId\\":\\"$CAPID\\",\\"captchaCode\\":\\"$CODE\\"}" | head -c 300
    echo ""
  `, 60000)
  console.log(r.out || r.errOut)

  conn.end()
  console.log('\n✅ 部署与验证完成')
}

run().catch(err => { console.error('❌ 部署失败:', err); process.exit(1) })
