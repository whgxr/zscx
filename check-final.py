import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('REDACTED_IP', port=22, username='REDACTED_USER', password='REDACTED_PASSWORD')

print("=== Waiting for container ===")
time.sleep(10)

stdin, stdout, stderr = ssh.exec_command("echo 'REDACTED_PASSWORD' | sudo -S docker ps 2>&1 | grep zscx")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("echo 'REDACTED_PASSWORD' | sudo -S docker logs zscx-web --tail 5 2>&1")
print(stdout.read().decode())

ssh.close()
