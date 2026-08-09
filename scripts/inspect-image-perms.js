/**
 * 检查镜像内 /app/prisma 文件权限与运行用户
 */
const { Client } = require('ssh2')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }

function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stderr.write(d))
      stream.on('close', () => resolve())
    })
  })
}

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  try {
    await execRemote(conn, `docker run --rm --entrypoint sh zscx-web:local -c "id; ls -la /app/prisma | head -20"`)
    await execRemote(conn, `docker run --rm --entrypoint sh zscx-web:local -c "ls -ld /app /app/node_modules /app/.next; ls /app/node_modules/.prisma/client 2>/dev/null | head -5"`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
