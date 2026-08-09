/**
 * 完成部署：重建根级 docker-compose.yml 并启动服务
 * - 复用现有卷 docker-nas_mysql_data / docker-nas_uploads / docker-nas_backups（保留数据）
 * - web 使用新构建的 zscx-web:local 镜像
 * - 启动命令：docker-migrate.js + prisma db push（同步结构差异）+ npm start
 */
const { Client } = require('ssh2')

const CONFIG = {
  host: 'REDACTED_IP', port: 22, username: 'REDACTED_USER', password: 'REDACTED_PASSWORD',
  remotePath: '/vol2/1000/docker/zscx',
}

function execRemote(conn, cmd, { quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!quiet) console.log(`\n$ ${cmd.slice(0, 200)}${cmd.length > 200 ? '...' : ''}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let stdout = '', stderr = ''
      stream.on('data', (d) => { stdout += d.toString(); process.stdout.write(d) })
      stream.stderr.on('data', (d) => { stderr += d.toString(); process.stderr.write(d) })
      stream.on('close', (code) => resolve({ stdout, stderr, code }))
    })
  })
}

const ROOT_COMPOSE = `services:
  mysql:
    image: mysql:5.7
    container_name: zscx-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root123456
      MYSQL_DATABASE: zscx
      MYSQL_USER: zscx
      MYSQL_PASSWORD: zscx123456
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --max_connections=1000
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot123456"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    image: zscx-web:local
    container_name: zscx-web
    restart: always
    ports:
      - "777:3000"
    environment:
      - DATABASE_URL=mysql://zscx:zscx123456@mysql:3306/zscx
      - JWT_SECRET=change-this-secret-in-production
      - JWT_EXPIRES_IN=7d
      - UPLOAD_DIR=./public/uploads
      - MAX_FILE_SIZE=10485760
      - NEXT_PUBLIC_APP_NAME=房屋征收调查系统
      - NODE_ENV=production
    depends_on:
      mysql:
        condition: service_healthy
    volumes:
      - uploads:/app/public/uploads
      - backups:/app/backups
    command: sh -c "node prisma/docker-migrate.js && npx prisma db push --accept-data-loss --skip-generate && npm start"

volumes:
  mysql_data:
    external: true
    name: docker-nas_mysql_data
  uploads:
    external: true
    name: docker-nas_uploads
  backups:
    external: true
    name: docker-nas_backups
`

async function main() {
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve); conn.on('error', reject)
    conn.connect({ ...CONFIG, readyTimeout: 10000 })
  })
  console.log('✅ SSH 连接成功')

  try {
    // 1. 写入根级 docker-compose.yml（与现有容器项目名 zscx 一致）
    console.log('\n📝 写入根级 docker-compose.yml...')
    const escaped = ROOT_COMPOSE.replace(/'/g, "'\\''")
    await execRemote(conn, `printf '%s' '${escaped}' > ${CONFIG.remotePath}/docker-compose.yml`)
    await execRemote(conn, `head -5 ${CONFIG.remotePath}/docker-compose.yml`)

    // 2. 启动服务（mysql 配置不变会被保留，web 镜像变更会被重建）
    console.log('\n🚀 启动服务...')
    await execRemote(conn, `cd ${CONFIG.remotePath} && docker compose up -d 2>&1`)

    // 3. 等待启动
    console.log('\n⏳ 等待服务启动...')
    await new Promise(r => setTimeout(r, 20000))

    // 4. 查看状态与 web 日志
    await execRemote(conn, `docker ps --filter "name=zscx" --format "table {{.Names}}\t{{.Status}}"`)
    await execRemote(conn, `docker logs zscx-web --tail 40 2>&1`)
  } finally {
    conn.end()
  }
}

main().catch(err => { console.error('❌ 失败:', err.message); process.exit(1) })
