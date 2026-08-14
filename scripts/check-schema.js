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

  // 查看实际表结构
  console.log('==== 查看实际表结构 ====')
  let r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW CREATE TABLE zscx.Role\\G\" 2>&1")
  console.log('Role:', r.out)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW CREATE TABLE zscx.User\\G\" 2>&1")
  console.log('User:', r.out)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SHOW CREATE TABLE zscx.SystemSetting\\G\" 2>&1")
  console.log('SystemSetting:', r.out)

  c.end()
})
