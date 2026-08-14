const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 })
c.on('ready', () => {
  c.exec('grep -n "COUNTERSIGNING\\|APPROVING\\|PENDING" /vol2/1000/docker/zscx/web/app/api/approval/v2/instances/route.ts | head -20', (err, s) => {
    if (err) { console.error(err); c.end(); return }
    let out = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => out += d.toString())
    s.on('close', () => { console.log(out); c.end() })
  })
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })