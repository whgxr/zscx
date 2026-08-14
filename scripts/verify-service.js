const { Client } = require('ssh2');
const conn = new Client();
conn.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 });
conn.on('ready', () => {
  conn.exec(`
echo "=== Web 日志 (最后 30 行) ==="
docker logs --tail 30 zscx-web 2>&1

echo "=== API 测试: platforms ==="
docker exec zscx-web node -e "const http=require('http');http.get('http://localhost:3000/api/auth/third-party/platforms',(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>console.log(d))}).on('error',e=>console.log('ERR:',e.message))" 2>&1

echo "=== API 测试: login page ==="
docker exec zscx-web node -e "const http=require('http');http.get('http://localhost:3000/login',(res)=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{const hasFeishu=d.includes('飞书')||d.includes('feishu');console.log('Has feishu button:', hasFeishu);if(!hasFeishu)console.log('Page snippet:',d.slice(0,500))})}).on('error',e=>console.log('ERR:',e.message))" 2>&1

echo "=== MySQL 数据检查 ==="
docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "SELECT * FROM zscx.IntegrationConfig\\\\G" 2>&1 | grep -v Warning
  `, (err, s) => {
    let out = '';
    s.on('data', d => out += d);
    s.stderr.on('data', d => out += d);
    s.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.log('ERR:', e.message));