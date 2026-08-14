const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  try {
    // 杀掉残留的 prune 和 build 进程
    console.log('=== 清理残留进程 ===');
    let r = await sshExec(conn, `ps aux | grep -E "docker build|docker buildx|docker prune" | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>&1; echo "done"`);
    console.log(r.out);
    await new Promise(res => setTimeout(res, 2000));

    // 检查 docker-compose.yml 的 build context
    r = await sshExec(conn, 'grep "context:" /vol2/1000/docker/zscx/docker/docker-compose.yml');
    console.log('docker/ docker-compose context:', r.out);

    // 在后台运行 docker compose up -d --build，输出到日志文件
    console.log('\n=== 在后台启动构建和容器 ===');
    r = await sshExec(conn, `cd /vol2/1000/docker/zscx && nohup docker compose -f docker/docker-compose.yml up -d --build > /tmp/docker-build.log 2>&1 & echo "PID: $!"`);
    console.log(r.out);

    // 等待 5 分钟让构建进行
    console.log('\n等待 5 分钟让构建进行...');
    await new Promise(res => setTimeout(res, 300000));

    // 检查构建日志
    console.log('\n=== 构建日志 (最后 100 行) ===');
    r = await sshExec(conn, 'tail -100 /tmp/docker-build.log 2>&1');
    console.log(r.out);

    // 检查容器状态
    console.log('\n=== 容器状态 ===');
    r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1');
    console.log(r.out);

    // 检查是否还在构建
    r = await sshExec(conn, 'ps aux | grep -E "docker build|docker buildx" | grep -v grep 2>&1');
    if (r.out) {
      console.log('\n构建仍在运行中...');
    } else {
      console.log('\n构建已完成');
    }

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  conn.end();
  console.log('\n=== 连接关闭。构建仍在后台运行 ===');
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

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });