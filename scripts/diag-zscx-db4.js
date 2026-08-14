const { Client } = require('ssh2')
const c = new Client()
const run = (conn, cmd) => new Promise((res, rej) => {
  conn.exec(cmd, (err, s) => {
    if (err) return rej(err)
    let out = '', errOut = ''
    s.on('data', d => out += d.toString())
    s.stderr.on('data', d => errOut += d.toString())
    s.on('close', () => res({ out, errOut }))
  })
})
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    // 读取真实 .env 密码
    let r = await run(c, 'cat /vol2/1000/docker/zscx/docker-nas/.env')
    console.log('==== .env 实际内容 ====')
    console.log(r.out || r.errOut)

    // 提取 root 密码和 zscx 密码
    const mRoot = r.out.match(/MYSQL_ROOT_PASSWORD=(.+)/)
    const mUser = r.out.match(/MYSQL_USER=(.+)/)
    const mPass = r.out.match(/MYSQL_PASSWORD=(.+)/)
    const rootPw = mRoot ? mRoot[1].trim() : 'root123456'
    const userPw = mPass ? mPass[1].trim() : 'zscx123456'
    console.log('\nroot 密码: ' + rootPw)

    console.log('\n==== 2. 用真实密码连接当前卷 ====')
    r = await run(c, `docker exec zscx-mysql sh -c 'mysql -uroot -p${rootPw} zscx -e "SHOW TABLES;"'`)
    console.log(r.out || r.errOut || '(查询返回空)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })