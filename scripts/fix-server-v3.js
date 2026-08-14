const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  try {
    // 1. 杀掉所有 docker build 进程
    console.log('=== 1. 杀掉残留的 docker build 进程 ===');
    let r = await sshExec(conn, `ps aux | grep -E "docker build|docker buildx" | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>&1; echo "已清理"`);
    console.log(r.out);
    await new Promise(res => setTimeout(res, 2000));

    // 2. 确认没有残留进程
    r = await sshExec(conn, 'ps aux | grep -E "docker build|docker buildx" | grep -v grep 2>&1');
    console.log('残留进程:', r.out || '(无)');

    // 3. 清理旧容器
    console.log('\n=== 2. 清理旧容器 ===');
    r = await sshExec(conn, 'docker rm -f zscx-web zscx-mysql 2>/dev/null; echo "done"');
    console.log(r.out);

    // 4. 删除旧的构建缓存
    console.log('\n=== 3. 清理 BuildKit 缓存 ===');
    r = await sshExec(conn, 'docker buildx prune -f 2>&1');
    console.log(r.out);

    // 5. 重新构建镜像（使用 --no-cache 避免缓存问题）
    console.log('\n=== 4. 开始构建镜像 ===');
    r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web 2>&1', 600000);
    const lines = r.out.split('\n');
    console.log('总行数:', lines.length);
    console.log('最后 100 行:\n' + lines.slice(-100).join('\n'));

    if (r.out.includes('Successfully built') || r.out.includes('Successfully tagged')) {
      console.log('\n=== 构建成功！ ===');

      // 6. 启动容器
      console.log('\n=== 5. 启动容器 ===');
      r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1', 120000);
      console.log(r.out);

      // 7. 等待服务启动
      console.log('\n等待 30 秒...');
      await new Promise(res => setTimeout(res, 30000));

      // 8. 检查状态
      console.log('\n=== 6. 容器状态 ===');
      r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
      console.log(r.out);

      console.log('\n=== 7. Web 日志 ===');
      r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1');
      console.log(r.out);

      // 9. 测试 API
      console.log('\n=== 8. 测试 API ===');
      r = await sshExec(conn, 'curl -s http://localhost:3000/api/auth/third-party/platforms 2>&1');
      console.log(r.out);
    } else {
      console.log('\n=== 构建失败！检查上面输出中的错误 ===');
    }
  } catch(e) {
    console.error('ERROR:', e.message);
  }
  conn.end();
}

function sshExec(conn, cmd, timeout = 600000) {
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