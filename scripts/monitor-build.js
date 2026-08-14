const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec('echo "=== 构建进程 ==="; ps aux | grep -E "docker build|docker compose" | grep -v grep | head -5; echo "=== 日志大小 ==="; wc -c /tmp/build-output.log 2>/dev/null; echo "=== 最后 20 行 ==="; tail -20 /tmp/build-output.log 2>/dev/null; echo "=== 镜像 ==="; docker images zscx-web:local --format "size={{.Size}}" 2>/dev/null; echo "=== 容器 ==="; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null', (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));