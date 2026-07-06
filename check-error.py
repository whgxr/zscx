import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.7', port=22, username='zhaowei', password='Thomas009865')

print("=== Checking container logs ===")
stdin, stdout, stderr = ssh.exec_command("echo 'Thomas009865' | sudo -S docker logs zscx-web --tail 100 2>&1")
logs = stdout.read().decode()
print(logs)

print("\n=== Checking error logs from database ===")
stdin, stdout, stderr = ssh.exec_command("""
echo 'Thomas009865' | sudo -S docker exec zscx-mysql mysql -uroot -proot123 zscx -e "SELECT * FROM ErrorLog ORDER BY createdAt DESC LIMIT 5;" 2>&1
""")
db_logs = stdout.read().decode()
print(db_logs)

ssh.close()