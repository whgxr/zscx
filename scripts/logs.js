const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // 查看 zscx-web 日志的完整输出
  c.exec('docker logs --tail 80 zscx-web 2>&1', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
