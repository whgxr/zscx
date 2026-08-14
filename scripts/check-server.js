const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', () => {
  // 把本地 web 目录的完整文件打包上传到服务器，然后在服务器上用 docker build 重建
  // 这里先测试 docker build 能否正常运行
  c.exec('cd /vol2/1000/docker/zscx && ls -la web/ 2>&1 | head -20', (err, s) => {
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => { console.log(out); if (errOut) console.log('ERR:', errOut); c.end() })
  })
})
c.on('error', e => console.error('ERR:', e.message))
