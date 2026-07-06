import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('REDACTED_IP', port=22, username='REDACTED_USER', password='REDACTED_PASSWORD')

print("=== Waiting for container to fully start ===")
time.sleep(15)

print("\n=== Container status ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'REDACTED_PASSWORD' | sudo -S docker ps 2>&1 | grep zscx
""")
print(stdout.read().decode())

print("\n=== Recent logs ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'REDACTED_PASSWORD' | sudo -S docker logs zscx-web --tail 30 2>&1
""")
logs = stdout.read().decode()
print(logs)

if 'prisma:error' in logs:
    print("\n❌ Has Prisma errors")
elif 'TypeError' in logs and 'create' in logs:
    print("\n❌ Has PDF fontkit error")
elif 'Ready' in logs:
    print("\n✅ Website is running normally!")
else:
    print("\n⚠️ Check logs for status")

ssh.close()