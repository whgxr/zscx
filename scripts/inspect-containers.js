/**
 * 获取现有容器的环境变量与端口映射，用于重建 compose 配置
 */
const { Client } = require('ssh2')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
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
    await execRemote(conn, `echo "=== MYSQL ENV ==="; docker inspect zscx-mysql --format '{{range .Config.Env}}{{println .}}{{end}}'`)
    await execRemote(conn, `echo "=== MYSQL PORTS/VOLUMES ==="; docker inspect zscx-mysql --format 'Ports: {{json .HostConfig.PortBindings}} | Volumes: {{json .HostConfig.Binds}} | Mounts: {{range .Mounts}}{{.Name}}->{{.MountPoint}} {{end}}'`)
    await execRemote(conn, `echo "=== WEB ENV ==="; docker inspect zscx-web --format '{{range .Config.Env}}{{println .}}{{end}}'`)
    await execRemote(conn, `echo "=== WEB PORTS/VOLUMES/CMD ==="; docker inspect zscx-web --format 'Ports: {{json .HostConfig.PortBindings}} | Mounts: {{range .Mounts}}{{.Name}}->{{.MountPoint}} {{end}} | Cmd: {{json .Config.Cmd}}'`)
    await execRemote(conn, `echo "=== VOLUMES ==="; docker volume ls | grep -i zscx`)
  } finally {
    conn.end()
  }
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
