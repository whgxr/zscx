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

  // 导出 zscx 数据库
  console.log('==== 导出 zscx 数据库 ====')
  let r = await run('docker exec zscx-mysql mysqldump -uroot -proot123456 --single-transaction --skip-lock-tables --routines --triggers zscx > /tmp/zscx-dump.sql 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 检查 dump 文件
  r = await run('ls -lh /tmp/zscx-dump.sql 2>&1')
  console.log('\n==== Dump 文件 ====')
  console.log(r.out || r.errOut)

  // 查看 dump 的前几行
  r = await run('head -20 /tmp/zscx-dump.sql 2>&1')
  console.log('\n==== Dump 前20行 ====')
  console.log(r.out)

  // 查看 dump 中有哪些表
  r = await run('grep -o "CREATE TABLE \\\`[a-zA-Z0-9_]*\\\`" /tmp/zscx-dump.sql 2>&1')
  console.log('\n==== 包含的表 ====')
  console.log(r.out)

  // 停掉 MySQL
  console.log('\n==== 停掉 recovery MySQL ====')
  r = await run('docker rm -f zscx-mysql 2>&1; echo done')
  console.log(r.out.trim())

  // 备份旧数据目录
  r = await run('mv /vol2/docker/volumes/zscx_mysql_data /vol2/docker/volumes/zscx_mysql_data_recovery 2>&1; echo done')
  console.log('\n==== 旧数据目录已重命名 ====')
  console.log(r.out.trim())

  c.end()
})
