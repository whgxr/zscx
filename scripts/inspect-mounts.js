/**
 * 用 JSON 获取容器端口/卷信息
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
    await execRemote(conn, `docker inspect zscx-mysql --format '{{json .HostConfig.PortBindings}}'; docker inspect zscx-mysql --format '{{json .Mounts}}'`)
    await execRemote(conn, `docker inspect zscx-web --format '{{json .HostConfig.PortBindings}}'; docker inspect zscx-web --format '{{json .Mounts}}'; docker inspect zscx-web --format '{{json .Config.Cmd}} {{json .HostConfig.RestartPolicy}}'`)
    await execRemote(conn, `docker volume ls`)
  } finally {
    conn.end()
  }
}
main().catch(err => { console.error('❌', err.message); process.exit(1) })
