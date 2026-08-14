const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // 查看 docker build 的详细进程信息、是否有子进程
  c.exec('ps -ef | grep -E "docker|node|next|npm" | grep -v grep | head -30', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
