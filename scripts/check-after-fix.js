const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  // 检查 docker build 进程
  let r = await sshExec(conn, 'ps aux | grep -E "docker build|docker buildx" | grep -v grep 2>&1');
  console.log('=== Docker Build 进程 ===\n' + (r.out || '(无)'));

  // 检查 zscx-web:local 镜像
  r = await sshExec(conn, 'docker images zscx-web:local --format "{{.Size}}" 2>&1');
  console.log('\n=== zscx-web:local 镜像大小 ===\n' + (r.out || '(不存在)'));

  // 检查现有镜像
  r = await sshExec(conn, 'docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" 2>&1');
  console.log('\n=== 所有镜像 ===\n' + r.out);

  // 检查磁盘
  r = await sshExec(conn, 'df -h / 2>&1');
  console.log('\n=== 磁盘空间 ===\n' + r.out);

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