const { Client } = require('ssh2')
const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
}

function sshExec(conn, cmd, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout '+timeout+'ms')), timeout)
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err) }
      let out='', errOut=''
      stream.on('data', d => { out += d.toString() })
      stream.stderr.on('data', d => { errOut += d.toString() })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }) })
      stream.on('error', (e) => { clearTimeout(timer); reject(e) })
    })
  })
}

async function run() {
  const conn = new Client()
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect(CONFIG)
  })
  console.log('Connected')

  // 1. 先启动 MySQL（不占用 3306 外部端口）
  console.log('==== 启动 MySQL ====')
  let r = await sshExec(conn, `docker run -d --name zscx-mysql \
    -e MYSQL_ROOT_PASSWORD=root123456 \
    -e MYSQL_DATABASE=zscx \
    -e MYSQL_USER=zscx \
    -e MYSQL_PASSWORD=zscx123456 \
    -v mysql_data:/var/lib/mysql \
    -v /vol2/1000/docker/zscx/docker/mysql/my.cnf:/etc/mysql/conf.d/my.cnf \
    --network zscx_default \
    mysql:5.7 \
    --character-set-server=utf8mb4 \
    --collation-server=utf8mb4_unicode_ci \
    --max_connections=1000 \
    --explicit_defaults_for_timestamp=true 2>&1`)
  console.log('MySQL start:', r.out || r.errOut)

  // 等待 MySQL 启动
  await new Promise(res => setTimeout(res, 15000))

  // 2. 检查 MySQL
  console.log('\n==== 检查 MySQL 数据 ====')
  r = await sshExec(conn, `docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SHOW TABLES FROM zscx;" 2>&1 | grep -v Warning`)
  console.log('Tables:\n' + r.out)

  r = await sshExec(conn, `docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT * FROM zscx.IntegrationConfig\\G" 2>&1 | grep -v Warning`)
  console.log('IntegrationConfig:\n' + r.out)

  // 3. 如果 IntegrationConfig 没有数据，重新插入
  r = await sshExec(conn, `docker exec zscx-mysql mysql -uzscx -p"zscx123456" -e "SELECT COUNT(*) AS cnt FROM zscx.IntegrationConfig;" 2>&1 | grep -v Warning`)
  console.log('Count:', r.out)

  // 4. 启动 Web 容器（使用 fix 镜像，带 --no-lint 构建）
  console.log('\n==== 启动 Web 容器 ====')
  r = await sshExec(conn, `docker run -d --name zscx-web \
    --network zscx_default \
    -p 666:3000 \
    -e DATABASE_URL="mysql://zscx:zscx123456@zscx-mysql:3306/zscx" \
    -e JWT_SECRET="REDACTED_JWT" \
    -e JWT_EXPIRES_IN="7d" \
    -e COOKIE_SECURE="false" \
    -e UPLOAD_DIR="./public/uploads" \
    -e MAX_FILE_SIZE="10485760" \
    -e NEXT_PUBLIC_APP_NAME="房屋征收调查系统" \
    -e NEXT_PUBLIC_BASE_URL="http://REDACTED_IP:666" \
    -e NODE_ENV=production \
    docker-web:latest \
    sh -c "node prisma/docker-migrate.js && npm start" 2>&1`)
  console.log('Web start:', r.out || r.errOut)

  // 5. 等待 Web 启动
  await new Promise(res => setTimeout(res, 20000))

  // 6. 查看日志
  console.log('\n==== Web 日志 ====')
  r = await sshExec(conn, 'docker logs --tail 40 zscx-web 2>&1')
  console.log(r.out)

  // 7. 测试 API
  console.log('\n==== 测试 API ====')
  r = await sshExec(conn, 'docker exec zscx-web curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1 || docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo "No curl/wget, use node"')
  if (r.out && r.out.startsWith('{')) {
    console.log('API response:', r.out)
  } else {
    // 用 node 测试
    r = await sshExec(conn, `docker exec zscx-web node -e "
    const http = require('http');
    http.get('http://localhost:3000/api/auth/third-party/platforms', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => console.log('API:', data));
    }).on('error', (e) => console.log('ERR:', e.message));
    " 2>&1`)
    console.log(r.out)
  }

  // 8. 容器状态
  console.log('\n==== 最终容器状态 ====')
  r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"')
  console.log(r.out)

  conn.end()
}

run().catch(e => console.error(e))
