const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );
  console.log('=== 已连接到服务器 ===\n');

  // 检查容器状态
  const { out: ps } = await sshExec(conn, 'docker ps -a --filter name=zscx --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1');
  console.log('--- 容器状态 ---\n' + (ps || '(无)'));

  // 检查zscx目录
  const { out: ls } = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/ 2>&1');
  console.log('\n--- 项目目录 ---\n' + ls);

  // 检查docker-compose
  const { out: dc } = await sshExec(conn, 'cat /vol2/1000/docker/zscx/docker/docker-compose.yml 2>&1');
  console.log('\n--- docker-compose.yml ---\n' + dc);

  // 检查磁盘
  const { out: df } = await sshExec(conn, 'df -h / 2>&1');
  console.log('\n--- 磁盘空间 ---\n' + df);

  // 检查端口占用
  const { out: ports } = await sshExec(conn, 'ss -tlnp | grep -E ":777|:666|:3306" 2>&1');
  console.log('\n--- 端口占用 ---\n' + (ports || '(无)'));

  // 检查MySQL容器
  const { out: mysql } = await sshExec(conn, 'docker inspect zscx-mysql --format "{{.State.Status}}" 2>&1');
  console.log('\n--- MySQL容器状态 ---\n' + mysql);

  // 检查zscx2的容器（避免误操作）
  const { out: zscx2 } = await sshExec(conn, 'docker ps -a --filter name=zscx2 --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1');
  console.log('\n--- zscx2 容器状态 ---\n' + (zscx2 || '(无)'));

  // 检查Docker镜像
  const { out: images } = await sshExec(conn, 'docker images zscx-web:local docker-web:latest --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" 2>&1');
  console.log('\n--- Docker镜像 ---\n' + (images || '(无)'));

  conn.end();
  console.log('\n=== 检查完成 ===');
}

function sshExec(conn, cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let out = '', errOut = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { errOut += d.toString(); });
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }); });
    });
  });
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });