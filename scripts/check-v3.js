const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // v3 镜像中 lib 目录、以及 login 页面是否存在
  c.exec('docker run --rm zscx-web:v3 sh -c "ls -la /app/lib/ 2>&1; echo ===; ls /app/app/login/ 2>&1; echo ===; cat /app/lib/prisma.ts 2>&1"', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
