import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

print("=== Waiting for container ===")
time.sleep(10)

stdin, stdout, stderr = ssh.exec_command("echo 'Thomas009865' | sudo -S docker ps 2>&1 | grep zscx")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("echo 'Thomas009865' | sudo -S docker logs zscx-web --tail 5 2>&1")
print(stdout.read().decode())

ssh.close()
