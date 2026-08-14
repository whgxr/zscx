const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  // 检查构建进程
  let r = await sshExec(conn, 'ps aux | grep -E "docker compose|docker build" | grep -v grep 2>&1');
  console.log('=== Docker 进程 ===\n' + (r.out || '(无)'));
  
  // 检查构建日志
  r = await sshExec(conn, 'ls -la /tmp/docker-build.log 2>&1; echo "---"; cat /tmp/docker-build.log 2>&1 | head -50');
  console.log('\n=== 构建日志 ===\n' + r.out);

  // 检查容器
  r = await sshExec(conn, 'docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" 2>&1');
  console.log('\n=== 容器 ===\n' + (r.out || '(无)'));

  // 检查 zscx-web:local 镜像
  r = await sshExec(conn, 'docker images zscx-web:local --format "{{.Size}}" 2>&1');
  console.log('\n=== zscx-web:local ===\n' + (r.out || '(不存在)'));

  conn.end();
}

function sshExec(conn, cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = '', errOut = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { errOut += d.toString(); });
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }); });
    });
  });
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });