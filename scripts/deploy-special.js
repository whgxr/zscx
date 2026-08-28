/**
 * 部署：列表页发起审批锁定对应记录 → build → 重建 web
 * _temporary_
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const CONFIG = { host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD' }
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DIR = '/vol2/1000/docker/zscx'

const FILES = [
  ['web/app/h5/(main)/projects/[tableName]/data-list-client.tsx', 'web/app/h5/(main)/projects/[tableName]/data-list-client.tsx'],
]

function mkdirp(sftp, dir) {
  return new Promise((res, rej) => sftp.mkdir(dir, { recursive: true }, (e) => (e && e.code !== 4 ? rej(e) : res())))
}
function upload(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      mkdirp(sftp, path.posix.dirname(remote)).then(() => {
        const rs = fs.createReadStream(local)
        const ws = sftp.createWriteStream(remote)
        rs.on('error', reject); ws.on('error', reject)
        ws.on('close', resolve); rs.pipe(ws)
      }).catch(reject)
    })
  })
}
function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${cmd}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      stream.on('data', (d) => process.stdout.write(d))
      stream.stderr.on('data', (d) => process.stdout.write(d))
      stream.on('close', () => resolve())
    })
  })
}
async function main() {
  const conn = new Client()
  await new Promise((res, rej) => { conn.on('ready', res); conn.on('error', rej); conn.connect({ host: CONFIG.host, port: CONFIG.port, username: CONFIG.username, password: CONFIG.password, readyTimeout: 15000 }) })
  console.log('SSH ok')
  try {
    console.log('\n== 上传 ==')
    await upload(conn, path.join(PROJECT_ROOT, FILES[0][0]), `${DIR}/${FILES[0][1]}`)
    await execRemote(conn, `grep -c 'approvalTarget' ${DIR}/web/app/h5/'(main)'/projects/'[tableName]'/data-list-client.tsx`)
    console.log('\n== 重建镜像 ==')
    await execRemote(conn, `cd ${DIR}/web && docker build -t zscx-web:local .`)
    console.log('\n== compose 重建 web ==')
    await execRemote(conn, `cd ${DIR}/docker && docker compose up -d --no-build web`)
    await execRemote(conn, `sleep 20; docker ps --filter "name=zscx-web" --format "{{.Names}} {{.Status}}"`)
    await execRemote(conn, `docker logs --tail 10 zscx-web 2>&1 | grep -iE 'ready|error' | tail`)
  } finally { conn.end() }
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1) })