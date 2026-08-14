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

  // 检查所有表的行数
  console.log('==== 各表行数 ====')
  const tables = ['User', 'Role', 'DataTable', 'DataRecord', 'SystemSetting', 'Notification', 'ApprovalWorkflow', 'ApprovalInstance']
  for (const t of tables) {
    const r = await run(`docker exec zscx-mysql-init mysql -uroot -proot123456 -e "SELECT COUNT(*) as cnt FROM zscx.${t};" 2>&1`)
    console.log(`${t}: ${r.out.match(/\d+/)?.[0] || 'error'}`)
  }

  // 查看 dump 中是否有任何 INSERT 语句
  console.log('\n==== dump 中 INSERT 语句 ====')
  const r = await run("grep 'INSERT INTO' /tmp/zscx-dump.sql | head -30")
  console.log(r.out)

  c.end()
})
