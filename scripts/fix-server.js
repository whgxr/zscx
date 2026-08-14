const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );

  try {
    // 1. 修复 docker-compose.yml 的 build context 路径
    console.log('=== 1. 修复 docker-compose.yml build context ===');
    let r = await sshExec(conn, 'sed -i "s|context: \\.\\./web|context: ./web|" /vol2/1000/docker/zscx/docker-compose.yml');
    r = await sshExec(conn, 'grep "context:" /vol2/1000/docker/zscx/docker-compose.yml');
    console.log(r.out);

    // 2. 清理 dangling 镜像释放空间
    console.log('\n=== 2. 清理 dangling 镜像 ===');
    r = await sshExec(conn, 'docker image prune -f 2>&1');
    console.log(r.out);

    // 3. 构建 Docker 镜像
    console.log('\n=== 3. 开始构建镜像 (预计 5-10 分钟) ===');
    r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker build -t zscx-web:local ./web 2>&1', 600000);
    // 只显示最后 100 行
    const lines = r.out.split('\n');
    console.log('总行数:', lines.length);
    console.log('最后 100 行:\n' + lines.slice(-100).join('\n'));

    if (r.out.includes('Successfully built') || r.out.includes('Successfully tagged')) {
      console.log('\n=== 构建成功！ ===');

      // 4. 启动容器
      console.log('\n=== 4. 启动容器 ===');
      r = await sshExec(conn, 'cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml up -d 2>&1', 120000);
      console.log(r.out);

      // 5. 等待启动
      console.log('\n等待 30 秒让服务启动...');
      await new Promise(res => setTimeout(res, 30000));

      // 6. 检查容器状态
      console.log('\n=== 5. 容器状态 ===');
      r = await sshExec(conn, 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"');
      console.log(r.out);

      // 7. 检查 Web 日志
      console.log('\n=== 6. Web 日志 (最后 30 行) ===');
      r = await sshExec(conn, 'docker logs --tail 30 zscx-web 2>&1');
      console.log(r.out);

      // 8. 测试 API
      console.log('\n=== 7. 测试 API ===');
      r = await sshExec(conn, 'docker exec zscx-web node -e "const http=require(\'http\');http.get(\'http://localhost:3000/api/auth/third-party/platforms\',(res)=>{let d=\'\';res.on(\'data\',c=>d+=c);res.on(\'end\',()=>console.log(d))}).on(\'error\',e=>console.log(\'ERR:\',e.message))" 2>&1');
      console.log(r.out);
    } else {
      console.log('\n=== 构建失败！检查错误信息 ===');
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