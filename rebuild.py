import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

local_base = r"D:\开发征收项目\zscx\web"
remote_base = "/vol3/1000/docker/zscx/web"

# 上传修复的PDF route
file_path = "app/api/export/[tableName]/pdf/route.ts"
local_path = os.path.join(local_base, file_path.replace("/", os.sep))
remote_path = f"{remote_base}/{file_path}"

sftp = ssh.open_sftp()
sftp.put(local_path, remote_path)
sftp.close()
print(f"Uploaded: {file_path}")

# 重新构建
print("\n=== Starting Docker rebuild ===")
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
else:
    print("❌ Build failed!")
    lines = output.strip().split('\n')
    for line in lines[-50:]:
        print(line)

ssh.close()