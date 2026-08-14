const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== 检查容器内 .env 文件 ==="
docker exec zscx-web cat /app/.env 2>&1

echo "=== 检查容器内环境变量 ==="
docker exec zscx-web sh -c "echo DATABASE_URL=\$DATABASE_URL" 2>&1

echo "=== 检查 old mysql_data volume ==="
docker run --rm -v mysql_data:/data alpine ls /data/mysql/zscx/ 2>&1 | head -5

echo "=== 检查 new docker_mysql_data volume ==="
docker run --rm -v docker_mysql_data:/data alpine ls /data/mysql/zscx/ 2>&1 | head -5
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));