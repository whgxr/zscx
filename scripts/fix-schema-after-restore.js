const { Client } = require('ssh2')
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

  console.log('==== 1. 先修复 MySQL explicit_defaults_for_timestamp ====')
  let r = await run('docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "SET GLOBAL explicit_defaults_for_timestamp = 1;" 2>&1')
  console.log(r.out || r.errOut || 'done')

  // 尝试再次运行 prisma db push
  console.log('\n==== 2. 再次尝试同步 schema ====')
  r = await run('docker exec zscx-web sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"')
  console.log(r.out || r.errOut)

  // 如果还是失败，手动添加列
  console.log('\n==== 3. 检查 snapshotId 列是否存在 ====')
  r = await run('docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "SHOW COLUMNS FROM zscx.OperationLog LIKE \'snapshotId\';" 2>&1')
  console.log(r.out || r.errOut)

  if (!r.out || !r.out.includes('snapshotId')) {
    console.log('\n==== 4. 手动添加 snapshotId 列 ====')
    r = await run('docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "ALTER TABLE zscx.OperationLog ADD COLUMN snapshotId INT NULL, ADD INDEX idx_operationlog_snapshotId (snapshotId);" 2>&1')
    console.log(r.out || r.errOut || 'done')

    // 检查其他可能缺失的列
    console.log('\n==== 5. 检查其他可能缺失的列 ====')
    r = await run('docker exec zscx-web sh -c "cd /app && npx prisma db push --accept-data-loss 2>&1"')
    console.log(r.out || r.errOut)
  }

  console.log('\n==== 6. 验证 OperationLog 表结构 ====')
  r = await run('docker exec zscx-mysql mysql -uzscx -pzscx123456 -e "DESCRIBE zscx.OperationLog;" 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n==== 7. 重启 web 容器 ====')
  r = await run('docker restart zscx-web 2>&1')
  console.log(r.out || r.errOut)

  console.log('\n==== 完成！等待重启后测试 ====')
  c.end()
})