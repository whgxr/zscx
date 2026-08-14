const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // 查看 clean 镜像中 tsconfig、next.config、以及 package.json 的 start 脚本
  c.exec('docker run --rm zscx-web:clean sh -c "cat /app/tsconfig.json; echo ===NEXT===; cat /app/next.config.js; echo ===PKG===; cat /app/package.json"', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
