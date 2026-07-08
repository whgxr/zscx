import paramiko
import os

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865', timeout=60)

def run(cmd, timeout=60):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    return out, err

# Upload changed files only
local_files = [
    ('web/components/dynamic-form.tsx', '/vol3/1000/docker/zscx/web/components/dynamic-form.tsx'),
]

sftp = ssh.open_sftp()
for local, remote in local_files:
    local_path = os.path.join(r'd:\开发征收项目\zscx', local)
    if os.path.exists(local_path):
        print(f"Uploading {local}...")
        sftp.put(local_path, remote)
sftp.close()

# Build with cache
print("\n=== Starting build with cache ===")
cmd = "docker compose -f /vol3/1000/docker/zscx/docker/docker-compose.yml build web"
stdin, stdout, stderr = ssh.exec_command(f"echo Thomas009865 | sudo -S {cmd}", timeout=300)

import select
while True:
    if stdout.channel.exit_status_ready():
        break
    if select.select([stdout.channel], [], [], 1)[0]:
        line = stdout.readline()
        if line:
            print(line.strip())

exit_status = stdout.channel.recv_exit_status()
print(f"\nBuild exit status: {exit_status}")

if exit_status == 0:
    print("\n=== Restarting containers ===")
    out, err = run("echo Thomas009865 | sudo -S docker compose -f /vol3/1000/docker/zscx/docker/docker-compose.yml up -d 2>&1")
    print(out.strip())

    out, err = run("echo Thomas009865 | sudo -S docker ps --filter name=zscx --format '{{.Names}} {{.Status}}'")
    print("\n=== Containers ===")
    print(out.strip())

ssh.close()
