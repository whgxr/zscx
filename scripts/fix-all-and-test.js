const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const c = new Client()
c.connect({ host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD', readyTimeout: 15000 })
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

  // 先检查是否有其他 schema 不匹配
  console.log('==== 列出所有缺失的列 ====')
  let r = await run("docker exec zscx-mysql mysql -uzscx -pzscx123456 -e \"SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='zscx' AND COLUMN_NAME='updatedAt' AND COLUMN_DEFAULT IS NULL;\" 2>&1")
  console.log(r.out || r.errOut)

  // 检查哪些表有 updatedAt 但默认值不是 CURRENT_TIMESTAMP
  console.log('\n==== 检查 updatedAt 默认值 ====')
  r = await run("docker exec zscx-mysql mysql -uzscx -pzscx123456 -e \"SELECT TABLE_NAME, COLUMN_NAME, COLUMN_DEFAULT, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='zscx' AND COLUMN_NAME='updatedAt';\" 2>&1")
  console.log(r.out || r.errOut)

  // 尝试用 mysqld --explicit-defaults-for-timestamp 来修复
  console.log('\n==== 使用 docker-migrate 脚本修复 schema ====')
  r = await run('docker exec zscx-web sh -c "cd /app && node prisma/docker-migrate.js 2>&1"')
  console.log(r.out || r.errOut)

  // 再试 prisma db push
  console.log('\n==== 再次尝试 prisma db push ====')
  r = await run('docker exec zscx-web sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"')
  console.log(r.out || r.errOut)

  // 用 Node.js 测试登录
  console.log('\n==== 用 Node.js 测试登录 ====')
  // 写一个测试脚本到容器
  const testCode = `const http = require("http");
const data = JSON.stringify({username:"admin",password:"admin123"});
const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/auth/login",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data)
  }
};
const req = http.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => body += chunk);
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", body);
  });
});
req.on("error", (e) => console.error("Error:", e.message));
req.write(data);
req.end();
`
  fs.writeFileSync('/tmp/test-login2.js', testCode)
  c.sftp((err, sftp) => {
    if (err) { console.log('SFTP error:', err.message); c.end(); return }
    sftp.fastPut('/tmp/test-login2.js', '/tmp/test-login2.js', {}, (err) => {
      if (err) { console.log('SFTP put error:', err.message); c.end(); return }
      c.exec('docker cp /tmp/test-login2.js zscx-web:/tmp/test-login2.js 2>&1', (err, s) => {
        if (err) { console.log(err.message); c.end(); return }
        let out = ''
        s.on('data', d => out += d)
        s.stderr.on('data', d => out += d)
        s.on('close', () => {
          c.exec('docker exec zscx-web node /tmp/test-login2.js 2>&1', (err, s) => {
            if (err) { console.log(err.message); c.end(); return }
            let out = ''
            s.on('data', d => out += d)
            s.stderr.on('data', d => out += d)
            s.on('close', () => {
              console.log(out)
              c.end()
            })
          })
        })
      })
    })
  })
})