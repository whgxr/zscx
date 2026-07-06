import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

local_base = r"D:\开发征收项目\zscx\web"
remote_base = "/vol3/1000/docker/zscx/web"

# 只上传修复的文件
files_to_upload = [
    "app/api/export/[tableName]/preview/route.ts",
    "app/api/permissions/[userId]/route.ts",
    "app/api/version-logs/route.ts",
    "components/export/export-dialog.tsx",
    "prisma/schema.prisma",
    "prisma/seed.ts",
    "prisma/docker-migrate.js",
    "prisma/migrate.js",
]

sftp = ssh.open_sftp()
success_count = 0

for rel_path in files_to_upload:
    local_path = os.path.join(local_base, rel_path.replace("/", os.sep))
    remote_path = f"{remote_base}/{rel_path}"
    
    remote_dir = os.path.dirname(remote_path)
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        stdin, stdout, stderr = ssh.exec_command(f"mkdir -p '{remote_dir}'")
        stdout.read()
    
    try:
        sftp.put(local_path, remote_path)
        success_count += 1
        print(f"  [{success_count}/{len(files_to_upload)}] Uploaded: {rel_path}")
    except Exception as e:
        print(f"  FAILED: {rel_path} - {e}")

sftp.close()
print(f"\nUploaded {success_count}/{len(files_to_upload)} files")

# 重新构建
print("\n=== Starting Docker rebuild ===")
print("This will take 2-5 minutes...")

cmd = "echo 'Thomas009865' | sudo -S bash -c 'cd /vol3/1000/docker/zscx/docker && docker compose up -d --build' 2>&1"
stdin, stdout, stderr = ssh.exec_command(cmd)

output = ""
while True:
    line = stdout.readline()
    if not line:
        break
    output += line
    if any(keyword in line for keyword in ['ERROR', 'error', 'Error', 'Failed', 'failed', '✓', 'Done', 'Building', '=>', 'Starting']):
        print(line.rstrip())

exit_status = stdout.channel.recv_exit_status()
print(f"\n=== Build exit status: {exit_status} ===")

if exit_status == 0:
    print("✅ Build successful!")
    stdin2, stdout2, stderr2 = ssh.exec_command("echo 'Thomas009865' | sudo -S docker compose -f /vol3/1000/docker/zscx/docker/docker-compose.yml ps 2>&1")
    print("\nContainer status:")
    print(stdout2.read().decode())
else:
    print("❌ Build failed!")
    lines = output.strip().split('\n')
    print("\nLast 100 lines of output:")
    for line in lines[-100:]:
        print(line)

ssh.close()
