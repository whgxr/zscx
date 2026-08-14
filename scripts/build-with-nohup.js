const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
set -x
cd /vol2/1000/docker/zscx
# 先修复 docker-compose.yml 的 build context
sed -i 's|context: \\.\\./web|context: ./web|' docker-compose.yml
echo "context fixed: $(grep context docker-compose.yml)"

# 用 setsid 完全脱离终端，后台构建
nohup setsid bash -c '
  cd /vol2/1000/docker/zscx
  docker build -t zscx-web:local ./web 2>&1 | tee /tmp/build-output.log
  echo "BUILD_EXIT_CODE: $?" >> /tmp/build-output.log
  if [ $? -eq 0 ]; then
    docker compose -f docker/docker-compose.yml up -d 2>&1 | tee -a /tmp/build-output.log
    echo "CONTAINER_STARTED" >> /tmp/build-output.log
  fi
' > /tmp/build-nohup.log 2>&1 &
echo "BUILD_STARTED"
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));