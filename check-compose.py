import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

# 先查看docker-compose.yml内容
print("=== Current docker-compose.yml ===")
stdin, stdout, stderr = ssh.exec_command("cat /vol3/1000/docker/zscx/docker/docker-compose.yml")
print(stdout.read().decode())

ssh.close()
