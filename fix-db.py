import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

# 先检查DataTable表结构
print("=== Checking DataTable table structure ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "DESCRIBE DataTable;" 2>&1
""")
print(stdout.read().decode())

# 手动添加formLayoutConfig字段
print("\n=== Adding formLayoutConfig column manually ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "ALTER TABLE DataTable ADD COLUMN formLayoutConfig JSON NULL;" 2>&1
""")
result = stdout.read().decode()
print(result)

# 再次检查表结构
print("\n=== Checking DataTable after ALTER ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "DESCRIBE DataTable;" 2>&1
""")
print(stdout.read().decode())

# 重启web容器
print("\n=== Restarting web container ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker restart zscx-web 2>&1
""")
print(stdout.read().decode())

ssh.close()