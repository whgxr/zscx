const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 });
conn.on('ready', () => {
  conn.exec('ps aux | grep -E "docker compose|docker build" | grep -v grep 2>&1; echo "==="; cat /tmp/docker-build.log 2>&1; echo "==="; ls -la /vol2/1000/docker/zscx/docker/docker-compose.yml 2>&1', (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));