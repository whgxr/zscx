/**
 * 部署脚本：将项目上传到测试服务器并构建 Docker 镜像
 *
 * 用法：node deploy-to-server.js
 */
const { Client } = require('ssh2')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const CONFIG = {
  host: 'REDACTED_IP',
  port: 22,
  username: 'REDACTED_USER',
  password: 'REDACTED_PASSWORD',
  remotePath: '/vol2/1000/docker/zscx',
}

const PROJECT_ROOT = path.resolve(__dirname, '..')

// ── Step 1: 创建 tar.gz 包（排除 node_modules, .next, .git） ──
function createArchive() {
  const tarPath = path.join(__dirname, 'zscx-deploy.tar.gz')
  console.log('📦 正在打包项目...')
  
  // 使用 tar 命令打包（Windows 上通常有 Git Bash 自带的 tar）
  try {
    execSync(
      `tar -czf "${tarPath}" ` +
      `--exclude="node_modules" ` +
      `--exclude=".next" ` +
      `--exclude=".git" ` +
      `--exclude="*.tar.gz" ` +
      `-C "${path.dirname(PROJECT_ROOT)}" ` +
      `"${path.basename(PROJECT_ROOT)}"`,
      { stdio: 'pipe', timeout: 120000 }
    )
  } catch (e) {
    // 如果系统 tar 不可用，尝试用 PowerShell
    console.log('系统 tar 不可用，尝试 PowerShell Compress-Archive...')
    execSync(
      `powershell -Command "Compress-Archive -Path '${PROJECT_ROOT}\\*' -DestinationPath '${tarPath}' -Force"`,
      { stdio: 'pipe', timeout: 120000 }
    )
  }
  
  const stats = fs.statSync(tarPath)
  const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
  console.log(`✅ 打包完成：${sizeMB} MB`)
  return tarPath
}

// ── Step 2: 通过 SFTP 上传 ──
function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)

      const fileSize = fs.statSync(localPath).size
      let uploaded = 0

      const readStream = fs.createReadStream(localPath)
      const writeStream = sftp.createWriteStream(remotePath)

      readStream.on('data', (chunk) => {
        uploaded += chunk.length
        const pct = ((uploaded / fileSize) * 100).toFixed(0)
        process.stdout.write(`\r📤 上传中... ${pct}%`)
      })

      writeStream.on('close', () => {
        console.log('\n✅ 上传完成')
        resolve()
      })

      writeStream.on('error', reject)
      readStream.on('error', reject)

      readStream.pipe(writeStream)
    })
  })
}

// ── Step 3: 执行远程命令 ──
function execRemote(conn, cmd) {
  return new Promise((resolve, reject) => {
    console.log(`🖥️  执行: ${cmd}`)
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      
      let stdout = ''
      let stderr = ''
      
      stream.on('data', (data) => {
        stdout += data.toString()
        process.stdout.write(data)
      })
      stream.stderr.on('data', (data) => {
        stderr += data.toString()
        process.stderr.write(data)
      })
      stream.on('close', (code) => {
        resolve({ stdout, stderr, code })
      })
    })
  })
}

// ── Step 4: 确保远程目录存在 ──
function ensureRemoteDir(sftp, dirPath) {
  return new Promise((resolve, reject) => {
    sftp.stat(dirPath, (err) => {
      if (err) {
        // 目录不存在，递归创建
        const parent = path.posix.dirname(dirPath)
        ensureRemoteDir(sftp, parent).then(() => {
          sftp.mkdir(dirPath, (err2) => {
            if (err2 && err2.code !== 4) reject(err2) // code 4 = already exists
            else resolve()
          })
        }).catch(reject)
      } else {
        resolve()
      }
    })
  })
}

// ── 主流程 ──
async function main() {
  console.log('🚀 开始部署到测试服务器...')
  console.log(`   服务器: ${CONFIG.username}@${CONFIG.host}`)
  console.log(`   目标路径: ${CONFIG.remotePath}`)
  console.log('')

  // 1. 打包
  const tarPath = createArchive()

  // 2. 连接 SSH
  console.log('🔗 连接服务器...')
  const conn = new Client()
  
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve)
    conn.on('error', reject)
    conn.connect({
      host: CONFIG.host,
      port: CONFIG.port,
      username: CONFIG.username,
      password: CONFIG.password,
      readyTimeout: 10000,
    })
  })
  console.log('✅ SSH 连接成功')

  try {
    // 3. 确保远程目录存在
    console.log('📁 检查远程目录...')
    await execRemote(conn, `mkdir -p ${CONFIG.remotePath}`)

    // 4. 上传
    const remoteTar = `${CONFIG.remotePath}/zscx-deploy.tar.gz`
    await uploadFile(conn, tarPath, remoteTar)

    // 5. 解压（先清空目录，避免残留已删除的旧文件；保留 docker/.env 和 docker-nas/.env 服务器配置）
    console.log('\n📂 清空旧代码并解压到目标目录...')
    await execRemote(conn, `cd ${CONFIG.remotePath} && cp docker/.env /tmp/zscx-docker-env 2>/dev/null; cp docker-nas/.env /tmp/zscx-nas-env 2>/dev/null; ls -A | grep -v zscx-deploy.tar.gz | xargs -r rm -rf && tar -xzf zscx-deploy.tar.gz --strip-components=1 && rm zscx-deploy.tar.gz; [ -f /tmp/zscx-docker-env ] && cp /tmp/zscx-docker-env docker/.env && rm /tmp/zscx-docker-env; [ -f /tmp/zscx-nas-env ] && cp /tmp/zscx-nas-env docker-nas/.env && rm /tmp/zscx-nas-env; true`)

    // 6. 构建 Docker 镜像（在 docker 目录用 compose build，build context 指向 ../web）
    console.log('\n🐳 构建 Docker 镜像（在 docker 目录）...')
    await execRemote(conn, `cd ${CONFIG.remotePath}/docker && docker compose build web`)

    // 7. 在 docker 目录重启 web 容器（--no-deps 不触碰 mysql/redis/minio，--no-build 使用刚构建的镜像，--force-recreate 强制重建）
    //    注意：必须在 docker 目录而非 docker-nas 目录，因为 web 与 mysql/redis/minio 在同一个 compose 项目网络下
    console.log('\n🚀 重启 web 容器（在 docker 目录，仅 web 服务，与 mysql/redis 同网络）...')
    await execRemote(conn, `cd ${CONFIG.remotePath}/docker && docker compose up -d --no-deps --no-build --force-recreate web`)

    // 8. 检查状态
    console.log('\n📊 服务状态:')
    await execRemote(conn, `cd ${CONFIG.remotePath}/docker && docker compose ps`)

    console.log('\n🎉 部署完成！')
    console.log(`   访问地址: http://${CONFIG.host}:777`)

  } finally {
    conn.end()
    // 清理本地临时文件
    try { fs.unlinkSync(tarPath) } catch {}
  }
}

main().catch(err => {
  console.error('❌ 部署失败:', err.message)
  process.exit(1)
})
