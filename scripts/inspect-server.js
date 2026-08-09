/**
 * 查看根目录 docker-compose.yml 与 .env
 */
const { Client } = require('ssh2')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
  remotePath: '/vol2/1000/docker/zscx',
}

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
    await execRemote(conn, `ls ${CONFIG.remotePath}/`)
    await execRemote(conn, `cat ${CONFIG.remotePath}/docker-compose.yml`)
    await execRemote(conn, `echo "--- .env ---"; cat ${CONFIG.remotePath}/.env 2>/dev/null || echo "(无根目录 .env)"`)
    await execRemote(conn, `docker images | head -8`)
  } finally {
    conn.end()
  }
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
