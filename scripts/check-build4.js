const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  c.exec('ps aux | grep -E "chown|runc" | grep -v grep', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out || 'No chown/runc procs'); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
