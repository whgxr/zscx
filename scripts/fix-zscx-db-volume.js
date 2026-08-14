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
const sleep = ms => new Promise(r => setTimeout(r, ms))

c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 10000 })
c.on('ready', async () => {
  try {
    console.log('==== 1. 停掉当前容器 ====')
    let r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose down 2>&1')
    console.log(r.out || r.errOut || 'done')

    console.log('\n==== 2. 删除空卷，创建指向真实数据的卷 ====')
    // 删除空的 docker-nas_mysql_data 卷
    r = await run(c, 'docker volume rm docker-nas_mysql_data 2>&1 || true')
    console.log(r.out || r.errOut || 'done')

    // 使用 docker_mysql_data 卷（有真实数据）作为 mysql 数据卷
    // 最简单方案：修改 docker-compose.override.yml 指定外部卷
    r = await run(c, `cat > /vol2/1000/docker/zscx/docker-nas/docker-compose.override.yml << 'OVERRIDE'
services:
  web:
    image: zscx-web:local
volumes:
  mysql_data:
    external: true
    name: docker_mysql_data
OVERRIDE`)
    console.log(r.out || r.errOut || 'done')

    console.log('\n==== 3. 修改 docker-compose.yml 中 volume 引用名称 ====')
    // 把 docker-compose.yml 里 mysql volumes 的 docker-nas_mysql_data 改为 mysql_data
    r = await run(c, "sed -i 's/docker-nas_mysql_data:/mysql_data:/g' /vol2/1000/docker/zscx/docker-nas/docker-compose.yml")
    console.log(r.out || r.errOut || 'done')

    console.log('\n==== 4. 启动服务 ====')
    r = await run(c, 'cd /vol2/1000/docker/zscx/docker-nas && docker compose up -d 2>&1')
    console.log(r.out || r.errOut)

    console.log('\n==== 5. 等待初始化 ====')
    await sleep(45000)

    console.log('\n==== 6. 容器状态 ====')
    r = await run(c, 'docker ps --filter name=zscx --format "{{.Names}}\t{{.Image}}\t{{.Status}}"')
    console.log(r.out || r.errOut)

    console.log('\n==== 7. web 容器日志（最后 80 行）====')
    r = await run(c, 'docker logs --tail 80 zscx-web 2>&1')
    console.log(r.out || r.errOut || '(无日志)')
  } catch (e) {
    console.error('❌ 出错:', e.message)
  } finally { c.end() }
})
c.on('error', e => { console.error('连接失败:', e.message); process.exit(1) })