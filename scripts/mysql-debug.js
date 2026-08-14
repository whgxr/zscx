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

  // 查看 my.cnf
  let r = await run('cat /vol2/1000/docker/zscx/docker/mysql/my.cnf 2>&1')
  console.log('==== my.cnf ====')
  console.log(r.out)

  // 查看 mysql 数据卷目录
  r = await run('docker rm -f zscx-mysql 2>/dev/null; echo done')
  console.log('\n==== 清理容器 ====')
  console.log(r.out.trim())

  // 查看数据卷
  r = await run('docker volume inspect zscx_mysql_data 2>&1')
  console.log('\n==== 数据卷 ====')
  console.log(r.out)

  r = await run('ls /vol2/docker/volumes/zscx_mysql_data/_data/ 2>&1 | head -20')
  console.log('\n==== 数据目录 ====')
  console.log(r.out)

  // 看看 mysql.ibd 是否存在（数据字典表空间文件）
  r = await run('ls -la /vol2/docker/volumes/zscx_mysql_data/_data/mysql/ 2>&1 | head -30')
  console.log('\n==== mysql 系统表空间 ====')
  console.log(r.out)

  // 检查 undo tablespace
  r = await run('ls -la /vol2/docker/volumes/zscx_mysql_data/_data/undo_* 2>&1 || echo "no undo files"')
  console.log('\n==== undo 表空间 ====')
  console.log(r.out)

  c.end()
})
