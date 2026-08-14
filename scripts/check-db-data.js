const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== 数据库表 ==="
docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "USE zscx; SHOW TABLES;" 2>&1 | grep -v Warning

echo "=== User 表 ==="
docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "USE zscx; SELECT id, username, roleId, status FROM User;" 2>&1 | grep -v Warning

echo "=== Role 表 ==="
docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "USE zscx; SELECT id, name FROM Role;" 2>&1 | grep -v Warning

echo "=== IntegrationConfig 表 ==="
docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "USE zscx; SELECT id, platform, status FROM IntegrationConfig;" 2>&1 | grep -v Warning

echo "=== 磁盘空间 ==="
df -h / 2>&1
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));