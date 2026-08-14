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

  // 检查 User 表结构
  console.log('==== User 表结构 ====')
  let r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"DESCRIBE zscx.User;\" 2>&1")
  console.log(r.out)

  // 检查 dump 中的 User 数据
  console.log('==== dump 中的 User INSERT ====')
  r = await run("grep -A5 'INSERT INTO.*User' /tmp/zscx-dump.sql | head -20")
  console.log(r.out)

  // 看看 UserSession 有没有数据
  console.log('\n==== UserSession 记录 ====')
  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT COUNT(*) as cnt FROM zscx.UserSession;\" 2>&1")
  console.log(r.out)

  r = await run("docker exec zscx-mysql-init mysql -uroot -proot123456 -e \"SELECT * FROM zscx.User LIMIT 10;\" 2>&1")
  console.log('Users:', r.out || r.errOut)

  c.end()
})
