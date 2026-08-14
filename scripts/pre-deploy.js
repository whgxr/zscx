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

  // 1. 清理临时容器
  console.log('==== 清理临时容器 ====')
  let r = await run('docker rm -f zscx-mysql-init zscx-mysql zscx-web 2>/dev/null; echo done')
  console.log(r.out.trim())

  // 2. 确认目录
  console.log('\n==== 确认目录 ====')
  r = await run('cd /vol2/1000/docker/zscx && ls -la')
  console.log(r.out)

  // 3. 查看 docker-compose.yml
  r = await run('cd /vol2/1000/docker/zscx && cat docker/docker-compose.yml')
  console.log('\ndocker-compose.yml:')
  console.log(r.out)

  // 4. 验证 mysql_data 卷内容
  console.log('\n==== 验证 mysql_data 卷 ====')
  r = await run('docker run --rm -v mysql_data:/data alpine ls /data/')
  console.log('mysql_data 内容:', r.out)

  c.end()
})
