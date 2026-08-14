const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  // 读取两个docker-compose文件
  let r = await sshExec(conn, 'cat /vol2/1000/docker/zscx/docker-compose.yml 2>&1');
  console.log('=== 根目录 docker-compose.yml ===\n' + r.out);

  r = await sshExec(conn, 'cat /vol2/1000/docker/zscx/docker/docker-compose.yml 2>&1');
  console.log('=== docker/ 子目录 docker-compose.yml ===\n' + r.out);

  // 检查 web 目录的绝对路径
  r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && realpath web 2>&1 || pwd');
  console.log('=== web 目录绝对路径 ===\n' + r.out);

  // 检查docker volume
  r = await sshExec(conn, 'docker volume ls --format "{{.Name}}" 2>&1');
  console.log('=== Docker Volumes ===\n' + r.out);

  // 检查node_modules
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/web/node_modules/.package-lock.json 2>&1 && echo "node_modules exists" || echo "node_modules missing"');
  console.log('\n=== node_modules ===\n' + r.out);

  conn.end();
}

function sshExec(conn, cmd, timeout = 30000) {
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