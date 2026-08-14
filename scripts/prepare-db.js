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

  // docker-compose 用的是 mysql_data 卷名
  // 检查当前卷
  console.log('==== Docker 卷 ====')
  let r = await run('docker volume ls | grep zscx')
  console.log(r.out)

  // 查看 mysql_data 是否存在
  r = await run('docker volume inspect mysql_data 2>&1')
  console.log('\nmysql_data 卷:', r.out)

  r = await run('docker volume inspect zscx_mysql_data 2>&1')
  console.log('zscx_mysql_data 卷:', r.out)

  // 如果没有 mysql_data，就把 zscx_mysql_data 重命名
  // Docker 不支持直接重命名卷，需要用临时容器
  // 但实际上 docker-compose 会创建 mysql_data 卷
  // 解决方案：将 zscx_mysql_data 的内容复制到 mysql_data

  // 先创建 mysql_data 卷
  r = await run('docker volume create mysql_data 2>&1')
  console.log('\n创建 mysql_data:', r.out)

  // 用临时容器复制数据
  console.log('\n==== 复制数据到 mysql_data ====')
  r = await run('docker run --rm -v zscx_mysql_data:/from -v mysql_data:/to alpine sh -c "cp -a /from/. /to/" 2>&1')
  console.log('复制:', r.out || r.errOut || 'done')

  // 创建 compose 需要的数据库用户
  console.log('\n==== 创建数据库用户 ====')
  const createUserSQL = `
CREATE USER IF NOT EXISTS 'zscx'@'%' IDENTIFIED BY 'zscx123456';
GRANT ALL PRIVILEGES ON zscx.* TO 'zscx'@'%';
FLUSH PRIVILEGES;
`
  const b64 = Buffer.from(createUserSQL).toString('base64')
  r = await run(`echo '${b64}' | base64 -d | docker exec -i zscx-mysql-init mysql -uroot -proot123456 2>&1`)
  console.log('用户创建:', r.out || r.errOut || 'done')

  // 验证用户
  console.log('\n==== 验证用户 ====')
  r = await run("docker exec zscx-mysql-init mysql -uzscx -pzscx123456 -e \"SELECT 1;\" 2>&1")
  console.log('zscx 用户连通:', r.out || r.errOut)

  c.end()
})
