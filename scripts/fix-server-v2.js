const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  try {
    // 1. 检查是否有正在运行的 docker build
    console.log('=== 1. 检查运行中的构建进程 ===');
    let r = await sshExec(conn, 'ps aux | grep -i "docker build" | grep -v grep 2>&1');
    console.log(r.out || '(无运行中的构建)');

    // 2. 先修复 docker-compose.yml
    console.log('\n=== 2. 修复 docker-compose.yml ===');
    r = await sshExec(conn, 'sed -i "s|context: \\.\\./web|context: ./web|" /vol2/1000/docker/zscx/docker-compose.yml');
    r = await sshExec(conn, 'grep "context:" /vol2/1000/docker/zscx/docker-compose.yml');
    console.log(r.out);

    // 3. 停止并删除旧容器（如果有）
    console.log('\n=== 3. 清理旧容器 ===');
    r = await sshExec(conn, 'docker rm -f zscx-web zscx-mysql 2>/dev/null; echo "done"');
    console.log(r.out);

    // 4. 用 docker compose 构建并启动（设置 15 分钟超时）
    console.log('\n=== 4. 构建并启动服务 (docker compose up --build) ===');
    r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d --build 2>&1', 900000);
    const lines = r.out.split('\n');
    console.log('总行数:', lines.length);
    console.log('最后 150 行:\n' + lines.slice(-150).join('\n'));

    if (r.out.includes('Container') || r.out.includes('Started') || r.out.includes('done')) {
      console.log('\n=== 启动成功！等待服务就绪 ===');
    } else {
      console.log('\n=== 可能需要检查日志 ===');
    }
  } catch(e) {
    console.error('ERROR:', e.message);
  }
  conn.end();
}

function sshExec(conn, cmd, timeout = 900000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ' + timeout)), timeout);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); reject(err); return; }
      let out = '', errOut = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { errOut += d.toString(); });
      stream.on('close', (code) => { clearTimeout(timer); resolve({ out, errOut, code }); });
    });
  });
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });