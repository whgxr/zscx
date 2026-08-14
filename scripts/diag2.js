const { Client } = require('ssh2')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' })
c.on('ready', async () => {
  const run = (cmd) => new Promise((res, rej) => {
    c.exec(cmd, (err, s) => {
      if (err) return rej(err)
      let out = '', errOut = ''
      s.on('data', d => out += d.toString())
      s.stderr.on('data', d => errOut += d.toString())
      s.on('close', () => res({ out, errOut }))
    })
  })

  // 测试容器内访问
  let r = await run('docker exec zscx-web wget -qO- http://localhost:3000/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('==== 容器内 API 测试 ====')
  console.log(r.out || r.errOut)

  // 测试宿主机访问
  r = await run('wget -qO- http://localhost:777/api/auth/third-party/platforms 2>&1 || echo NO')
  console.log('\n==== 宿主机 API 测试 ====')
  console.log(r.out || r.errOut)

  // 查看端口映射
  r = await run('docker port zscx-web 2>&1')
  console.log('\n==== 端口映射 ====')
  console.log(r.out || r.errOut)

  // 查看 docker 网络
  r = await run('docker network inspect zscx_default 2>&1 | head -50')
  console.log('\n==== 网络信息 ====')
  console.log(r.out)

  c.end()
})
c.on('error', e => console.error('ERR:', e.message))
