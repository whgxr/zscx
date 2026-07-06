import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('REDACTED_IP', port=22, username='REDACTED_USER', password='REDACTED_PASSWORD')

# 先查看docker-compose.yml内容
print("=== Current docker-compose.yml ===")
stdin, stdout, stderr = ssh.exec_command("cat /vol3/1000/docker/zscx/docker/docker-compose.yml")
print(stdout.read().decode())

ssh.close()
