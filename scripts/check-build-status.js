const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  // 检查是否有 docker build 进程
  let r = await sshExec(conn, 'ps aux | grep -E "docker|build" | grep -v grep 2>&1');
  console.log('=== 运行中的 Docker/Build 进程 ===\n' + (r.out || '(无)'));

  // 检查容器状态
  r = await sshExec(conn, 'docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>&1');
  console.log('\n=== 容器状态 ===\n' + (r.out || '(无)'));

  // 检查 zscx-web:local 镜像
  r = await sshExec(conn, 'docker images zscx-web:local --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" 2>&1');
  console.log('\n=== zscx-web:local 镜像 ===\n' + (r.out || '(不存在)'));

  conn.end();
}

function sshExec(conn, cmd, timeout = 30000) {
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