import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

print("=== Starting Docker rebuild ===")
print("This will take 2-5 minutes...")

# 使用 sudo 执行 docker compose
cmd = "echo 'Thomas009865' | sudo -S bash -c 'cd /vol3/1000/docker/zscx/docker && docker compose up -d --build' 2>&1"
stdin, stdout, stderr = ssh.exec_command(cmd)

output = ""
while True:
    line = stdout.readline()
    if not line:
        break
    output += line
    if any(keyword in line for keyword in ['ERROR', 'error', 'Error', 'Failed', 'failed', '✓', 'Done', 'Step', '=>', 'Building']):
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
    print("\nLast 80 lines of output:")
    for line in lines[-80:]:
        print(line)

ssh.close()
