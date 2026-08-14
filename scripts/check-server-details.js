const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => 
    conn.on('ready', res).on('error', rej).connect({
      host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD'
    })
  );
  console.log('=== 已连接 ===\n');

  // 检查docker-compose位置
  let r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/docker-compose.yml 2>&1');
  console.log('--- 根目录docker-compose ---\n' + r.out);
  
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/docker/docker-compose.yml 2>&1');
  console.log('\n--- docker子目录docker-compose ---\n' + r.out);

  // 检查web目录
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/web/ 2>&1');
  console.log('\n--- web目录 ---\n' + r.out);
  
  // 检查Dockerfile
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/web/Dockerfile 2>&1');
  console.log('\n--- Dockerfile ---\n' + r.out);

  // 检查prisma目录
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/web/prisma/ 2>&1');
  console.log('\n--- prisma目录 ---\n' + r.out);

  // 检查app/api目录
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/web/app/api/ 2>&1');
  console.log('\n--- API目录 ---\n' + r.out);

  // 检查所有容器
  r = await sshExec(conn, 'docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>&1');
  console.log('\n--- 所有容器 ---\n' + r.out);

  // 检查Docker镜像
  r = await sshExec(conn, 'docker images --format "table {{.Repository}}:{{.Tag}}\t{{.CreatedAt}}\t{{.Size}}" 2>&1');
  console.log('\n--- Docker镜像 ---\n' + r.out);

  // 检查是否有docker-compose命令可用
  r = await sshExec(conn, 'which docker-compose 2>&1; docker compose version 2>&1');
  console.log('\n--- Docker Compose ---\n' + r.out);

  // 检查MySQL数据
  r = await sshExec(conn, 'ls -la /vol2/1000/docker/zscx/mysql/ 2>&1');
  console.log('\n--- MySQL配置 ---\n' + r.out);

  // 检查docker network
  r = await sshExec(conn, 'docker network ls --format "{{.Name}}" 2>&1');
  console.log('\n--- Docker网络 ---\n' + r.out);

  // 检查磁盘inode
  r = await sshExec(conn, 'df -i / 2>&1');
  console.log('\n--- Inode使用 ---\n' + r.out);

  conn.end();
  console.log('\n=== 检查完成 ===');
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