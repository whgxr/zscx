import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

# 检查TableCategory表是否存在以及是否有数据
print("=== Checking TableCategory table ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "SHOW TABLES LIKE '%ategor%';" 2>&1
""")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "SELECT * FROM TableCategory;" 2>&1
""")
print(stdout.read().decode())

# 检查DataTable的categoryId字段
print("=== Checking DataTable categoryId ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "DESCRIBE DataTable;" 2>&1 | grep -i category
""")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uzscx -pzscx123456 zscx -e "SELECT id, name, label, categoryId FROM DataTable;" 2>&1
""")
print(stdout.read().decode())

ssh.close()