const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 });
conn.on('ready', () => {
  conn.exec('tail -30 /tmp/docker-build.log 2>&1; echo "==="; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1; echo "==="; docker images zscx-web:local --format "size={{.Size}}" 2>&1', (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));