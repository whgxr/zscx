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

  // 1. 查看当前容器
  let r = await sshExec(conn, 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "zscx|CONTAINER"')
  console.log('Containers:\n' + r.out)

  // 2. 查看镜像构建状态
  r = await sshExec(conn, 'docker images | grep web')
  console.log('Images:\n' + r.out)

  // 3. 查看 compose
  r = await sshExec(conn, 'cat /vol2/1000/docker/zscx/docker/docker-compose.yml')
  console.log('Compose:\n' + r.out)

  // 4. 查看 MySQL 环境
  r = await sshExec(conn, 'docker run --rm --network zscx_default mysql:5.7 mysql -uzscx -p"zscx123456" -h zscx-mysql -e "SHOW TABLES FROM zscx LIKE \'IntegrationConfig\'; SELECT COUNT(*) FROM zscx.IntegrationConfig;" 2>&1 | grep -v Warning')
  console.log('MySQL check:\n' + r.out)

  // 5. 如果 IntegrationConfig 没有数据，重新插入
  r = await sshExec(conn, `docker run --rm --network zscx_default mysql:5.7 mysql -uzscx -p"zscx123456" -h zscx-mysql -e "SELECT * FROM zscx.IntegrationConfig\\G" 2>&1 | grep -v Warning`)
  console.log('IntegrationConfig data:\n' + r.out)

  // 6. 查看 web 容器日志
  r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1')
  console.log('Web logs:\n' + r.out)

  // 7. 测试 API
  r = await sshExec(conn, 'docker run --rm --network zscx_default curlimages/curl:latest sh -c "curl -s http://zscx-web:3000/api/auth/third-party/platforms" 2>&1')
  console.log('API call:\n' + r.out)

  conn.end()
}

run().catch(e => console.error(e))
