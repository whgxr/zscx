const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== 容器环境变量 ==="
docker inspect zscx-web --format '{{range .Config.Env}}{{println .}}{{end}}' 2>&1

echo ""
echo "=== docker-compose 文件位置 ==="
ls -la /vol2/1000/docker/zscx/docker/docker-compose.yml

echo ""
echo "=== 当前 compose 项目 ==="
cd /vol2/1000/docker/zscx && docker compose -f docker/docker-compose.yml ps 2>&1
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));