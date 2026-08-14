const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // 杀掉当前 build
  c.exec('docker buildx prune -af 2>/dev/null; pkill -f "docker build" 2>/dev/null; pkill -f "buildkit" 2>/dev/null; sleep 3; ps aux | grep -E "docker build|buildkit" | grep -v grep', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log('Remaining procs:'); console.log(out || 'None'); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
