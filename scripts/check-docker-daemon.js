const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== Docker info ==="
docker info 2>&1 | head -20
echo "=== Docker ps ==="
docker ps 2>&1
echo "=== Docker disk usage ==="
docker system df 2>&1
echo "=== Running processes ==="
ps aux | grep -E "docker|build" | grep -v grep | head -10
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));