const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== 直接测试 API ==="
docker exec zscx-web sh -c "node -e 'const http=require(\"http\");http.get(\"http://localhost:3000/api/auth/third-party/platforms\",(r)=>{let d=\"\";r.on(\"data\",c=>d+=c);r.on(\"end\",()=>console.log(d))}).on(\"error\",e=>console.log(\"ERR:\",e.message))'" 2>&1

echo ""
echo "=== 测试登录 API ==="
docker exec zscx-web sh -c "curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin123\"}' 2>&1" 2>&1

echo ""
echo "=== 检查 .env ==="
docker exec zscx-web sh -c "ls -la /app/.env 2>&1; echo '---'; cat /app/.env 2>&1" 2>&1

echo ""
echo "=== 检查环境变量 ==="
docker exec zscx-web sh -c "env | grep DATABASE" 2>&1
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));