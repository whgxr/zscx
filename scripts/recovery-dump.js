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

  // 检查之前的 dump 文件
  let r = await run('cat /tmp/zscx-dump.sql | head -30')
  console.log('==== zscx-dump.sql 前30行 ====')
  console.log(r.out)

  r = await run('grep -c "CREATE TABLE" /tmp/zscx-dump.sql')
  console.log('\nCREATE TABLE 数量:', r.out.trim())

  r = await run('grep "CREATE TABLE" /tmp/zscx-dump.sql')
  console.log('\n所有 CREATE TABLE:')
  console.log(r.out)

  // 使用一个 trick - 用 mysql镜像但覆盖 ENTRYPOINT
  console.log('\n==== 使用 recovery 启动（带 root 密码 env）====')
  r = await run('docker rm -f zscx-mysql-recovery zscx-mysql 2>/dev/null; echo done')
  console.log('清理:', r.out.trim())

  // 关键：必须有 MYSQL_ROOT_PASSWORD env，让 entrypoint 跳过初始化（因为已有数据）
  r = await run('docker run -d --name zscx-mysql-recovery -e MYSQL_ROOT_PASSWORD=root123456 -v zscx_mysql_data:/var/lib/mysql -p 3306:3306 mysql:5.7 --innodb-force-recovery=4 2>&1')
  console.log('启动:', r.out || r.errOut)

  console.log('等待 25s...')
  await new Promise(res => setTimeout(res, 25000))

  r = await run('docker ps -a --filter name=zscx-mysql-recovery')
  console.log('\n状态:', r.out)

  // 连通性
  r = await run('docker exec zscx-mysql-recovery mysql -uroot -proot123456 -e "SELECT 1" 2>&1')
  console.log('连通性:', r.out || r.errOut)

  // 如果连通，导出
  if (r.out.includes('1')) {
    console.log('\n==== 导出 ====')
    r = await run('docker exec zscx-mysql-recovery mysqldump -uroot -proot123456 --single-transaction zscx > /tmp/zscx-recovery-dump.sql 2>&1')
    console.log(r.out || r.errOut || 'done')

    r = await run('wc -l /tmp/zscx-recovery-dump.sql')
    console.log('dump 行数:', r.out)
  }

  c.end()
})
