import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('REDACTED_IP', port=22, username='REDACTED_USER', password='REDACTED_PASSWORD')

print("=== Waiting for container to start ===")
time.sleep(10)

print("\n=== Checking container status ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'REDACTED_PASSWORD' | sudo -S docker ps 2>&1
""")
print(stdout.read().decode())

print("\n=== Checking container logs (last 20 lines) ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'REDACTED_PASSWORD' | sudo -S docker logs zscx-web --tail 20 2>&1
""")
logs = stdout.read().decode()
print(logs)

# Check if there are any prisma errors
if 'prisma:error' in logs or 'does not exist' in logs:
    print("\n❌ Still has errors!")
else:
    print("\n✅ No prisma errors detected!")

ssh.close()